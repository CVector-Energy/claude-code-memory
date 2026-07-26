# Claude Code Memory Action

Carry [Claude Code](https://claude.com/claude-code)'s auto-memory store between CI runs, so an agent starts each run with what earlier runs learned about the repository instead of meeting it fresh every time.

Use it once, before the step that runs Claude Code. There is no companion save action: the restore registers a job-end hook that saves the store back.

## What This Action Does

1. Derives the on-disk path of Claude Code's auto-memory store for this workspace
2. Restores the store from the repository-wide cache, newest entry first
3. Registers a post step that saves the store when the job finishes
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

Nothing else is required. The store is restored before the agent runs and saved after the job ends.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `snapshot` | Copy the restored store aside before the agent runs, so the caller can roll back to it (see `snapshot-path`). Off by default: the point of the hook is that the agent's edits persist. | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `path` | Absolute path of this workspace's memory directory |
| `found` | `"true"` when a store was restored and holds at least one memory |
| `count` | Number of memory files restored |
| `snapshot-path` | Where the pre-run copy was written, when `snapshot` is enabled |
| `key` | Cache key the job-end hook saves under (see [Jobs that fail by design](#jobs-that-fail-by-design)) |
| `glob` | Cache path glob to pair with `key` when saving on a failure path |

## How It Works

**The path is derived, not configured.** Claude Code stores auto-memory at `~/.claude/projects/<sanitized-cwd>/memory/`, where the directory name is the working directory with its separators replaced — on a runner, `/home/runner/work/my-repo/my-repo` becomes `-home-runner-work-my-repo-my-repo`. This action computes that same path, so the cached path is by construction the path Claude Code reads. Pinning `autoMemoryDirectory` in settings would work too, but it splits one fact across two places that must agree, and a workflow that cached one path while the agent wrote to another looks exactly like an agent that never remembers anything.

**The cache key carries no branch or ref.** What an agent learns is knowledge about the repository, not about one branch, and a scheduled job needs to read whatever the last run wrote. Note that GitHub still scopes cache *reads* to the current branch plus the default branch, so a store saved on a feature branch is invisible to other branches until it lands on the default branch. That is a platform limit rather than a choice made here.

**The primary key is unique per run, deliberately.** `actions/cache` skips its post-step save after an exact-key hit, so a key that can never already exist is what makes every run save. All reads come through the `restore-keys` prefix, newest entry first.

**An empty store is still saved.** An agent that prunes every memory leaves the directory empty, and that empty store is what has to persist — otherwise the deletions silently come back on the next restore. The action creates the directory before the save so the post step has something to match.

## Jobs That Fail by Design

`actions/cache` declares `post-if: success()`, so its save is skipped once any step in the job has failed. For most agent workflows a failed job is an anomaly and losing that run's memory does not matter much.

It matters if your job fails on purpose — a test suite gated on a failure budget, say — because those are often the runs whose findings are most worth keeping. Add your own save on the failure path, using the `key` and `glob` outputs so the two never drift apart:

```yaml
      - name: Cache Claude Code memory
        id: memory
        uses: CVector-Energy/claude-code-memory@main

      # ... the agent, and whatever can fail ...

      - name: Save Claude memory after a failed run
        if: failure() && steps.memory.outputs.key != ''
        continue-on-error: true
        uses: actions/cache/save@v6
        with:
          path: ${{ steps.memory.outputs.glob }}
          key: ${{ steps.memory.outputs.key }}
```

Put it last, so the store is complete. It is mutually exclusive with the hook: on a clean run `failure()` is false and only the hook saves.

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

Restoring the memory store is narrower than caching all of `~/.claude/projects`, which is where session transcripts live: this action only touches the `memory/` subdirectories, so a transcript cache and this one can coexist in the same job without clobbering each other.
