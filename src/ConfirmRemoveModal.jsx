import ChamferFrame from "@brand/ChamferFrame";
// Same modal shell as the other dialogs. Asked before the tree's × does
// anything. `request` is { name, kind, count }: the × deletes the app's own
// copy of the file(s) — the user's original files are never touched, and
// the copy says so. annotatedCount / otherCount are how many of the files
// also lose saved annotations / bookmarks and a saved page.
export default function ConfirmRemoveModal({ request, busy, onConfirm, onClose, closing }) {
  const { name, kind, count, annotatedCount = 0, otherCount = 0 } = request;
  const isFolder = kind === "directory";

  const body = isFolder
    ? `Remove "${name}" and its ${count} file${count === 1 ? "" : "s"} from this device? Your original files aren't touched.`
    : `Remove "${name}" from this device? Your original file isn't touched.`;

  let extra = null;
  if (annotatedCount > 0) {
    extra = `This also deletes your saved annotations${annotatedCount > 1 ? ` on ${annotatedCount} files` : ""}, and their bookmarks and saved page.`;
  } else if (otherCount > 0) {
    extra = `This also deletes the bookmarks and saved page for ${otherCount > 1 ? `${otherCount} files` : "it"}.`;
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">×</span>
          <div>
            <div className="update-dialog-title">REMOVE {isFolder ? "FOLDER" : "FILE"}</div>
            <div className="update-dialog-subtitle">{name}</div>
          </div>
        </div>

        <div className="update-dialog-body">
          {body}
          {extra && <> {extra}</>}
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={onConfirm} disabled={busy}>
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
