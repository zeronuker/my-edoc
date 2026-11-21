// public/pdf.worker.mjs is a copy of the worker that ships with pdfjs-dist (see
// src/edoc.js). If pdfjs-dist is updated and the copy is not, every PDF fails
// to open with a version-mismatch error, so keep the copy in step on each
// dev / build run.
import { copyFileSync, readFileSync } from "node:fs";

const from = "node_modules/pdfjs-dist/build/pdf.worker.mjs";
const to = "public/pdf.worker.mjs";

if (!readFileSync(from).equals(readFileSync(to))) {
  copyFileSync(from, to);
  console.log("Updated public/pdf.worker.mjs to match pdfjs-dist");
}
