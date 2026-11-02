import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTreeFromFileList,
  flattenTreeFileHandlesWithPath,
  wrapDroppedFile,
  filesInDirectory,
  uniqueFileName,
  planAddedFiles,
  insertFilesIntoTree,
  findNodeAt,
  removeNodeFromTree,
  extrasKey,
  reviveLegacyFileHandle,
  buildLegacyManifest,
  reviveLegacyManifest,
  fillMissingSizes,
  planCopy,
  planCopyRoot,
  planBytes,
  planFiles,
  finishPlan,
  flattenTreeFiles,
} from "./fileSystem.js";

function mockFile(webkitRelativePath) {
  const name = webkitRelativePath.split("/").pop();
  return { name, webkitRelativePath };
}

test("buildTreeFromFileList ignores non-PDF files", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/notes.txt")]);
  assert.equal(tree, null);
});

test("buildTreeFromFileList nests folders from webkitRelativePath", () => {
  const files = [mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf")];
  const tree = buildTreeFromFileList(files);
  assert.equal(tree.name, "Lib");
  assert.equal(tree.children.length, 2);
  const sub = tree.children.find((c) => c.kind === "directory");
  assert.equal(sub.name, "Sub");
  assert.equal(sub.children[0].name, "b.pdf");
  assert.equal(sub.children[0].relativePath, "Sub/b.pdf");
});

test("buildTreeFromFileList sorts children alphabetically", () => {
  const files = [mockFile("Lib/b.pdf"), mockFile("Lib/a.pdf")];
  const tree = buildTreeFromFileList(files);
  assert.deepEqual(tree.children.map((c) => c.name), ["a.pdf", "b.pdf"]);
});

test("wrapDroppedFile exposes a getFile() returning the original file", async () => {
  const file = { name: "dropped.pdf" };
  const handle = wrapDroppedFile(file);
  assert.equal(handle.name, "dropped.pdf");
  assert.equal(await handle.getFile(), file);
});

test("flattenTreeFileHandlesWithPath leaves root-level files with an empty path", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf")]);
  const [file] = flattenTreeFileHandlesWithPath(tree);
  assert.equal(file.name, "a.pdf");
  assert.equal(file.path, "");
});

test("flattenTreeFileHandlesWithPath reports each nested file's folder path", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf")]);
  const files = flattenTreeFileHandlesWithPath(tree);
  const a = files.find((f) => f.name === "a.pdf");
  const b = files.find((f) => f.name === "b.pdf");
  assert.equal(a.path, "");
  assert.equal(b.path, "Sub");
});

test("uniqueFileName leaves a free name alone and numbers a taken one", () => {
  assert.equal(uniqueFileName("a.pdf", new Set()), "a.pdf");
  assert.equal(uniqueFileName("a.pdf", new Set(["a.pdf"])), "a (1).pdf");
  assert.equal(uniqueFileName("A.pdf", new Set(["a.pdf", "a (1).pdf"])), "A (2).pdf");
});

test("planAddedFiles keeps both by default and only replaces when asked", () => {
  const files = [{ name: "a.pdf" }, { name: "new.pdf" }];
  const keep = planAddedFiles(files, ["a.pdf"]);
  assert.deepEqual(keep.map((p) => [p.name, p.replaces]), [["a (1).pdf", false], ["new.pdf", false]]);
  const replace = planAddedFiles(files, ["A.pdf"], { 0: "replace" });
  assert.deepEqual(replace.map((p) => [p.name, p.replaces]), [["A.pdf", true], ["new.pdf", false]]);
});

test("planAddedFiles avoids clashes between files in the same batch", () => {
  const plan = planAddedFiles([{ name: "x.pdf" }, { name: "x.pdf" }], []);
  assert.deepEqual(plan.map((p) => p.name), ["x.pdf", "x (1).pdf"]);
});

test("insertFilesIntoTree adds into a subfolder, replaces same-name files, and leaves the old tree alone", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf")]);
  const added = { name: "c.pdf", kind: "file", handle: {} };
  const replacement = { name: "b.pdf", kind: "file", handle: {} };

  const next = insertFilesIntoTree(tree, "Sub", [added, replacement]);
  assert.deepEqual(filesInDirectory(next, "Sub").map((f) => f.name), ["b.pdf", "c.pdf"]);
  assert.equal(filesInDirectory(next, "Sub")[0], replacement);
  assert.deepEqual(filesInDirectory(next, "").map((f) => f.name), ["a.pdf"]);
  assert.deepEqual(filesInDirectory(tree, "Sub").map((f) => f.name), ["b.pdf"]);
  assert.equal(next.handle, tree.handle);
});

test("insertFilesIntoTree at the root keeps files sorted", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/b.pdf")]);
  const next = insertFilesIntoTree(tree, "", [{ name: "a.pdf", kind: "file", handle: {} }]);
  assert.deepEqual(next.children.map((c) => c.name), ["a.pdf", "b.pdf"]);
});

test("findNodeAt finds files and folders by path, and null for a missing one", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf")]);
  assert.equal(findNodeAt(tree, ""), tree);
  assert.equal(findNodeAt(tree, "Sub").kind, "directory");
  assert.equal(findNodeAt(tree, "Sub/b.pdf").name, "b.pdf");
  assert.equal(findNodeAt(tree, "Sub/nope.pdf"), null);
  assert.equal(findNodeAt(tree, "a.pdf/b.pdf"), null);
});

test("removeNodeFromTree removes a file, prunes the folder it emptied, and leaves the old tree alone", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/Deep/b.pdf"), mockFile("Lib/Sub/c.pdf")]);
  const one = removeNodeFromTree(tree, "Sub/Deep/b.pdf");
  assert.equal(findNodeAt(one, "Sub/Deep"), null);
  assert.equal(findNodeAt(one, "Sub/c.pdf").name, "c.pdf");
  assert.equal(findNodeAt(tree, "Sub/Deep/b.pdf").name, "b.pdf");
});

