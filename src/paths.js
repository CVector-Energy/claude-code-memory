// Pure path and key derivation, kept separate from the Actions plumbing so it can
// be tested without a runner.

/**
 * Claude Code derives a project's transcript/memory directory name from the
 * working directory, replacing anything that is not alphanumeric, `_` or `.`
 * with `-`. On a runner `/home/runner/work/my-repo/my-repo` becomes
 * `-home-runner-work-my-repo-my-repo`.
 */
function slugForWorkspace(workspace) {
  return workspace.replace(/[^A-Za-z0-9_.]/g, "-");
}

/**
 * Where Claude Code keeps this workspace's auto-memory. Derived rather than
 * configured: the cached path is then by construction the path Claude Code reads,
 * with nothing for a caller to set and so nothing for a caller to get wrong.
 */
function memoryPath(home, workspace) {
  return `${home}/.claude/projects/${slugForWorkspace(workspace)}/memory`;
}

/**
 * Cache paths cover every project slug, so a store written under a different
 * workspace path is at least restored rather than reported missing.
 */
function memoryGlob(home) {
  return `${home}/.claude/projects/*/memory`;
}

export const KEY_PREFIX = "claude-memory-v1-";

/**
 * The key carries no branch or ref on purpose: what an agent learns is knowledge
 * about the repository, not about one branch, and a scheduled job needs to read
 * whatever the last run wrote. It is unique per run so the save always writes a
 * new entry; reads all come through the prefix, newest first.
 */
function cacheKey(runId, runAttempt) {
  return `${KEY_PREFIX}${runId}-${runAttempt}`;
}

function restoreKeys() {
  return [KEY_PREFIX];
}

export {
  cacheKey,
  memoryGlob,
  memoryPath,
  restoreKeys,
  slugForWorkspace,
};
