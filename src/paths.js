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
 * Where a repository's store lives in the bucket. Keyed by repository and nothing narrower: what an agent learns is knowledge about the repository, not about one branch, and a scheduled job needs to read whatever the last run wrote.
 */
function objectPrefix(repository) {
  return `${repository}/memory/`;
}

function relativePath(prefix, key) {
  return key.slice(prefix.length);
}

export { memoryPath, objectPrefix, relativePath, slugForWorkspace };
