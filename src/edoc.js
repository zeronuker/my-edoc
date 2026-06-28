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

// React StrictMode mounts each effect twice (mount, cleanup, mount again)
// on the SAME canvas DOM node, racing two independent async chains that
// both end up calling page.render() on it. Cancelling from the effect's
// own closure isn't enough — by the time a stale call's cleanup runs, the
// other call may already be past the point of no return. Tracking the
// in-flight task on the canvas element itself is the one synchronization
// point both calls share, so whichever calls render() second can always
// cancel whatever's already running there first.
export async function startPageRender(pdf, pageNumber, canvas, scale = 1) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");

  canvas.__renderTask?.cancel();
  const task = page.render({ canvasContext: context, viewport });
  canvas.__renderTask = task;
  task.promise.finally(() => {
    if (canvas.__renderTask === task) canvas.__renderTask = null;
  });
  return task;
}
