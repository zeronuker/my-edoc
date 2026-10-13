import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  folderListRecords,
  freeSpaceWarning,
  namesToClean,
  omitKeys,
  nextRecentFiles,
  toggleBookmarkList,
  removeBookmarkFromList,
  toggleOutlinePath,
  buildReadingFilter,
} from "./appHelpers.js";

test("formatBytes formats across units", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("folderListRecords saves each folder's id, time, manifest and size", () => {
  const tree = { name: "Lib", kind: "directory", children: [{ name: "a.pdf", kind: "file", relativePath: "a.pdf" }] };
  const [record] = folderListRecords([
    { dirHandle: { __legacy: true }, folderId: "id-1", connectedAt: 5, tree, sizeBytes: 12 },
  ]);
  assert.equal(record.id, "id-1");
  assert.equal(record.connectedAt, 5);
  assert.equal(record.sizeBytes, 12);
  assert.deepEqual(record.manifest, {
    name: "Lib",
    kind: "directory",
    children: [{ name: "a.pdf", kind: "file", relativePath: "a.pdf" }],
  });
});

test("nextRecentFiles de-dupes by name and caps at 10", () => {
  const prev = [{ fileHandle: {}, name: "a.pdf", openedAt: 1 }];
  const next = nextRecentFiles(prev, { name: "a.pdf" });
  assert.equal(next.length, 1);
  assert.equal(next[0].name, "a.pdf");
});

test("toggleBookmarkList adds then removes a page, keeping sort order", () => {
  const added = toggleBookmarkList([{ page: 5, createdAt: 1 }], 2);
  assert.deepEqual(added.map((b) => b.page), [2, 5]);
  const removed = toggleBookmarkList(added, 2);
  assert.deepEqual(removed.map((b) => b.page), [5]);
});

test("removeBookmarkFromList drops only the matching page", () => {
  const list = [{ page: 1 }, { page: 2 }];
  assert.deepEqual(removeBookmarkFromList(list, 1), [{ page: 2 }]);
});

test("toggleOutlinePath adds then removes a path", () => {
  const added = toggleOutlinePath([], "0-1");
  assert.deepEqual(added, ["0-1"]);
  assert.deepEqual(toggleOutlinePath(added, "0-1"), []);
});

test("buildReadingFilter combines preset and sliders", () => {
  assert.equal(buildReadingFilter("off", 100, 100), "none");
  assert.equal(buildReadingFilter("night", 100, 100), "invert(1) hue-rotate(180deg)");
  assert.equal(buildReadingFilter("sepia", 100, 100), "sepia(0.7)");
  assert.equal(buildReadingFilter("off", 120, 100), "brightness(120%)");
  assert.equal(buildReadingFilter("off", 100, 80), "contrast(80%)");
  assert.equal(
    buildReadingFilter("night", 120, 80),
    "invert(1) hue-rotate(180deg) brightness(120%) contrast(80%)"
  );
});

test("freeSpaceWarning only speaks up when it won't fit, and stays quiet if free space is unknown", () => {
  assert.equal(freeSpaceWarning("These files", 100, 100), null);
  assert.equal(freeSpaceWarning("These files", 100, null), null);
  const note = freeSpaceWarning("This file", 3 * 1024 * 1024, 1024 * 1024);
  assert.match(note, /^This file \(3\.0 MB\) is bigger than the space free on this device \(1\.0 MB\)/);
});

test("namesToClean keeps extras for a name that another file still carries", () => {
  assert.deepEqual(namesToClean(["a.pdf", "b.pdf", "a.pdf"], ["b.pdf", "c.pdf"]), ["a.pdf"]);
  assert.deepEqual(namesToClean([], ["x.pdf"]), []);
});

test("omitKeys drops only the named keys and leaves the original alone", () => {
  const src = { "a.pdf": 1, "b.pdf": 2 };
  assert.deepEqual(omitKeys(src, ["a.pdf", "zzz.pdf"]), { "b.pdf": 2 });
  assert.deepEqual(src, { "a.pdf": 1, "b.pdf": 2 });
});