test("removeNodeFromTree removes a whole folder and its parents if that empties them, but never the root", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/Sub/Deep/b.pdf")]);
  const next = removeNodeFromTree(tree, "Sub/Deep");
  assert.equal(next.name, "Lib");
  assert.deepEqual(next.children, []);
  assert.equal(removeNodeFromTree(tree, ""), tree);
});

test("a copied file's extras are keyed by folder name and path, a dropped file's by name", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/a.pdf")], "id");
  const keys = [];
  (function walk(n) {
    if (n.kind === "file") keys.push(extrasKey(n.handle));
    else n.children.forEach(walk);
  })(tree);
  assert.deepEqual(keys.sort(), ["Lib:Sub/a.pdf", "Lib:a.pdf"]);
  assert.equal(extrasKey(reviveLegacyFileHandle("id", "a.pdf", "Sub/a.pdf", "Lib")), "Lib:Sub/a.pdf");
  assert.equal(extrasKey(wrapDroppedFile({ name: "dropped.pdf" })), "dropped.pdf");
});

test("every stored file gets its own name, so paths like Reports/Q1.pdf and Reports__Q1.pdf never collide", () => {
  const tree = buildTreeFromFileList(
    [mockFile("Lib/Reports/Q1.pdf"), mockFile("Lib/Reports__Q1.pdf"), mockFile("Lib/odd\\name.pdf")],
    "id"
  );
  const stored = flattenTreeFiles(tree).map((f) => f.storedAs);
  assert.equal(new Set(stored).size, 3);
  assert.ok(stored.every((n) => /^[0-9a-f-]{36}$/.test(n)));
});

test("a folder's saved list keeps each file's stored name and hands it back on revive", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf")], "id");
  const original = Object.fromEntries(flattenTreeFiles(tree).map((f) => [f.relativePath, f.storedAs]));
  const revived = reviveLegacyManifest("id", JSON.parse(JSON.stringify(buildLegacyManifest(tree))));
  for (const file of flattenTreeFiles(revived)) {
    assert.equal(file.storedAs, original[file.relativePath]);
  }
});

test("fillMissingSizes reads only the sizes that are missing", async () => {
  const file = (name, size) => ({ name, kind: "file", size, handle: { getFile: async () => ({ size: 99 }) } });
  const tree = { name: "R", kind: "directory", children: [file("a.pdf", undefined), file("b.pdf", 5)] };
  assert.equal(await fillMissingSizes(tree), 1);
  assert.deepEqual(tree.children.map((c) => c.size), [99, 5]);
});

test("a file's size and added date survive the manifest round trip", () => {
  const tree = { name: "R", kind: "directory", children: [{ name: "a.pdf", kind: "file", relativePath: "a.pdf", storedAs: "s", size: 7, addedAt: 3 }] };
  const revived = reviveLegacyManifest("id", JSON.parse(JSON.stringify(buildLegacyManifest(tree))));
  assert.equal(revived.children[0].size, 7);
  assert.equal(revived.children[0].addedAt, 3);
});

test("uniqueFileName keeps a folder's dots in its name", () => {
  assert.equal(uniqueFileName("v1.2", new Set(["v1.2"]), true), "v1.2 (1)");
  assert.equal(uniqueFileName("a.pdf", new Set(["a.pdf", "a (1).pdf"])), "a (2).pdf");
});

test("removeNodeFromTree keeps a folder named in `keep` even when it is emptied", () => {
  const leaf = { name: "a.pdf", kind: "file", handle: {} };
  const tree = { name: "R", kind: "directory", children: [{ name: "D", kind: "directory", children: [leaf] }] };
  assert.equal(removeNodeFromTree(tree, "D/a.pdf").children.length, 0);
  const kept = removeNodeFromTree(tree, "D/a.pdf", new Set(["D"]));
  assert.equal(kept.children.length, 1);
  assert.equal(kept.children[0].children.length, 0);
});

function storedTree() {
  const f = (name, relativePath, size) => ({
    name,
    kind: "file",
    relativePath,
    storedAs: "orig-" + name,
    size,
    handle: { fileKey: `Lib:${relativePath}`, getFile: async () => ({ size }) },
  });
  return {
    name: "Lib",
    kind: "directory",
    children: [f("a.pdf", "a.pdf", 10), { name: "Sub", kind: "directory", children: [f("b.pdf", "Sub/b.pdf", 5)] }],
  };
}

test("planCopy gives every file a fresh stored name and a path under the destination", () => {
  const tree = storedTree();
  const plan = planCopy(tree.children[1], "Sub (1)", "Docs");
  assert.equal(plan.name, "Sub (1)");
  const [leaf] = planFiles(plan);
  assert.equal(leaf.relativePath, "Docs/Sub (1)/b.pdf");
  assert.notEqual(leaf.storedAs, "orig-b.pdf");
  assert.equal(leaf.srcKey, "Lib:Sub/b.pdf");
  assert.equal(planBytes(plan), 5);
});

test("planCopyRoot makes paths relative to the new root, and finishPlan gives working handles", () => {
  const plan = planCopyRoot(storedTree(), "Lib (1)");
  assert.deepEqual(planFiles(plan).map((l) => l.relativePath), ["a.pdf", "Sub/b.pdf"]);
  assert.equal(planBytes(plan), 15);
  const tree = finishPlan(plan, "folder-2", "Lib (1)", true);
  assert.equal(tree.handle.name, "Lib (1)");
  assert.equal(tree.children[0].handle.fileKey, "Lib (1):a.pdf");
  assert.equal(tree.children[0].handle.folderId, "folder-2");
});
