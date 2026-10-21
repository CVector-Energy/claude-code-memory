// Pure decisions about what a run writes back, kept apart from S3 so they can be tested without one.

/** The index Claude Code keeps beside the memories: one pointer line per memory. */
export const INDEX = "MEMORY.md";

/**
 * Decides what to write back, given content hashes keyed by relative path: `restored` as this run found the store, `local` as it leaves it, `remote` as the store is now. Several runs share the store at once, so a run writes only what it changed itself — anything it left alone may have been changed by another run meanwhile. The index is the one file every run edits, so when two runs both changed it, it is merged rather than overwritten.
 */
export function planSave({ restored, local, remote }) {
  const uploads = [];
  const deletes = [];
  const merges = [];

  for (const [path, hash] of local) {
    if (restored.get(path) === hash) {
      continue;
    }
    const theirs = remote.get(path);
    const concurrent = theirs !== undefined && theirs !== restored.get(path);
    if (path === INDEX && concurrent && theirs !== hash) {
      merges.push(path);
    } else {
      uploads.push(path);
    }
  }

  for (const [path, hash] of restored) {
    // A deletion only applies to the version this run deleted; a newer one is another run's work.
    if (!local.has(path) && remote.get(path) === hash) {
      deletes.push(path);
    }
  }

  return { uploads, deletes, merges };
}

function lines(text) {
  return text.split("\n").filter((line) => line !== "");
}

/**
 * Three-way merge of the index, line by line: the store's current lines, less those this run removed, plus those it added.
 */
export function mergeIndex(base, ours, theirs) {
  const baseLines = new Set(lines(base));
  const ourLines = new Set(lines(ours));
  const removed = new Set([...baseLines].filter((line) => !ourLines.has(line)));
  const merged = lines(theirs).filter((line) => !removed.has(line));
  const present = new Set(merged);
  for (const line of ourLines) {
    if (!baseLines.has(line) && !present.has(line)) {
      merged.push(line);
      present.add(line);
    }
  }
  return merged.length === 0 ? "" : `${merged.join("\n")}\n`;
}
