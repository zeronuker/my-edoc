import { useEffect, useRef, useState } from "react";
import { CHANGELOG } from "./changelog";
import Changelog, { currentVersion } from "@brand/Changelog";
import { useTransitionAnim } from "./useTransitionAnim.js";

// Single source of truth: the app's displayed version is always the newest
// changelog entry, so it can never drift out of sync with a hand-maintained
// version string elsewhere.
const APP_VERSION = currentVersion(CHANGELOG);

const TABS = [
  { id: "appearance", label: "APPEARANCE", icon: "◐" },
  { id: "reading", label: "READING", icon: "▤" },
  { id: "about", label: "ABOUT", icon: "ⓘ" },
];
const TAB_IDS = TABS.map((t) => t.id);

const ON_OFF = [
  { value: true, label: "ON" },
  { value: false, label: "OFF" },
];

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Same modal shell as UpdatePrompt.jsx (.modal-backdrop/.modal-dialog); layout
// mirrors superapp's SettingsPanel: tab rail (wide) / tab strip (narrow),
// segmented toggles, titled sections.
export default function Settings({ settings, onChange, onClose, update, isMobile, closing }) {
  const [tab, setTab] = useState("appearance");
  const dialogRef = useRef(null);
  const anim = useTransitionAnim(tab, TAB_IDS, settings.animStyle);
  const animOn = settings.animEnabled !== false;

  // Focus the dialog on open, restore focus on close.
  useEffect(() => {
    const prev = document.activeElement;
    dialogRef.current?.querySelector(FOCUSABLE)?.focus();
    return () => prev?.focus?.();
  }, []);

  // Trap Tab inside the dialog.
  function onKeyDown(e) {
    if (e.key !== "Tab") return;
    const els = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={onKeyDown}
        className={`modal-dialog settings-dialog${closing ? " is-closing" : ""}`}
      >
        <div className="settings-header">
          <span className="settings-header-title">⚙ SETTINGS</span>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-layout">
          <div className="settings-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`settings-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <span className="settings-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="settings-content">
            <div key={tab} className={anim.className} style={anim.style}>
              {tab === "appearance" && (
                <>
                  <Section title="THEME">
                    <Row label="MODE">
                      <Segmented
                        options={[
                          { value: "system", label: "SYSTEM" },
                          { value: "light", label: "LIGHT" },
                          { value: "dark", label: "DARK" },
                        ]}
                        value={settings.theme}
                        onChange={(v) => onChange({ theme: v })}
                      />
                    </Row>
                  </Section>

                  <Section title="ANIMATION">
                    <Row label="ANIMATIONS">
                      <Segmented
                        options={ON_OFF}
                        value={animOn}
                        onChange={(v) => onChange({ animEnabled: v })}
                      />
                    </Row>
                    {animOn && (
                      <>
                        <Row label="STYLE">
                          <Segmented
                            options={[
                              { value: "slide", label: "SLIDE" },
                              { value: "rise", label: "FADE RISE" },
                            ]}
                            value={settings.animStyle === "rise" ? "rise" : "slide"}
                            onChange={(v) => onChange({ animStyle: v })}
                          />
                        </Row>
                        <Row label="SPEED">
                          <Segmented
                            options={[
                              { value: "normal", label: "NORMAL" },
                              { value: "slow", label: "SLOW" },
                              { value: "slower", label: "SLOWER" },
                            ]}
                            value={settings.animSpeed || "normal"}
                            onChange={(v) => onChange({ animSpeed: v })}
                          />
                        </Row>
                      </>
                    )}
                  </Section>
                </>
              )}

              {tab === "reading" && (
                <>
                  <Section title="OPENING">
                    <Row label="RESUME LAST POSITION">
                      <Segmented
                        options={ON_OFF}
                        value={!!settings.resumePosition}
                        onChange={(v) => onChange({ resumePosition: v })}
                      />
                    </Row>
                    {/* Forced on phone regardless of this setting (see App.jsx
                        selectFile), so offering it there would be a no-op. */}
                    {!isMobile && (
                      <Row label="AUTO-HIDE PANEL AFTER OPEN">
                        <Segmented
                          options={ON_OFF}
                          value={!!settings.autoHideSidebar}
                          onChange={(v) => onChange({ autoHideSidebar: v })}
                        />
                      </Row>
                    )}
                  </Section>

                  <Section title="SCREEN">
                    <Row label="KEEP AWAKE WHILE READING">
                      <Segmented
                        options={ON_OFF}
                        value={!!settings.keepAwake}
                        onChange={(v) => onChange({ keepAwake: v })}
                      />
                    </Row>
                  </Section>
                </>
              )}

              {tab === "about" && (
                <>
                  <Section title="APP UPDATE">
                    <div className="settings-meta">
                      VERSION {APP_VERSION} · BUILD {update.current.version}
                    </div>
                    {update.needRefresh ? (
                      <button
                        className="cb-btn cb-btn--primary settings-wide-btn"
                        onClick={() => update.updateServiceWorker(true)}
                      >
                        ⬆ UPDATE NOW
                      </button>
                    ) : (
                      <button
                        className="cb-btn settings-wide-btn"
                        onClick={update.checkForUpdate}
                        disabled={update.checkingUpdate}
                      >
                        {update.checkingUpdate ? "CHECKING…" : "⬆ CHECK FOR UPDATES"}
                      </button>
                    )}
                    {update.needRefresh && (
                      <div className="settings-update-status settings-update-status--available">
                        NEW VERSION AVAILABLE
                      </div>
                    )}
                    {!update.needRefresh && update.updateChecked && !update.checkingUpdate && (
                      <div className="settings-update-status">✓ YOU'RE ON THE LATEST VERSION</div>
                    )}
                    <Row label="DISABLE AUTO-UPDATE">
                      <Segmented
                        options={ON_OFF}
                        value={update.autoUpdateDisabled}
                        onChange={update.setAutoUpdateDisabled}
                      />
                    </Row>
                  </Section>

                  <Section title="CHANGELOG">
                    <Changelog changelog={CHANGELOG} />
                  </Section>

                  <div className="settings-foot">CLAUDEBORNE EDOCUMENT READER · {APP_VERSION}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <span>{title}</span>
        <div className="settings-section-line" />
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="settings-seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={value === o.value ? "is-active" : ""}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
