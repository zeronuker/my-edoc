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
      .then((res) => {
        if (!res.ok) throw new Error(`The PDF engine failed to download (${res.status})`);
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      // A failed download is not kept: the next open tries again.
      .catch((err) => {
        workerSrcPromise = undefined;
        throw err;
      });
  }
  return workerSrcPromise;
}

// The app registers a function that asks the user for a password in its own
// dialog (see App.jsx): it gets { name, wrong } and resolves to the password,
// or null if they cancel. Until one is registered, a password-protected file
// just fails to open.
let passwordAsker = null;
export function setPasswordAsker(fn) {
  passwordAsker = fn;
}

// onPasswordPrompt (optional) fires the instant a password is needed, before
// asking for it — callers use it to cancel any load timeout they're racing
// against, since the user may take as long as they like to answer.
//
// name (optional) is what to call the file when asking for its password.
//
// skipPassword (optional) skips the question entirely and just fails the load
// — for background work (e.g. text indexing) that shouldn't ever pop a
// dialog for a file the user didn't ask to open.
export async function loadDocument(fileOrArrayBuffer, { onPasswordPrompt, skipPassword, name } = {}) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = await getWorkerSrc();
  const data =
    fileOrArrayBuffer instanceof File
      ? await fileOrArrayBuffer.arrayBuffer()
      : fileOrArrayBuffer;
  const loadingTask = pdfjsLib.getDocument({ data });
  let cancelled = false;
  loadingTask.onPassword = async (updatePassword, reason) => {
    if (skipPassword) {
      loadingTask.destroy();
      return;
    }
    onPasswordPrompt?.();
    const wrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
    const password = passwordAsker ? await passwordAsker({ name, wrong }) : null;
    if (password == null) {
      cancelled = true;
      loadingTask.destroy();
      return;
    }
    updatePassword(password);
  };
  // Cancelling the password question rejects like a failure; mark it so
  // callers can tell it apart.
  return loadingTask.promise.catch((err) => {
    throw cancelled ? Object.assign(new Error("Password entry cancelled"), { cancelled: true }) : err;
  });
}
