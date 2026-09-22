import { buildLegacyManifest } from "./fileSystem.js";

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

// Splits a folders array into the two persisted shapes saveFolderList writes
// — real (Chromium) dirHandle records vs. legacy (OPFS-backed) manifests.
export function folderListRecords(folders) {
  const real = folders.filter((f) => !f.dirHandle.__legacy);
  const legacy = folders.filter((f) => f.dirHandle.__legacy);
  return {
    real: real.map((f) => ({ dirHandle: f.dirHandle, connectedAt: f.connectedAt })),
    legacy: legacy.map((f) => ({
      id: f.folderId,
      connectedAt: f.connectedAt,
      manifest: buildLegacyManifest(f.tree),
      sizeBytes: f.sizeBytes,
    })),
  };
}

// De-dupes by filename and caps at 10, most recent first.
export function nextRecentFiles(prev, fileHandle) {
  return [
    { fileHandle, name: fileHandle.name, openedAt: Date.now() },
    ...prev.filter((e) => e.name !== fileHandle.name),
  ].slice(0, 10);
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
