import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTreeFromFileList,
  flattenTreeFileHandlesWithPath,
  wrapDroppedFile,
  listDirectoryPaths,
  filesInDirectory,
  uniqueFileName,
  planAddedFiles,
  insertFilesIntoTree,
  writeFileIntoFolder,
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

test("listDirectoryPaths lists the root first, then every nested folder", () => {
  const tree = buildTreeFromFileList([mockFile("Lib/a.pdf"), mockFile("Lib/Sub/b.pdf"), mockFile("Lib/Sub/Deep/c.pdf")]);
  assert.deepEqual(listDirectoryPaths(tree), ["", "Sub", "Sub/Deep"]);
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

test("writeFileIntoFolder writes into the nested directory and returns its handle", async () => {
  const written = [];
  const subDir = {
    getFileHandle: async (name, opts) => ({
      name,
      opts,
      createWritable: async () => ({ write: async (f) => written.push(f), close: async () => {} }),
    }),
  };
  const root = { getDirectoryHandle: async (n) => (n === "Sub" ? subDir : assert.fail("wrong dir")) };
  const file = { name: "x.pdf" };
  const handle = await writeFileIntoFolder(root, "Sub", "x (1).pdf", file);
  assert.equal(handle.name, "x (1).pdf");
  assert.deepEqual(handle.opts, { create: true });
  assert.deepEqual(written, [file]);
});
