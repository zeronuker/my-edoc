import * as pdfjsLib from "pdfjs-dist";

// ponytail: worker is copied to public/pdf.worker.mjs (re-copy from
// node_modules/pdfjs-dist/build/pdf.worker.mjs if the pdfjs-dist version
// changes). Vite's dev server intercepts `new Worker(url, {type:'module'})`
// as a module-graph request no matter where the file lives, breaking it
// (HMR injection for node_modules paths, outright refusal for public/).
// Fetching the raw bytes and loading via blob: URL sidesteps the dev
// server entirely once the bytes are in hand.
let workerSrcPromise;
async function getWorkerSrc() {
  if (!workerSrcPromise) {
    workerSrcPromise = fetch("/pdf.worker.mjs")
      .then((res) => res.blob())
      .then((blob) => URL.createObjectURL(blob));
  }
  return workerSrcPromise;
}

export async function loadDocument(fileOrArrayBuffer) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = await getWorkerSrc();
  const data =
    fileOrArrayBuffer instanceof File
      ? await fileOrArrayBuffer.arrayBuffer()
      : fileOrArrayBuffer;
  return pdfjsLib.getDocument({ data }).promise;
}

export async function renderPageToCanvas(pdf, pageNumber, canvas, scale = 1) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  return viewport;
}
