# Claude Code Memory Action

Carry [Claude Code](https://claude.com/claude-code)'s auto-memory store between CI runs, so an agent starts each run with what earlier runs learned about the repository instead of meeting it fresh every time. The updated memories are saved to the cache at the job-end hook.

## What This Action Does

1. Derives the on-disk path of Claude Code's auto-memory store for this workspace
2. Restores the store from the repository-wide cache, newest entry first
3. Registers a post step that saves the store when the job finishes, pass or fail
4. Reports how many memories were restored, so a workflow can branch on an empty store
5. Optionally snapshots the pre-run store, for a job that must be able to roll back

## Usage

```yaml
jobs:
  agent:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Cache Claude Code memory
        uses: CVector-Energy/claude-code-memory@main

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

Claude Code stores auto-memory at `~/.claude/projects/<sanitized-cwd>/memory/`, where the directory name is the working directory with its separators replaced — on a runner, `/home/runner/work/my-repo/my-repo` becomes `-home-runner-work-my-repo-my-repo`. This action computes that same path, so the cached path is by construction the path Claude Code reads.

The action aims to share knowledge broadly across runs on the repo. GitHub cache mechanism limits this somewhat; memory saved on a branch won't be accessible to other branches unless it is merged to the default branch.

**Neither step can fail your job.** A cache miss is normal and a cache outage should not turn a build red, so both the restore and the save log a warning and carry on. The worst case is an agent that starts without prior memory.

## Rolling Back a Run's Edits

A job that prunes the store as part of its work — promoting memories into documentation, for instance — should only persist the pruning if the rest of the job succeeded. Enable `snapshot` and copy it back when it did not:

```yaml
      - name: Cache Claude Code memory
        id: memory
        uses: CVector-Energy/claude-code-memory@main
        with:
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
