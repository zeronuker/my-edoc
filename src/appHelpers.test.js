import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePageRange,
  STAR_COLORS,
  applyStar,
  starredEntries,
  formatBytes,
  folderListRecords,
  freeSpaceWarning,
  progressWindow,
  omitKeys,
  nextRecentFiles,
  toggleBookmarkList,
  removeBookmarkFromList,
  toggleOutlinePath,
  buildReadingFilter,
  parsePdfDate,
  pageSizeLabel,
  docInfoRows,
  openTab,
  pickNeighbor,
  orderForSplit,
  tabsToRecords,
} from "./appHelpers.js";

test("formatBytes formats across units", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("folderListRecords saves each folder's id, time, manifest and size", () => {
  const tree = { name: "Lib", kind: "directory", children: [{ name: "a.pdf", kind: "file", relativePath: "a.pdf", storedAs: "s-1", size: 4, addedAt: 9 }] };
  const [record] = folderListRecords([
    { dirHandle: { __legacy: true }, folderId: "id-1", connectedAt: 5, tree, sizeBytes: 12 },
  ]);
  assert.equal(record.id, "id-1");
  assert.equal(record.connectedAt, 5);
  assert.equal(record.sizeBytes, 12);
  assert.deepEqual(record.manifest, {
    name: "Lib",
    kind: "directory",
    children: [{ name: "a.pdf", kind: "file", relativePath: "a.pdf", storedAs: "s-1", size: 4, addedAt: 9 }],
  });
});

test("nextRecentFiles de-dupes by name and caps at 10", () => {
  const prev = [{ fileHandle: { name: "a.pdf" }, name: "a.pdf", openedAt: 1 }];
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

test("omitKeys drops only the named keys and leaves the original alone", () => {
  const src = { "a.pdf": 1, "b.pdf": 2 };
  assert.deepEqual(omitKeys(src, ["a.pdf", "zzz.pdf"]), { "b.pdf": 2 });
  assert.deepEqual(src, { "a.pdf": 1, "b.pdf": 2 });
});

test("progressWindow keeps a fixed-size slice around the file being copied", () => {
  assert.deepEqual(progressWindow(10000, 0), [0, 13]);
  assert.deepEqual(progressWindow(10000, 5000), [4996, 5009]);
  assert.deepEqual(progressWindow(10000, 10000), [9987, 10000]);
  assert.deepEqual(progressWindow(5, 2), [0, 5]);
  assert.deepEqual(progressWindow(0, 0), [0, 0]);
});

test("nextRecentFiles keeps two same-named files from different folders as separate entries", () => {
  const a = { name: "Index.pdf", fileKey: "Boeing:Index.pdf" };
  const b = { name: "Index.pdf", fileKey: "Airbus:Index.pdf" };
  const afterBoth = nextRecentFiles(nextRecentFiles([], a), b);
  assert.equal(afterBoth.length, 2);
  const reopened = nextRecentFiles(afterBoth, a);
  assert.deepEqual(reopened.map((e) => e.fileHandle.fileKey), ["Boeing:Index.pdf", "Airbus:Index.pdf"]);
});

test("parsePdfDate reads PDF date strings, with and without a timezone", () => {
  assert.equal(parsePdfDate("D:20240102030405Z").toISOString(), "2024-01-02T03:04:05.000Z");
  assert.equal(parsePdfDate("D:20240102030405+05'30'").toISOString(), "2024-01-01T21:34:05.000Z");
  assert.equal(parsePdfDate("D:2024").toISOString(), "2024-01-01T00:00:00.000Z");
  assert.equal(parsePdfDate("garbage"), null);
  assert.equal(parsePdfDate(undefined), null);
});

test("pageSizeLabel names common paper in either orientation and always gives mm", () => {
  assert.equal(pageSizeLabel(595.28, 841.89), "A4 · 210 × 297 mm");
  assert.equal(pageSizeLabel(841.89, 595.28), "A4 · 297 × 210 mm");
  assert.equal(pageSizeLabel(612, 792), "Letter · 216 × 279 mm");
  assert.equal(pageSizeLabel(300, 400), "106 × 141 mm");
});

test("docInfoRows lists only the facts the file actually has", () => {
  const rows = docInfoRows({
    name: "a.pdf",
    info: { Title: "Manual", Author: "", PDFFormatVersion: "1.7", IsAcroFormPresent: true },
    numPages: 3,
    pageSize: "A4 · 210 × 297 mm",
    bytes: 2048,
  });
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel["File name"], "a.pdf");
  assert.equal(byLabel.Title, "Manual");
  assert.equal(byLabel.Pages, "3");
  assert.equal(byLabel["File size"], "2.0 KB");
  assert.equal(byLabel["PDF version"], "1.7");
  assert.equal(byLabel["Fillable form"], "Yes");
  assert.equal("Author" in byLabel, false);
  assert.equal("Created" in byLabel, false);
});

const fileH = (name, fileKey = name) => ({ name, fileKey });
const keysOf = (tabs) => tabs.map((t) => t.key);

test("openTab appends a new file and reuses the tab of one that is already open", () => {
  const a = fileH("Boeing:a.pdf");
  const b = fileH("Airbus:a.pdf");
  let tabs = openTab([], a);
  tabs = openTab(tabs, b);
  assert.deepEqual(keysOf(tabs), ["Boeing:a.pdf", "Airbus:a.pdf"]);
  const reopened = { ...a };
  tabs = openTab(tabs, reopened);
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].handle, reopened);
});

