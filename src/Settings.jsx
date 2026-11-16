import { useState } from "react";
import { CHANGELOG } from "./changelog";
import Changelog, { currentVersion } from "@brand/Changelog";
import SettingsWindow, { SettingsSection, SettingsRow, SettingsNote, Seg, Switch, Reveal } from "@brand/SettingsWindow";
import { ANIM_SPEED_MS } from "./useTransitionAnim.js";

// Single source of truth: the app's displayed version is always the newest
// changelog entry, so it can never drift out of sync with a hand-maintained
// version string elsewhere.
const APP_VERSION = currentVersion(CHANGELOG);

// The standard ClaudeBorne Settings window (brand-kit SettingsWindow): tabs on
// the left, the chosen tab's settings on the right; full screen on a phone.
const TABS = [
  { id: "general", label: "General", hint: "theme · motion · reading", icon: "general" },
  { id: "about", label: "About", hint: "update · changelog", icon: "about" },
];

export default function Settings({ settings, onChange, onClose, update, isMobile, closing }) {
  const [tab, setTab] = useState("general");
  const animOn = settings.animEnabled !== false;
  const anim = {
    style: settings.animStyle,
    ms: animOn ? ANIM_SPEED_MS[settings.animSpeed] || ANIM_SPEED_MS.normal : 0,
  };

  return (
    <SettingsWindow
      appName="eDoc"
      version={APP_VERSION}
      tabs={TABS}
      active={tab}
      onTab={setTab}
      onClose={onClose}
      closing={closing}
      anim={anim}
    >
      {tab === "general" && (
        <>
          <SettingsSection title="Theme">
            <SettingsRow label="Mode" wide>
              <Seg
                label="Theme"
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                value={settings.theme}
                onChange={(v) => onChange({ theme: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Animation">
            <SettingsRow label="Animations" hint="Also off when your device has reduced motion turned on">
              <Switch label="Animations" on={animOn} onChange={(v) => onChange({ animEnabled: v })} />
            </SettingsRow>
            <Reveal open={animOn}>
              <SettingsRow label="Style">
                <Seg
                  label="Animation style"
                  options={[
                    { value: "slide", label: "Slide" },
                    { value: "rise", label: "Fade rise" },
                  ]}
                  value={settings.animStyle === "rise" ? "rise" : "slide"}
                  onChange={(v) => onChange({ animStyle: v })}
                />
              </SettingsRow>
              <SettingsRow label="Speed" wide>
                <Seg
                  label="Animation speed"
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "slow", label: "Slow" },
                    { value: "slower", label: "Slower" },
                  ]}
                  value={settings.animSpeed || "normal"}
                  onChange={(v) => onChange({ animSpeed: v })}
                />
              </SettingsRow>
            </Reveal>
          </SettingsSection>

          <SettingsSection title="Opening">
            <SettingsRow label="Resume last position" hint="Opens where you stopped reading">
              <Switch label="Resume last position" on={!!settings.resumePosition} onChange={(v) => onChange({ resumePosition: v })} />
            </SettingsRow>
            {/* Forced on phone regardless of this setting (see App.jsx
                selectFile), so offering it there would be a no-op. */}
            {!isMobile && (
              <SettingsRow label="Auto-hide panel after open">
                <Switch label="Auto-hide panel after open" on={!!settings.autoHideSidebar} onChange={(v) => onChange({ autoHideSidebar: v })} />
              </SettingsRow>
            )}
          </SettingsSection>

          <SettingsSection title="Split view">
            <SettingsRow label="Show two documents" hint="Side by side on wide screens (⋯ on a tab → Split view)">
              <Switch label="Show two documents" on={!!settings.splitView} onChange={(v) => onChange({ splitView: v })} />
            </SettingsRow>
            <SettingsRow label="Colour-code panes" hint="Left pane amber, right pane pink. Off shows L or R on the tabs">
              <Switch label="Colour-code panes" on={settings.paneColours !== false} onChange={(v) => onChange({ paneColours: v })} />
            </SettingsRow>
            <SettingsNote>
              Each side shows one page at a time. Two documents use more memory — large scanned PDFs can make iPad
              Safari close the app — so it starts off on touch devices.
            </SettingsNote>
          </SettingsSection>

          <SettingsSection title="Screen">
            <SettingsRow label="Keep awake while reading">
              <Switch label="Keep awake while reading" on={!!settings.keepAwake} onChange={(v) => onChange({ keepAwake: v })} />
            </SettingsRow>
          </SettingsSection>
        </>
      )}

      {tab === "about" && (
        <>
          <SettingsSection title="App update">
            <SettingsRow
              label="Version"
              hint={
                update.needRefresh
                  ? "A new version is ready"
                  : update.updateChecked && !update.checkingUpdate
                    ? "You're on the latest version"
                    : null
              }
            >
              <span className={"cbs-value" + (update.needRefresh ? "" : " on")}>
                {APP_VERSION} · build {update.current.version}
              </span>
            </SettingsRow>
            <SettingsRow full>
              {update.needRefresh ? (
                <button type="button" className="cbs-btn primary" onClick={() => update.updateServiceWorker(true)}>
                  ⬆ Update now
                </button>
              ) : (
                <button type="button" className="cbs-btn" onClick={update.checkForUpdate} disabled={update.checkingUpdate}>
                  {update.checkingUpdate ? "Checking…" : "⬆ Check for updates"}
                </button>
              )}
            </SettingsRow>
            <SettingsRow label="Disable auto-update">
              <Switch label="Disable auto-update" on={update.autoUpdateDisabled} onChange={update.setAutoUpdateDisabled} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Changelog">
            <SettingsRow full>
              <Changelog changelog={CHANGELOG} />
            </SettingsRow>
          </SettingsSection>
        </>
      )}
    </SettingsWindow>
  );
}
