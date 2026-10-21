import fs from "node:fs";
import path from "node:path";
import * as core from "@actions/core";
import * as paths from "./paths.js";
import { connect, localHashes, read, remoteHashes, within } from "./store.js";
import { INDEX } from "./sync.js";

/** Memory files in the store. MEMORY.md is the index, not a memory. */
function countMemories(hashes) {
  return [...hashes.keys()].filter(
    (file) => file.endsWith(".md") && path.basename(file) !== INDEX,
  ).length;
}

async function run() {
  const home = process.env.HOME || "";
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const memory = paths.memoryPath(home, workspace);
  const bucket = core.getInput("bucket", { required: true });
  const role = core.getInput("role-to-assume", { required: true });
  const region = core.getInput("aws-region") || "us-east-1";
  const prefix = paths.objectPrefix(process.env.GITHUB_REPOSITORY || "");
  const temp = process.env.RUNNER_TEMP || "/tmp";
  const restored = path.join(temp, "claude-code-memory-restored.json");
  const base = path.join(temp, "claude-code-memory-base-index.md");

  fs.mkdirSync(memory, { recursive: true });

  try {
    const s3 = await connect({ role, region });
    const remote = await remoteHashes(s3, bucket, prefix);
    for (const file of remote.keys()) {
      const target = within(memory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await read(s3, bucket, prefix, file));
    }
    core.info(`Restored ${remote.size} files from s3://${bucket}/${prefix}.`);
  } catch (error) {
    // An outage is not worth failing a job over: the agent simply starts without prior memory.
    core.warning(`Could not restore the memory store: ${error.message}`);
  }

  // The save writes back only what differs from this, so a file this run never touched cannot overwrite another run's edit.
  const hashes = localHashes(memory);
  fs.writeFileSync(restored, JSON.stringify(Object.fromEntries(hashes)));
  const index = path.join(memory, INDEX);
  if (fs.existsSync(index)) {
    fs.copyFileSync(index, base);
  } else {
    fs.rmSync(base, { force: true });
  }

  // Handed to the post step, which is where the save happens.
  core.saveState("path", memory);
  core.saveState("bucket", bucket);
  core.saveState("role", role);
  core.saveState("region", region);
  core.saveState("prefix", prefix);
  core.saveState("restored", restored);
  core.saveState("base", base);

  const count = countMemories(hashes);
  core.setOutput("path", memory);
  core.setOutput("count", String(count));
  core.setOutput("found", count > 0 ? "true" : "false");
  core.info(
    count > 0
      ? `${count} ${count === 1 ? "memory" : "memories"} available at ${memory}.`
      : `No memories yet; the store is at ${memory}.`,
  );

  const snapshot = path.join(temp, "claude-code-memory-snapshot");
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
