import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  folderListRecords,
  nextRecentFiles,
  toggleBookmarkList,
  removeBookmarkFromList,
  toggleOutlinePath,
} from "./appHelpers.js";

test("formatBytes formats across units", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("folderListRecords splits real vs legacy folders", () => {
  const real = { dirHandle: { name: "Real" }, connectedAt: 1 };
  const legacy = {
    dirHandle: { __legacy: true },
    connectedAt: 2,
    folderId: "id1",
    sizeBytes: 10,
    tree: { name: "Legacy", kind: "directory", children: [] },
  };
  const { real: realOut, legacy: legacyOut } = folderListRecords([real, legacy]);
  assert.equal(realOut.length, 1);
  assert.equal(realOut[0].dirHandle, real.dirHandle);
  assert.equal(legacyOut.length, 1);
  assert.equal(legacyOut[0].id, "id1");
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
