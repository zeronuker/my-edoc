import { useRef, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Centered modal shown when a new service worker is waiting — same
// pattern as the other ClaudeBorne apps. User chooses UPDATE NOW or
// LATER, no silent auto-reload. Polls for updates every 60s via
// registration.update() so the prompt appears without needing a
// manual page reload first.
export default function UpdatePrompt({ ready }) {
  const intervalRef = useRef(null);
  const visibilityHandlerRef = useRef(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = async () => {
        if (registration.installing) return;
        if ("connection" in navigator && !navigator.onLine) return;
        await registration.update();
      };
      intervalRef.current = setInterval(check, 60_000);
      visibilityHandlerRef.current = () => {
        if (document.visibilityState === "visible") check();
      };
      document.addEventListener("visibilitychange", visibilityHandlerRef.current);
    },
  });

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      if (visibilityHandlerRef.current) {
        document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
      }
    };
  }, []);

  if (!needRefresh || !ready) return null;

  return (
    <>
      <div className="modal-backdrop" />
      <div className="modal-dialog">
        <div className="update-dialog-header">
          <span className="update-dialog-icon">⬆</span>
          <div>
            <div className="update-dialog-title">UPDATE AVAILABLE</div>
            <div className="update-dialog-subtitle">CLAUDEBORNE EDOCUMENT READER</div>
          </div>
        </div>
        <div className="update-dialog-body">
          A new version is ready to install. Update now for the latest features and fixes, or
          continue and update later.
        </div>
        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={() => setNeedRefresh(false)}>
            LATER
          </button>
          <button
            className="cb-btn cb-btn--primary update-dialog-now"
            onClick={() => updateServiceWorker(true)}
          >
            UPDATE NOW
          </button>
        </div>
      </div>
    </>
  );
}
