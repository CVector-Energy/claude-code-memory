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

test("the cache glob covers every project slug", () => {
  assert.equal(
    paths.memoryGlob("/home/runner"),
    "/home/runner/.claude/projects/*/memory",
  );
});

test("the key is unique per run and attempt", () => {
  assert.notEqual(paths.cacheKey("1", "1"), paths.cacheKey("1", "2"));
  assert.notEqual(paths.cacheKey("1", "1"), paths.cacheKey("2", "1"));
});

test("the key carries no branch or ref component", () => {
  // A branch in the key would hide the last run's store from a scheduled job.
  assert.equal(paths.cacheKey("7", "1"), "claude-memory-v1-7-1");
});

test("every key starts with the prefix reads fall back to", () => {
  assert.ok(paths.cacheKey("7", "1").startsWith(paths.restoreKeys()[0]));
});
