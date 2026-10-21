import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { localHashes, within } from "./store.js";

test("local hashes are MD5, keyed by forward-slash relative path", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ccm-"));
  fs.mkdirSync(path.join(directory, "nested"));
  fs.writeFileSync(path.join(directory, "nested", "a.md"), "hello");
  assert.deepEqual(
    localHashes(directory),
    new Map([["nested/a.md", "5d41402abc4b2a76b9719d911017c592"]]),
  );
});

test("a missing store has no files", () => {
  assert.equal(localHashes("/nonexistent/claude-code-memory").size, 0);
});

test("an object key cannot write outside the store", () => {
  assert.throws(() => within("/store", "../escape.md"));
  assert.equal(within("/store", "a/b.md"), "/store/a/b.md");
});
