import * as cache from "@actions/cache";
import * as core from "@actions/core";

async function run() {
  const key = core.getState("key");
  const glob = core.getState("glob");
  if (!key || !glob) {
    // The restore never ran — the step was skipped by an `if:` condition.
    return;
  }
  try {
    await cache.saveCache([glob], key);
    core.info(`Saved the memory store as ${key}.`);
  } catch (error) {
    // Includes ReserveCacheError when a re-run already stored this key. Losing a
    // save is not worth failing a job that has otherwise finished.
    core.warning(`Could not save the memory store: ${error.message}`);
  }
}

run().catch((error) => {
  core.warning(`claude-code-memory: ${error.message}`);
});
