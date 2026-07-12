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

// onPasswordPrompt (optional) fires the instant a password is needed, before
// the blocking window.prompt() call — callers use it to cancel any load
// timeout they're racing against, since prompt() freezes the JS thread and
// would otherwise leave that timeout queued to fire the moment the user
// finally answers.
//
// skipPassword (optional) skips the prompt entirely and just fails the load
// — for background work (e.g. text indexing) that shouldn't ever pop a
// blocking dialog for a file the user didn't ask to open.
export async function loadDocument(fileOrArrayBuffer, { onPasswordPrompt, skipPassword } = {}) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = await getWorkerSrc();
  const data =
    fileOrArrayBuffer instanceof File
      ? await fileOrArrayBuffer.arrayBuffer()
      : fileOrArrayBuffer;
  const loadingTask = pdfjsLib.getDocument({ data });
  loadingTask.onPassword = (updatePassword, reason) => {
    if (skipPassword) {
      loadingTask.destroy();
      return;
    }
    onPasswordPrompt?.();
    const message =
      reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
        ? "Incorrect password. Try again:"
        : "This PDF is password protected. Enter password:";
    const password = window.prompt(message);
    if (password == null) {
      loadingTask.destroy();
      return;
    }
    updatePassword(password);
  };
  return loadingTask.promise;
}