test("pickNeighbor takes the nearest tab to the right, else to the left, skipping excluded ones", () => {
  const tabs = ["a", "b", "c", "d"].map((n) => ({ key: n, handle: fileH(n) }));
  const pick = (key, ...excluded) => pickNeighbor(tabs, key, new Set(excluded))?.key ?? null;
  assert.equal(pick("b", "b"), "c");
  assert.equal(pick("d", "d"), "c");
  assert.equal(pick("b", "b", "c"), "d");
  assert.equal(pick("b", "b", "c", "d"), "a");
  assert.equal(pick("a", "a", "b", "c", "d"), null);
  assert.equal(pickNeighbor([tabs[0]], "a", new Set(["a"])), null);
});

test("orderForSplit swaps only the two on-screen tabs so the left pane's comes first", () => {
  const tabs = ["a", "b", "c", "d"].map((n) => ({ key: n, handle: fileH(n) }));
  const keys = (list) => keysOf(list).join("");
  assert.equal(keys(orderForSplit(tabs, "a", "c")), "abcd");
  assert.equal(keys(orderForSplit(tabs, "c", "a")), "cbad");
  assert.equal(keys(orderForSplit(tabs, "d", "b")), "adcb");
  const inOrder = orderForSplit(tabs, "a", "d");
  assert.equal(inOrder, tabs);
  assert.equal(orderForSplit(tabs, "a", null), tabs);
  assert.equal(orderForSplit(tabs, "zzz", "a"), tabs);
});

test("tabsToRecords saves a tab's file address and leaves out dropped files that cannot be reopened", () => {
  const tabs = [
    { key: "Lib:a.pdf", handle: { name: "a.pdf", fileKey: "Lib:a.pdf", folderId: "f1", relativePath: "a.pdf", getFile() {} } },
    { key: "dropped.pdf", handle: { name: "dropped.pdf", getFile() {} } },
    { key: "Lib:sub/b.pdf", handle: { name: "b.pdf", fileKey: "Lib:sub/b.pdf", folderId: "f1", relativePath: "sub/b.pdf" } },
  ];
  assert.deepEqual(tabsToRecords(tabs), [
    { name: "a.pdf", folderId: "f1", relativePath: "a.pdf" },
    { name: "b.pdf", folderId: "f1", relativePath: "sub/b.pdf" },
  ]);
  assert.deepEqual(tabsToRecords([]), []);
});

test("the star colours are offered in the agreed order", () => {
  assert.deepEqual(STAR_COLORS.map((c) => c.id), ["red", "green", "purple", "orange", "blue"]);
});

test("applyStar gives files a colour, changes it, and takes it away with null", () => {
  const first = applyStar({}, ["Lib:a.pdf", "Lib:b.pdf"], "red");
  assert.deepEqual(first, { "Lib:a.pdf": "red", "Lib:b.pdf": "red" });
  const second = applyStar(first, ["Lib:a.pdf"], "blue");
  assert.deepEqual(second, { "Lib:a.pdf": "blue", "Lib:b.pdf": "red" });
  assert.deepEqual(applyStar(second, ["Lib:b.pdf"], null), { "Lib:a.pdf": "blue" });
  assert.deepEqual(first, { "Lib:a.pdf": "red", "Lib:b.pdf": "red" }); // never changed in place
});

test("starredEntries keeps starred files in order, and can filter by colour", () => {
  const file = (name) => ({ name, path: "", handle: { name, fileKey: `Lib:${name}` } });
  const files = [file("a.pdf"), file("b.pdf"), file("c.pdf")];
  const stars = { "Lib:a.pdf": "red", "Lib:c.pdf": "blue" };
  assert.deepEqual(starredEntries(files, stars).map((e) => [e.name, e.color]), [["a.pdf", "red"], ["c.pdf", "blue"]]);
  assert.deepEqual(starredEntries(files, stars, "blue").map((e) => e.name), ["c.pdf"]);
});

test("parsePageRange reads singles, ranges, spaces and commas", () => {
  assert.deepEqual(parsePageRange("5, 12-14 300", 500), { pages: [5, 12, 13, 14, 300], bad: [] });
});

test("parsePageRange clips to the page count and flags what is outside or unreadable", () => {
  assert.deepEqual(parsePageRange("8-20", 10), { pages: [8, 9, 10], bad: [] });
  assert.deepEqual(parsePageRange("20-18, 0, abc, 3", 10), { pages: [3], bad: ["20-18", "0", "abc"] });
  assert.deepEqual(parsePageRange("", 10), { pages: [], bad: [] });
});

test("parsePageRange treats a reversed range like a forward one and drops duplicates", () => {
  assert.deepEqual(parsePageRange("7-5, 6", 10), { pages: [5, 6, 7], bad: [] });
});
