import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverlay, collectFileHandles, emptyOverlay, flattenByKey, makeNodeKey } from "./treeOverlay.js";

function file(name) {
  return { name, kind: "file", handle: { name } };
}
function dir(name, children) {
  return { name, kind: "directory", handle: { name }, children };
}

function makeFolders() {
  return [
    { key: "f1", tree: dir("Root", [file("a.pdf"), dir("Sub", [file("b.pdf")])]) },
  ];
}

test("makeNodeKey joins folder key and relative path", () => {
  assert.equal(makeNodeKey("Root", "Sub/b.pdf"), "Root:Sub/b.pdf");
});

test("applyOverlay with emptyOverlay preserves the tree shape", () => {
  const [result] = applyOverlay(makeFolders(), emptyOverlay);
  assert.equal(result.tree.children.length, 2);
  assert.equal(result.tree.children[1].children[0].name, "b.pdf");
});

test("applyOverlay hides a node and its descendants", () => {
  const folders = makeFolders();
  const subKey = makeNodeKey("Root", "Sub");
  const [result] = applyOverlay(folders, { ...emptyOverlay, hidden: [subKey] });
  const names = result.tree.children.map((c) => c.name);
  assert.deepEqual(names, ["a.pdf"]);
});

test("applyOverlay moves a node to a different parent", () => {
  const folders = [
    {
      key: "f1",
      tree: dir("Root", [file("a.pdf"), dir("Sub", [])]),
    },
  ];
  const aKey = makeNodeKey("Root", "a.pdf");
  const subKey = makeNodeKey("Root", "Sub");
  const [result] = applyOverlay(folders, { ...emptyOverlay, moves: { [aKey]: subKey } });
  const sub = result.tree.children.find((c) => c.name === "Sub");
  assert.equal(sub.children.length, 1);
  assert.equal(sub.children[0].name, "a.pdf");
  assert.equal(result.tree.children.length, 1);
});

test("applyOverlay refuses a move that would nest a folder inside its own descendant", () => {
  const folders = [
    { key: "f1", tree: dir("Root", [dir("Parent", [dir("Child", [])])]) },
  ];
  const parentKey = makeNodeKey("Root", "Parent");
  const childKey = makeNodeKey("Root", "Parent/Child");
  const [result] = applyOverlay(folders, { ...emptyOverlay, moves: { [parentKey]: childKey } });
  // Parent should still be a direct child of Root, not moved inside Child.
  const parent = result.tree.children.find((c) => c.name === "Parent");
  assert.ok(parent);
  assert.equal(parent.children[0].name, "Child");
  assert.equal(parent.children[0].children.length, 0);
});

test("applyOverlay orders children per the saved order list", () => {
  const folders = [{ key: "f1", tree: dir("Root", [file("b.pdf"), file("a.pdf")]) }];
  const rootKey = makeNodeKey("Root", "");
  const bKey = makeNodeKey("Root", "b.pdf");
  const aKey = makeNodeKey("Root", "a.pdf");
  const [result] = applyOverlay(folders, { ...emptyOverlay, order: { [rootKey]: [aKey, bKey] } });
  assert.deepEqual(result.tree.children.map((c) => c.name), ["a.pdf", "b.pdf"]);
});

test("flattenByKey indexes every node in the tree by key", () => {
  const [result] = applyOverlay(makeFolders(), emptyOverlay);
  const map = flattenByKey([result]);
  assert.ok(map.has(makeNodeKey("Root", "")));
  assert.ok(map.has(makeNodeKey("Root", "Sub")));
  assert.ok(map.has(makeNodeKey("Root", "Sub/b.pdf")));
});

test("collectFileHandles gathers every leaf file under a node", () => {
  const [result] = applyOverlay(makeFolders(), emptyOverlay);
  const handles = collectFileHandles(result.tree).map((h) => h.name);
  assert.deepEqual(handles.sort(), ["a.pdf", "b.pdf"]);
});

test("applyOverlay survives folder.key changing across reloads, since it keys by folder name", () => {
  const overlay = { ...emptyOverlay, hidden: [makeNodeKey("Root", "a.pdf")] };
  const sessionOne = [{ key: "random-id-session-1", tree: dir("Root", [file("a.pdf"), file("b.pdf")]) }];
  const sessionTwo = [{ key: "random-id-session-2", tree: dir("Root", [file("a.pdf"), file("b.pdf")]) }];
  const [resultOne] = applyOverlay(sessionOne, overlay);
  const [resultTwo] = applyOverlay(sessionTwo, overlay);
  assert.deepEqual(resultOne.tree.children.map((c) => c.name), ["b.pdf"]);
  assert.deepEqual(resultTwo.tree.children.map((c) => c.name), ["b.pdf"]);
});
