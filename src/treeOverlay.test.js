import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOverlay,
  displayedPath,
  emptyOverlay,
  flattenByKey,
  isInside,
  makeNodeKey,
  planMove,
  parseNodeKey,
  releaseNestedRoots,
} from "./treeOverlay.js";

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
  // folders sort before files
  assert.equal(result.tree.children[0].children[0].name, "b.pdf");
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

test("flattenByKey indexes every node in the tree by key", () => {
  const [result] = applyOverlay(makeFolders(), emptyOverlay);
  const map = flattenByKey([result]);
  assert.ok(map.has(makeNodeKey("Root", "")));
  assert.ok(map.has(makeNodeKey("Root", "Sub")));
  assert.ok(map.has(makeNodeKey("Root", "Sub/b.pdf")));
});

test("applyOverlay survives folder.key changing across reloads, since it keys by folder name", () => {
  const overlay = { ...emptyOverlay, names: { [makeNodeKey("Root", "a.pdf")]: "z.pdf" } };
  const sessionOne = [{ key: "random-id-session-1", tree: dir("Root", [file("a.pdf"), file("b.pdf")]) }];
  const sessionTwo = [{ key: "random-id-session-2", tree: dir("Root", [file("a.pdf"), file("b.pdf")]) }];
  const [resultOne] = applyOverlay(sessionOne, overlay);
  const [resultTwo] = applyOverlay(sessionTwo, overlay);
  assert.deepEqual(resultOne.tree.children.map((c) => c.name), ["b.pdf", "z.pdf"]);
  assert.deepEqual(resultTwo.tree.children.map((c) => c.name), ["b.pdf", "z.pdf"]);
});

test("parseNodeKey recovers a node's physical root and path from its key", () => {
  const roots = ["Contracts", "Manuals"];
  assert.deepEqual(parseNodeKey(makeNodeKey("Contracts", ""), roots), { rootName: "Contracts", relPath: "" });
  assert.deepEqual(parseNodeKey(makeNodeKey("Manuals", "Signed/2025"), roots), {
    rootName: "Manuals",
    relPath: "Signed/2025",
  });
  assert.equal(parseNodeKey("Other:x", roots), null);
});

test("parseNodeKey prefers the longest matching root name", () => {
  assert.deepEqual(parseNodeKey("Lib:Old:sub", ["Lib", "Lib:Old"]), { rootName: "Lib:Old", relPath: "sub" });
});

test("applyOverlay can place a connected folder's root inside another folder and flags it nested", () => {
  const folders = [
    { key: "k1", tree: dir("Contracts", [dir("Signed", [file("x.pdf")]), file("a.pdf")]) },
    { key: "k2", tree: dir("Manuals", [file("m.pdf")]) },
  ];
  const overlay = { ...emptyOverlay, moves: { [makeNodeKey("Manuals", "")]: makeNodeKey("Contracts", "Signed") } };
  const [contracts, manuals] = applyOverlay(folders, overlay);
  assert.equal(manuals.nested, true);
  assert.equal(contracts.nested, false);
  const signed = contracts.tree.children.find((c) => c.name === "Signed");
  assert.deepEqual(signed.children.map((c) => c.name).sort(), ["Manuals", "x.pdf"]);
  assert.equal(signed.children.find((c) => c.name === "Manuals").folderRef, folders[1]);
  assert.deepEqual(displayedPath([contracts], makeNodeKey("Manuals", "")), ["Contracts", "Signed", "Manuals"]);
});

test("a folder placed inside another returns to the top level once its parent is gone", () => {
  const folders = [{ key: "k2", tree: dir("Manuals", [file("m.pdf")]) }];
  const overlay = { ...emptyOverlay, moves: { [makeNodeKey("Manuals", "")]: makeNodeKey("Contracts", "Signed") } };
  const [manuals] = applyOverlay(folders, overlay);
  assert.equal(manuals.nested, false);
});

test("releaseNestedRoots frees only the folders placed inside the removed one", () => {
  const overlay = {
    ...emptyOverlay,
    moves: {
      [makeNodeKey("Manuals", "")]: makeNodeKey("Contracts", "Signed"),
      [makeNodeKey("Other", "")]: makeNodeKey("Elsewhere", ""),
      [makeNodeKey("Contracts", "Signed/2024")]: makeNodeKey("Contracts", "Archive"),
    },
  };
  const next = releaseNestedRoots(overlay, "Contracts");
  assert.deepEqual(Object.keys(next.moves).sort(), [
    makeNodeKey("Contracts", "Signed/2024"),
    makeNodeKey("Other", ""),
  ]);
});

test("applyOverlay shows a renamed node under its new name but keeps its key", () => {
  const overlay = { ...emptyOverlay, names: { "Root:a.pdf": "Contract.pdf" } };
  const [result] = applyOverlay(makeFolders(), overlay);
  const renamed = result.tree.children.find((c) => c.rawName === "a.pdf");
  assert.equal(renamed.name, "Contract.pdf");
  assert.equal(renamed.rawName, "a.pdf");
  assert.equal(renamed.key, "Root:a.pdf");
});

