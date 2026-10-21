import assert from "node:assert/strict";
import { test } from "node:test";
import * as paths from "./paths.js";

test("the slug matches how Claude Code names a project directory", () => {
  assert.equal(
    paths.slugForWorkspace("/home/runner/work/my-repo/my-repo"),
    "-home-runner-work-my-repo-my-repo",
  );
});

test("dots and underscores survive; everything else becomes a dash", () => {
  assert.equal(paths.slugForWorkspace("/a/b_c.d-e"), "-a-b_c.d-e");
});

test("the memory path is the store Claude Code actually reads", () => {
  assert.equal(
    paths.memoryPath("/home/runner", "/home/runner/work/ui/ui"),
    "/home/runner/.claude/projects/-home-runner-work-ui-ui/memory",
  );
});

test("objects live under the repository's own prefix", () => {
  assert.equal(
    paths.objectPrefix("CVector-Energy/ui"),
    "CVector-Energy/ui/memory/",
  );
});

test("a store path round-trips through its object key", () => {
  const prefix = paths.objectPrefix("o/r");
  assert.equal(paths.relativePath(prefix, `${prefix}nested/a.md`), "nested/a.md");
});
