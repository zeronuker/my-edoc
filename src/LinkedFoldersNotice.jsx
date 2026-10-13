// Shown once, on the first launch after folders stopped being "linked to
// the disk": every folder now lives in the app's own storage, the same on
// every device. Old linked folders can't be converted without the user
// picking them again (copying needs the user's own folder pick), so they're
// dropped and listed here. Same modal shell as ConfirmRemoveModal.jsx.
export default function LinkedFoldersNotice({ names, onClose }) {
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog mode-picker-dialog">
        <div className="update-dialog-header">
          <span className="update-dialog-icon">!</span>
          <div>
            <div className="update-dialog-title">ADD FOLDERS AGAIN</div>
            <div className="update-dialog-subtitle">
              {names.length} FOLDER{names.length === 1 ? "" : "S"}
            </div>
          </div>
        </div>

        <div className="update-dialog-body">
          Folders are now copied into the app, the same on every device. {names.length === 1 ? "This folder was" : "These folders were"} linked
          to your disk, which is no longer supported. Add {names.length === 1 ? "it" : "them"} again with + → Add folder. Your
          files on disk weren't touched.
        </div>
        <ul className="linked-notice-list">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        <div className="update-dialog-actions">
          <button className="cb-btn update-dialog-now" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
