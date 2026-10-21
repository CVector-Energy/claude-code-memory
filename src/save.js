import fs from "node:fs";
import path from "node:path";
import * as core from "@actions/core";
import { connect, localHashes, read, remoteHashes, remove, write } from "./store.js";
import { mergeIndex, planSave } from "./sync.js";

async function run() {
  const memory = core.getState("path");
  if (!memory) {
    // The restore never ran — the step was skipped by an `if:` condition.
    return;
  }
  // An emptied store is still a directory. A missing one means something removed it wholesale, and syncing that would delete every memory.
  if (!fs.existsSync(memory)) {
    core.warning(`The memory store ${memory} is gone; saving nothing.`);
    return;
  }
  const bucket = core.getState("bucket");
  const prefix = core.getState("prefix");
  const base = core.getState("base");
  const restored = new Map(
    Object.entries(JSON.parse(fs.readFileSync(core.getState("restored"), "utf8"))),
  );

  try {
    const s3 = await connect({ role: core.getState("role"), region: core.getState("region") });
    const plan = planSave({
      restored,
      local: localHashes(memory),
      remote: await remoteHashes(s3, bucket, prefix),
    });
    for (const file of plan.uploads) {
      await write(s3, bucket, prefix, file, fs.readFileSync(path.join(memory, file)));
    }
    for (const file of plan.merges) {
      const merged = mergeIndex(
        fs.existsSync(base) ? fs.readFileSync(base, "utf8") : "",
        fs.readFileSync(path.join(memory, file), "utf8"),
        (await read(s3, bucket, prefix, file)).toString("utf8"),
      );
      await write(s3, bucket, prefix, file, merged);
    }
    for (const file of plan.deletes) {
      await remove(s3, bucket, prefix, file);
    }
    core.info(
      `Saved the memory store to s3://${bucket}/${prefix}: ${plan.uploads.length} written, ${plan.merges.length} merged, ${plan.deletes.length} deleted.`,
    );
  } catch (error) {
    // Losing a save is not worth failing a job that has otherwise finished.
    core.warning(`Could not save the memory store: ${error.message}`);
  }
}

run().catch((error) => {
  core.warning(`claude-code-memory: ${error.message}`);
});
