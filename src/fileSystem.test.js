import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTreeFromFileList, flattenTreeFileHandlesWithPath, wrapDroppedFile } from "./fileSystem.js";

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
