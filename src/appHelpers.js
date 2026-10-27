import { buildLegacyManifest, extrasKey } from "./fileSystem.js";

export function formatBytes(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

// Which slice [start, end) of a long list of files to draw in the copy
// progress window: a few finished ones above the file being copied and the
// next few below, always the same number of rows (fewer only when the whole
// list is shorter).
export function progressWindow(total, doneCount, before = 4, after = 8) {
  const size = before + after + 1;
  const active = Math.min(Math.max(doneCount, 0), Math.max(total - 1, 0));
  const start = Math.max(0, Math.min(active - before, total - size));
  return [start, Math.min(total, start + size)];
}

// A copy of `obj` without the given keys.
export function omitKeys(obj, keys) {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k)));
}

// The note shown when something being copied in is bigger than the space
// left (null when it fits, or when the free space isn't known). It only
// warns — a copy that doesn't fit fails on its own with an error.
export function freeSpaceWarning(label, neededBytes, freeBytes) {
  if (freeBytes == null || neededBytes <= freeBytes) return null;
  return `${label} (${formatBytes(neededBytes)}) is bigger than the space free on this device (${formatBytes(Math.max(0, freeBytes))}). It may not fully save.`;
}

// The persisted shape of each folder: its OPFS id, when it was added, a
// manifest of its shape (no file bytes — those live in OPFS under the id) and
// the size the app tracks for it.
export function folderListRecords(folders) {
  return folders.map((f) => ({
    id: f.folderId,
    connectedAt: f.connectedAt,
    manifest: buildLegacyManifest(f.tree),
    sizeBytes: f.sizeBytes,
  }));
}

// De-dupes by file (folder + path, so two same-named files stay separate)
// and caps at 10, most recent first.
export function nextRecentFiles(prev, fileHandle) {
  return [
    { fileHandle, name: fileHandle.name, openedAt: Date.now() },
    ...prev.filter((e) => extrasKey(e.fileHandle) !== extrasKey(fileHandle)),
  ].slice(0, 10);
}

// Open-document tabs: [{ key, handle }], key being the file's extrasKey
// (folder + path), so two same-named files in different folders get two tabs.
// A file that's already open keeps its tab (and takes the fresh handle).
export function openTab(tabs, handle) {
  const key = extrasKey(handle);
  return tabs.some((t) => t.key === key)
    ? tabs.map((t) => (t.key === key ? { key, handle } : t))
    : [...tabs, { key, handle }];
}

// Which tab takes over when the one at `key` goes: the nearest to its right,
// else the nearest to its left, skipping any key in `excluded` (tabs that are
// closing too, or already showing in the other pane). Null if none is left.
export function pickNeighbor(tabs, key, excluded) {
  const i = tabs.findIndex((t) => t.key === key);
  const free = (t) => !excluded.has(t.key);
  return tabs.slice(i + 1).find(free) ?? tabs.slice(0, Math.max(i, 0)).reverse().find(free) ?? null;
}

// In a split the left pane's tab always sits left of the right pane's: when
// it doesn't, just those two swap places and every other tab stays put.
export function orderForSplit(tabs, leftKey, rightKey) {
  const l = tabs.findIndex((t) => t.key === leftKey);
  const r = tabs.findIndex((t) => t.key === rightKey);
  if (l < 0 || r < 0 || l < r) return tabs;
  const next = [...tabs];
  [next[l], next[r]] = [next[r], next[l]];
  return next;
}

// The tabs as plain data for IndexedDB: a handle can't be cloned into it
// (function properties), so each file is saved as its OPFS address, turned
// back into a working handle on the next launch. A dropped file has no folder
// copy to reopen, so it is left out.
export function tabsToRecords(tabs) {
  return tabs
    .filter((t) => t.handle.folderId)
    .map((t) => ({ name: t.handle.name, folderId: t.handle.folderId, relativePath: t.handle.relativePath }));
}

export function toggleBookmarkList(existing, page) {
  return existing.some((b) => b.page === page)
    ? existing.filter((b) => b.page !== page)
    : [...existing, { page, createdAt: Date.now() }].sort((a, b) => a.page - b.page);
}

