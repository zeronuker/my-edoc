import { useState } from "react";
import { CHANGELOG } from "./changelog";

// Single source of truth: the app's displayed version is always the newest
// changelog entry, so it can never drift out of sync with a hand-maintained
// version string elsewhere.
const APP_VERSION = CHANGELOG[CHANGELOG.length - 1].v;

// Render a changelog note: pull a leading NEW/IMP/FIX/DEP tag into a styled badge.
function renderNote(n) {
  const m = /^(NEW|IMP|FIX|DEP):\s*/.exec(n);
  if (!m) return n;
  return (
    <>
      <span className={`sm-cl-tag sm-cl-tag-${m[1]}`}>{m[1]}</span>
      {n.slice(m[0].length)}
    </>
  );
}

// Same modal shell as UpdatePrompt.jsx (.modal-backdrop/.modal-dialog),
// just with settings controls instead of an update notice.
export default function Settings({ settings, onChange, onClose, update, isMobile }) {
  const [showHistory, setShowHistory] = useState(false);
  const currentEntry = CHANGELOG.find((e) => e.current) || CHANGELOG[CHANGELOG.length - 1];
  const pastEntries = CHANGELOG.filter((e) => e !== currentEntry).slice().reverse();

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

        {/* Forced on phone regardless of this setting (see App.jsx selectFile),
            so offering it there would be a no-op — hidden instead. */}
        {!isMobile && (
          <div className="settings-row">
            <label htmlFor="settings-auto-hide-sidebar">Auto-hide panel after opening a file</label>
            <input
              id="settings-auto-hide-sidebar"
              type="checkbox"
              checked={settings.autoHideSidebar}
              onChange={(e) => onChange({ autoHideSidebar: e.target.checked })}
            />
          </div>
        )}

        <div className="settings-section-head">APP UPDATE</div>

        <div className="settings-row">
          <label>Version</label>
          <span className="settings-value">{APP_VERSION}</span>
        </div>

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

        <div className="settings-section-head">CHANGELOG</div>

        <div className="sm-changelog">
          <article className="sm-cl-entry current">
            <div className="sm-cl-head">
              <span className="sm-cl-v">{currentEntry.v}</span>
              <span className="sm-cl-date">{currentEntry.date}</span>
              <span className="sm-cl-now">// you are here</span>
            </div>
            <h4 className="sm-cl-title">{currentEntry.title}</h4>
            <ul className="sm-cl-notes">
              {currentEntry.notes.map((n, i) => <li key={i}>{renderNote(n)}</li>)}
            </ul>
          </article>

          {pastEntries.length > 0 && (
            <button className="sm-cl-history-toggle" onClick={() => setShowHistory((v) => !v)}>
              <span>{showHistory ? "▲" : "▼"}</span>
              <span>{showHistory ? "Hide" : "Show"} previous versions ({pastEntries.length})</span>
            </button>
          )}

          {showHistory && pastEntries.map((e) => (
            <article key={e.v} className="sm-cl-entry">
              <div className="sm-cl-head">
                <span className="sm-cl-v">{e.v}</span>
                <span className="sm-cl-date">{e.date}</span>
              </div>
              <h4 className="sm-cl-title">{e.title}</h4>
              <ul className="sm-cl-notes">
                {e.notes.map((n, i) => <li key={i}>{renderNote(n)}</li>)}
              </ul>
            </article>
          ))}
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
