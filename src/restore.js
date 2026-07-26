import fs from "node:fs";
import path from "node:path";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as paths from "./paths.js";

/** Memory files in the store. MEMORY.md is the index, not a memory. */
function countMemories(directory) {
  if (!fs.existsSync(directory)) {
    return 0;
  }
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "MEMORY.md",
    ).length;
}

async function run() {
  const home = process.env.HOME || "";
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const memory = paths.memoryPath(home, workspace);
  const glob = paths.memoryGlob(home);
  const key = paths.cacheKey(
    process.env.GITHUB_RUN_ID || "0",
    process.env.GITHUB_RUN_ATTEMPT || "1",
  );

  // Handed to the post step, which is where the save happens.
  core.saveState("key", key);
  core.saveState("glob", glob);
  core.saveState("path", memory);

  try {
    const hit = await cache.restoreCache([glob], key, paths.restoreKeys());
    if (hit) {
      core.info(`Restored the memory store from cache entry ${hit}.`);
    } else {
      core.info("No cached memory store found; this run starts with none.");
    }
  } catch (error) {
    // A cache miss is normal and a cache outage is not worth failing a job over:
    // the agent simply starts without prior memory.
    core.warning(`Could not restore the memory store: ${error.message}`);
  }

  // The save needs something to match even when the agent pruned every memory,
  // because that empty store is exactly what has to persist — otherwise the
  // deletions silently come back on the next restore.
  fs.mkdirSync(memory, { recursive: true });

  const count = countMemories(memory);
  core.setOutput("path", memory);
  core.setOutput("count", String(count));
  core.setOutput("found", count > 0 ? "true" : "false");
  core.info(
    count > 0
      ? `${count} ${count === 1 ? "memory" : "memories"} available at ${memory}.`
      : `No memories yet; the store is at ${memory}.`,
  );

  const snapshot = path.join(
    process.env.RUNNER_TEMP || "/tmp",
    "claude-code-memory-snapshot",
  );
  core.setOutput("snapshot-path", snapshot);
  if (core.getBooleanInput("snapshot")) {
    fs.rmSync(snapshot, { recursive: true, force: true });
    fs.cpSync(memory, snapshot, { recursive: true });
    core.info(`Snapshotted the pre-run store to ${snapshot}.`);
  }
}

run().catch((error) => {
  // Restoring memory is an optimisation; never fail the caller's job for it.
  core.warning(`claude-code-memory: ${error.message}`);
});
