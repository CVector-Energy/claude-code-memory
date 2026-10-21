# Claude Code Memory Action

Carry [Claude Code](https://claude.com/claude-code)'s auto-memory store between CI runs, so an agent starts each run with what earlier runs learned about the repository instead of meeting it fresh every time. The store lives in S3 and the updated memories are written back at the job-end hook.

## What This Action Does

1. Derives the on-disk path of Claude Code's auto-memory store for this workspace
2. Assumes an IAM role with the job's GitHub OIDC token and downloads the repository's store from S3
3. Registers a post step that writes back what the run changed when the job finishes, pass or fail
4. Reports how many memories were restored, so a workflow can branch on an empty store
5. Optionally snapshots the pre-run store, for a job that must be able to roll back

## Usage

```yaml
jobs:
  agent:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write # assume the memory role
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Restore Claude Code memory
        uses: CVector-Energy/claude-code-memory@main
        with:
          bucket: my-agent-memory-bucket
          role-to-assume: arn:aws:iam::123456789012:role/MyAgentMemory

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: Do the thing.
```

Nothing else is required, and there is nothing to add for a job that fails: the store is restored before the agent runs and saved when the job ends either way.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `bucket` | S3 bucket holding the store; this repository's is under `<owner>/<repo>/memory/` | Yes | |
| `role-to-assume` | IAM role that reads and writes the bucket, assumed with the job's OIDC token | Yes | |
| `aws-region` | Region of the bucket | No | `us-east-1` |
| `snapshot` | Copy the restored store aside before the agent runs, so the caller can roll back to it (see `snapshot-path`). Off by default: the point is that the agent's edits persist. | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `path` | Absolute path of this workspace's memory directory |
| `found` | `"true"` when a store was restored and holds at least one memory |
| `count` | Number of memory files restored |
| `snapshot-path` | Where the pre-run copy was written, when `snapshot` is enabled |

## How It Works

**The store is saved even when the job is failing.**

Claude Code stores auto-memory at `~/.claude/projects/<sanitized-cwd>/memory/`, where the directory name is the working directory with its separators replaced — on a runner, `/home/runner/work/my-repo/my-repo` becomes `-home-runner-work-my-repo-my-repo`. This action computes that same path, so the restored path is by construction the path Claude Code reads.

**Every run of the repository shares one store.** S3 rather than the Actions cache, because a cache entry saved by a pull request run is visible only to that pull request, and the cache evicts whatever has not been read lately once it fills — which a repository caching container images fills within a day.

**Concurrent runs do not overwrite each other.** The save writes back only the files this run added, changed or deleted, compared with what it restored; a file it never touched is left as it is in the bucket, since another run may have changed it meanwhile. A deletion is skipped when another run has since rewritten the file. `MEMORY.md`, the index every run edits, is merged line by line when two runs both changed it. Enable versioning on the bucket to recover from a bad run.

**A missing store is never saved.** An emptied store is still a directory, and its deletions are written back. If the directory itself is gone, the save does nothing rather than delete every memory.

**The credentials stay inside the action.** The role is assumed by the action itself rather than by a credentials step that would export keys into the job's environment, where the agent would find them. The job still holds `id-token: write`, so scope the role to the bucket and nothing else.

**Neither step can fail your job.** An outage should not turn a build red, so both the restore and the save log a warning and carry on. The worst case is an agent that starts without prior memory.

## Rolling Back a Run's Edits

A job that prunes the store as part of its work — promoting memories into documentation, for instance — should only persist the pruning if the rest of the job succeeded. Enable `snapshot` and copy it back when it did not; the save then finds nothing changed and writes nothing:

```yaml
      - name: Restore Claude Code memory
        id: memory
        uses: CVector-Energy/claude-code-memory@main
        with:
          bucket: my-agent-memory-bucket
          role-to-assume: arn:aws:iam::123456789012:role/MyAgentMemory
          snapshot: 'true'

      # ... the agent prunes the store, then something fails ...

      - name: Roll back the memory store
        if: failure()
        run: |
          rm -rf "${{ steps.memory.outputs.path }}"
          cp -a "${{ steps.memory.outputs.snapshot-path }}" "${{ steps.memory.outputs.path }}"
```

## Notes

Memory is agent-authored text fed back into a privileged context on later runs. It reflects what was true when it was written, and anyone who can influence what a run stores can influence what later runs read — so prefer triggers that only people with push access can reach, and treat `pull_request_target` and similar with the care you would give any other write-capable trigger.

## Development

`src/` holds the sources; `dist/` holds the bundles the runner executes and is committed, as is normal for a published action. After changing `src/`, rebuild and commit both:

```bash
npm install
npm run build
npm test
```
