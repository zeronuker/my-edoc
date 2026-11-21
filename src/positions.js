import { dbGet, dbSet } from "./db.js";

// Where each file was left: { fileKey: { page, scale, numPages } }. Kept in
// memory and written to storage once reading settles (a page turn or a zoom
// step used to rewrite the whole table), and straight away when the page is
// hidden or closed. Every reader and writer shares this one copy, so two
// panes can't overwrite each other's updates.
const SAVE_DELAY_MS = 1000;

let loading = null;
let timer = null;

// The shared table. Read it freely; change it through the functions below.
export function getPositions() {
  loading ??= dbGet("filePositions")
    .then((saved) => saved || {})
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

async function flush() {
  clearTimeout(timer);
  timer = null;
  if (loading) await dbSet("filePositions", await loading);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch(console.error), SAVE_DELAY_MS);
}

export async function savePosition(key, position) {
  (await getPositions())[key] = position;
  schedule();
}

// `change(all)` edits the table in place (removing or copying entries).
export async function updatePositions(change) {
  change(await getPositions());
  schedule();
}

addEventListener("pagehide", () => flush().catch(() => {}));
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush().catch(() => {});
});
