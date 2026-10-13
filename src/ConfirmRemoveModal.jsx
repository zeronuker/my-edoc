// Same modal shell as AnnotationModePicker.jsx. Asked before the tree's ×
// does anything. `request` is { name, kind, isLegacy, isRoot, count }: on
// iPad/phone (isLegacy) the × deletes the app's own copy of the file(s);
// on desktop there's no app copy, so it hides a subfolder/file, or
// disconnects a whole folder (isRoot). Either way the user's real files
// are never touched, and the copy says so.
export default function ConfirmRemoveModal({ request, busy, onConfirm, onClose, closing }) {
  const { name, kind, isLegacy, isRoot, count } = request;
  const isFolder = kind === "directory";
  const noun = isFolder ? "FOLDER" : "FILE";

  let body;
  if (!isLegacy && isRoot) {
    body = `Remove "${name}" from the app? Your files on disk aren't touched.`;
  } else if (!isLegacy) {
    body = `Hide "${name}" from the app? Your ${isFolder ? "files" : "file"} on disk ${isFolder ? "aren't" : "isn't"} touched.`;
  } else if (isFolder) {
    body = `Remove "${name}" and its ${count} file${count === 1 ? "" : "s"} from this device? Your original files aren't touched.`;
  } else {
    body = `Remove "${name}" from this device? Your original file isn't touched.`;
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <div className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">×</span>
          <div>
            <div className="update-dialog-title">{isLegacy || isRoot ? "REMOVE" : "HIDE"} {noun}</div>
            <div className="update-dialog-subtitle">{name}</div>
          </div>
        </div>

        <div className="update-dialog-body">{body}</div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={onConfirm} disabled={busy}>
            {busy ? "Removing…" : isLegacy || isRoot ? "Remove" : "Hide"}
          </button>
        </div>
      </div>
    </>
  );
}
