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
  writeFileIntoFolder,
  buildTreeManifest,
  filterTreeByManifest,
  applySavedList,
  listDirFileNames,
  unionNames,
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

function scanFile(name) {
  return { name, kind: "file", handle: { name } };
}
function scanDir(name, children) {
  return { name, kind: "directory", handle: { name }, children };
}

test("buildTreeManifest keeps only names and kinds", () => {
  const tree = scanDir("Lib", [scanFile("a.pdf"), scanDir("Sub", [scanFile("b.pdf")])]);
  assert.deepEqual(buildTreeManifest(tree), {
    name: "Lib",
    kind: "directory",
    children: [
      { name: "a.pdf", kind: "file" },
      { name: "Sub", kind: "directory", children: [{ name: "b.pdf", kind: "file" }] },
    ],
  });
});

test("filterTreeByManifest keeps removed items out, new files out, and keeps real handles", () => {
  const saved = buildTreeManifest(scanDir("Lib", [scanFile("a.pdf"), scanDir("Sub", [scanFile("b.pdf")])]));
  // the disk now also has c.pdf (new) and Sub/d.pdf (new); the user had removed Sub/b.pdf earlier
  const manifest = {
    ...saved,
    children: [saved.children[0], { name: "Sub", kind: "directory", children: [] }],
  };
  const scan = scanDir("Lib", [
    scanFile("a.pdf"),
    scanFile("c.pdf"),
    scanDir("Sub", [scanFile("b.pdf"), scanFile("d.pdf")]),
  ]);
  const result = filterTreeByManifest(scan, manifest);
  assert.deepEqual(result.children.map((c) => c.name), ["a.pdf"]);
  assert.equal(result.children[0].handle, scan.children[0].handle);
});

test("filterTreeByManifest skips a listed file that is gone from disk", () => {
  const manifest = buildTreeManifest(scanDir("Lib", [scanFile("a.pdf"), scanFile("gone.pdf")]));
  const result = filterTreeByManifest(scanDir("Lib", [scanFile("a.pdf")]), manifest);
  assert.deepEqual(result.children.map((c) => c.name), ["a.pdf"]);
});

test("applySavedList uses the list when there is one, else drops the excluded paths from the scan", () => {
  const scan = scanDir("Lib", [scanFile("a.pdf"), scanDir("Sub", [scanFile("b.pdf")])]);
  const withList = applySavedList(scan, { manifest: buildTreeManifest(scanDir("Lib", [scanFile("a.pdf")])) });
  assert.deepEqual(withList.children.map((c) => c.name), ["a.pdf"]);
  const withExclude = applySavedList(scan, { exclude: ["Sub"] });
  assert.deepEqual(withExclude.children.map((c) => c.name), ["a.pdf"]);
  assert.equal(applySavedList(scan), scan);
});

test("unionNames merges case-insensitively and the later spelling wins", () => {
  assert.deepEqual(unionNames(["A.pdf", "b.pdf"], ["a.PDF", "c.pdf"]).sort(), ["a.PDF", "b.pdf", "c.pdf"]);
});

test("listDirFileNames lists only the files of that directory, and is empty if it can't be read", async () => {
  const sub = {
    values: async function* () {
      yield { kind: "file", name: "x.pdf" };
      yield { kind: "directory", name: "Deeper" };
      yield { kind: "file", name: "y.pdf" };
    },
  };
  const root = { getDirectoryHandle: async (n) => (n === "Sub" ? sub : Promise.reject(new Error("missing"))) };
  assert.deepEqual(await listDirFileNames(root, "Sub"), ["x.pdf", "y.pdf"]);
  assert.deepEqual(await listDirFileNames(root, "Nope"), []);
});
