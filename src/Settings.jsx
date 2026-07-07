// Same modal shell as UpdatePrompt.jsx (.modal-backdrop/.modal-dialog),
// just with settings controls instead of an update notice.
export default function Settings({ settings, onChange, onClose, update }) {
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog settings-dialog">
        <div className="update-dialog-header">
          <span className="update-dialog-icon">⚙</span>
          <div>
            <div className="update-dialog-title">SETTINGS</div>
            <div className="update-dialog-subtitle">CLAUDEBORNE EDOCUMENT READER</div>
          </div>
        </div>

        <div className="settings-row">
          <label htmlFor="settings-theme">Theme</label>
          <select
            id="settings-theme"
            value={settings.theme}
            onChange={(e) => onChange({ theme: e.target.value })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="settings-row">
          <label htmlFor="settings-resume">Resume last position</label>
          <input
            id="settings-resume"
            type="checkbox"
            checked={settings.resumePosition}
            onChange={(e) => onChange({ resumePosition: e.target.checked })}
          />
        </div>

        <div className="settings-row">
          <label htmlFor="settings-keep-awake">Keep screen awake while reading</label>
          <input
            id="settings-keep-awake"
            type="checkbox"
            checked={settings.keepAwake}
            onChange={(e) => onChange({ keepAwake: e.target.checked })}
          />
        </div>

        <div className="settings-section-head">APP UPDATE</div>

        <div className="settings-row">
          <label>Current build</label>
          <span className="settings-value">{update.current.version}</span>
        </div>

        <div className="settings-update-row">
          {update.needRefresh ? (
            <button
              className="cb-btn cb-btn--primary"
              onClick={() => update.updateServiceWorker(true)}
            >
              UPDATE NOW
            </button>
          ) : (
            <button
              className="cb-btn"
              onClick={update.checkForUpdate}
              disabled={update.checkingUpdate}
            >
              {update.checkingUpdate ? "CHECKING…" : "CHECK FOR UPDATES"}
            </button>
          )}
          {update.needRefresh && (
            <span className="settings-update-status settings-update-status--available">
              NEW VERSION AVAILABLE
            </span>
          )}
          {!update.needRefresh && update.updateChecked && !update.checkingUpdate && (
            <span className="settings-update-status">NO UPDATE AVAILABLE</span>
          )}
        </div>

        <div className="update-dialog-actions settings-actions">
          <button className="cb-btn cb-btn--primary" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </>
  );
}
