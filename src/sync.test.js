import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeIndex, planSave } from "./sync.js";

const map = (entries) => new Map(Object.entries(entries));

test("a file this run added is uploaded", () => {
  const plan = planSave({
    restored: map({}),
    local: map({ "a.md": "1" }),
    remote: map({}),
  });
  assert.deepEqual(plan, { uploads: ["a.md"], deletes: [], merges: [] });
});

test("a file this run changed is uploaded", () => {
  const plan = planSave({
    restored: map({ "a.md": "1" }),
    local: map({ "a.md": "2" }),
    remote: map({ "a.md": "1" }),
  });
  assert.deepEqual(plan.uploads, ["a.md"]);
});

test("a file this run left alone is not written back", () => {
  // Rewriting it would undo whatever a concurrent run did to it meanwhile.
  const plan = planSave({
    restored: map({ "a.md": "1" }),
    local: map({ "a.md": "1" }),
    remote: map({}),
  });
  assert.deepEqual(plan, { uploads: [], deletes: [], merges: [] });
});

test("a file this run deleted is deleted", () => {
  const plan = planSave({
    restored: map({ "a.md": "1" }),
    local: map({}),
    remote: map({ "a.md": "1" }),
  });
  assert.deepEqual(plan.deletes, ["a.md"]);
});

test("a deletion does not discard a concurrent run's edit", () => {
  const plan = planSave({
    restored: map({ "a.md": "1" }),
    local: map({}),
    remote: map({ "a.md": "2" }),
  });
  assert.deepEqual(plan.deletes, []);
});

test("a deletion of a file already gone is skipped", () => {
  const plan = planSave({
    restored: map({ "a.md": "1" }),
    local: map({}),
    remote: map({}),
  });
  assert.deepEqual(plan.deletes, []);
});

test("an index both runs changed is merged rather than overwritten", () => {
  const plan = planSave({
    restored: map({ "MEMORY.md": "1" }),
    local: map({ "MEMORY.md": "2" }),
    remote: map({ "MEMORY.md": "3" }),
  });
  assert.deepEqual(plan, { uploads: [], deletes: [], merges: ["MEMORY.md"] });
});

test("an index only this run changed is uploaded", () => {
  const plan = planSave({
    restored: map({ "MEMORY.md": "1" }),
    local: map({ "MEMORY.md": "2" }),
    remote: map({ "MEMORY.md": "1" }),
  });
  assert.deepEqual(plan.uploads, ["MEMORY.md"]);
});

test("an index this run created while another run did too is merged", () => {
  const plan = planSave({
    restored: map({}),
    local: map({ "MEMORY.md": "2" }),
    remote: map({ "MEMORY.md": "3" }),
  });
  assert.deepEqual(plan.merges, ["MEMORY.md"]);
});

test("the merged index keeps both runs' additions", () => {
  const base = "- [A](a.md) — a\n";
  const ours = "- [A](a.md) — a\n- [B](b.md) — b\n";
  const theirs = "- [A](a.md) — a\n- [C](c.md) — c\n";
  assert.equal(
    mergeIndex(base, ours, theirs),
    "- [A](a.md) — a\n- [C](c.md) — c\n- [B](b.md) — b\n",
  );
});

test("the merged index drops a line this run removed", () => {
  const base = "- [A](a.md) — a\n- [B](b.md) — b\n";
  const ours = "- [B](b.md) — b\n";
  const theirs = "- [A](a.md) — a\n- [B](b.md) — b\n- [C](c.md) — c\n";
  assert.equal(
    mergeIndex(base, ours, theirs),
    "- [B](b.md) — b\n- [C](c.md) — c\n",
  );
});

test("the merged index adds a line both runs wrote only once", () => {
  const base = "";
  const ours = "- [A](a.md) — a\n";
  const theirs = "- [A](a.md) — a\n";
  assert.equal(mergeIndex(base, ours, theirs), "- [A](a.md) — a\n");
});