function sizedFile(name, size, addedAt) {
  return { name, kind: "file", handle: { name }, size, addedAt };
}
function sortedNames(sort) {
  const folders = [
    {
      key: "f1",
      connectedAt: 50,
      tree: dir("Root", [
        sizedFile("b.pdf", 30, 300),
        sizedFile("a.pdf", 20, 400),
        sizedFile("old.pdf", 10, undefined),
        dir("Sub", [sizedFile("c.pdf", 5, 100)]),
      ]),
    },
  ];
  return applyOverlay(folders, emptyOverlay, sort)[0].tree.children.map((c) => c.name);
}

test("sorting by name puts folders first, then A-Z, and Z-A when descending", () => {
  assert.deepEqual(sortedNames({ by: "name", dir: "asc" }), ["Sub", "a.pdf", "b.pdf", "old.pdf"]);
  assert.deepEqual(sortedNames({ by: "name", dir: "desc" }), ["Sub", "old.pdf", "b.pdf", "a.pdf"]);
});

test("sorting by size: a folder counts as everything inside it", () => {
  assert.deepEqual(sortedNames({ by: "size", dir: "desc" }), ["Sub", "b.pdf", "a.pdf", "old.pdf"]);
  assert.deepEqual(sortedNames({ by: "size", dir: "asc" }), ["Sub", "old.pdf", "a.pdf", "b.pdf"]);
});

test("sorting by date: a file with no date counts as added when its folder was connected", () => {
  // old.pdf -> 50 (connectedAt), then b 300, a 400
  assert.deepEqual(sortedNames({ by: "date", dir: "asc" }), ["Sub", "old.pdf", "b.pdf", "a.pdf"]);
  assert.deepEqual(sortedNames({ by: "date", dir: "desc" }), ["Sub", "a.pdf", "b.pdf", "old.pdf"]);
});

function movableTree() {
  const folders = [
    {
      key: "f1",
      tree: dir("Root", [file("a.pdf"), dir("Sub", [file("b.pdf"), dir("Deep", [])]), dir("Other", [file("a.pdf")])]),
    },
  ];
  const [result] = applyOverlay(folders, emptyOverlay);
  return { root: result.tree, byKey: flattenByKey([result]) };
}

test("isInside is true for the node itself and anything below it, false otherwise", () => {
  const { byKey } = movableTree();
  const sub = makeNodeKey("Root", "Sub");
  assert.ok(isInside(sub, sub, byKey));
  assert.ok(isInside(makeNodeKey("Root", "Sub/Deep"), sub, byKey));
  assert.ok(!isInside(makeNodeKey("Root", "Other"), sub, byKey));
  assert.ok(!isInside(sub, makeNodeKey("Root", "Sub/Deep"), byKey));
});

test("planMove splits moving nodes into clean ones and name clashes with the destination", () => {
  const { byKey } = movableTree();
  const other = byKey.get(makeNodeKey("Root", "Other"));
  const a = byKey.get(makeNodeKey("Root", "a.pdf"));
  const b = byKey.get(makeNodeKey("Root", "Sub/b.pdf"));
  const { clean, clashes } = planMove([a, b], other);
  assert.deepEqual(clean.map((n) => n.name), ["b.pdf"]);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].incoming, a);
  assert.equal(clashes[0].existing.key, makeNodeKey("Root", "Other/a.pdf"));
  assert.equal(clashes[0].inBatch, false);
});

test("planMove treats two moving items with the same name as a clash with each other", () => {
  const { byKey } = movableTree();
  const deep = byKey.get(makeNodeKey("Root", "Sub/Deep"));
  const a1 = byKey.get(makeNodeKey("Root", "a.pdf"));
  const a2 = byKey.get(makeNodeKey("Root", "Other/a.pdf"));
  const { clean, clashes } = planMove([a1, a2], deep);
  assert.deepEqual(clean, [a1]);
  assert.equal(clashes[0].existing, a1);
  assert.equal(clashes[0].inBatch, true);
});

test("planMove to the top level never clashes", () => {
  const { root } = movableTree();
  const { clean, clashes } = planMove([root], null);
  assert.equal(clean.length, 1);
  assert.equal(clashes.length, 0);
});

test("moving a node only needs a move entry, and a (1) name goes in names", () => {
  const folders = [{ key: "f1", tree: dir("Root", [file("a.pdf"), dir("Sub", [])]) }];
  const overlay = {
    ...emptyOverlay,
    moves: { [makeNodeKey("Root", "a.pdf")]: makeNodeKey("Root", "Sub") },
    names: { [makeNodeKey("Root", "a.pdf")]: "a (1).pdf" },
  };
  const [result] = applyOverlay(folders, overlay);
  const sub = result.tree.children.find((c) => c.rawName === "Sub");
  assert.deepEqual(sub.children.map((c) => c.name), ["a (1).pdf"]);
});

test("planMove for a copy clashes with the original sitting in the destination", () => {
  const { byKey } = movableTree();
  const sub = byKey.get(makeNodeKey("Root", "Sub"));
  const b = byKey.get(makeNodeKey("Root", "Sub/b.pdf"));
  assert.equal(planMove([b], sub).clashes.length, 0);
  const copy = planMove([b], sub, true);
  assert.equal(copy.clashes.length, 1);
  assert.equal(copy.clashes[0].existing, b);
});