export function removeBookmarkFromList(existing, page) {
  return existing.filter((b) => b.page !== page);
}

export function toggleOutlinePath(existing, path) {
  return existing.includes(path) ? existing.filter((p) => p !== path) : [...existing, path];
}

// Combines the night/sepia preset with the brightness/contrast sliders into
// one CSS filter string for the canvas. Brightness/contrast only appear in
// the string when they diverge from 100 (the neutral value), keeping the
// common case (no sliders touched) at "none" or just the bare preset.
export function buildReadingFilter(theme, brightness, contrast) {
  const parts = [];
  if (theme === "night") parts.push("invert(1)", "hue-rotate(180deg)");
  else if (theme === "sepia") parts.push("sepia(0.7)");
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  return parts.length ? parts.join(" ") : "none";
}

// PDF dates look like "D:20240102030405+05'30'" (every part after the year is
// optional). Returns a Date, or null when it isn't one. A missing zone is read
// as UTC — the spec says local time, but the day is what the dialog shows.
export function parsePdfDate(str) {
  const m = /^D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?(?:Z|([+-])(\d\d)'?(\d\d)?)?/.exec(str ?? "");
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", sign, oh = "00", om = "00"] = m;
  const offsetMin = (sign === "-" ? -1 : 1) * (+oh * 60 + +om);
  const date = new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s) - offsetMin * 60000);
  return isNaN(date) ? null : date;
}

const PAPER_SIZES = [
  ["A3", 842, 1191],
  ["A4", 595, 842],
  ["A5", 420, 595],
  ["Letter", 612, 792],
  ["Legal", 612, 1008],
];

// A page's size in points (1/72 in) as "A4 · 210 × 297 mm" — the paper name
// only when it matches a common one (either orientation, within 3pt).
export function pageSizeLabel(widthPt, heightPt) {
  const [short, long] = widthPt < heightPt ? [widthPt, heightPt] : [heightPt, widthPt];
  const paper = PAPER_SIZES.find(([, w, h]) => Math.abs(w - short) <= 3 && Math.abs(h - long) <= 3);
  const mm = (pt) => Math.round((pt * 25.4) / 72);
  return `${paper ? `${paper[0]} · ` : ""}${mm(widthPt)} × ${mm(heightPt)} mm`;
}

const DATE_FORMAT = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

// The rows of the Document properties dialog; anything the file doesn't say
// is left out rather than shown blank. `info` is pdf.js's getMetadata().info.
export function docInfoRows({ name, info = {}, numPages, pageSize, bytes }) {
  const date = (str) => parsePdfDate(str)?.toLocaleString(undefined, DATE_FORMAT);
  return [
    ["File name", name],
    ["Title", info.Title],
    ["Author", info.Author],
    ["Subject", info.Subject],
    ["Keywords", info.Keywords],
    ["Pages", numPages != null ? String(numPages) : null],
    ["Page size", pageSize],
    ["File size", bytes != null ? formatBytes(bytes) : null],
    ["Created", date(info.CreationDate)],
    ["Modified", date(info.ModDate)],
    ["Created with", info.Creator],
    ["PDF producer", info.Producer],
    ["PDF version", info.PDFFormatVersion],
    ["Fillable form", info.IsAcroFormPresent ? "Yes" : null],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => ({ label, value }));
}

// One color per nesting depth (root, then each level under it), cycling
// back to the start past the 5th level. A file has no depth-color of its
// own — it takes its parent folder's color, tinted toward white so the
// folder above it still reads as the "full strength" version.
const LEVEL_COLORS = [
  "hsl(210 65% 68%)",
  "hsl(174 60% 58%)",
  "hsl(140 45% 60%)",
  "hsl(38 70% 62%)",
  "hsl(10 65% 65%)",
];

export function folderLevelColor(depth) {
  return LEVEL_COLORS[depth % LEVEL_COLORS.length];
}

export function fileLevelColor(depth) {
  const parent = LEVEL_COLORS[(depth - 1) % LEVEL_COLORS.length];
  return `color-mix(in srgb, ${parent} 50%, white)`;
}
