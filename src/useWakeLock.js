import { useEffect } from "react";

// Wake Lock only holds while the tab is visible — the browser releases it
// automatically on hide, so re-acquire on visibilitychange instead of
// trying to fight that.
export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled) return;
    let lock = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        // ignore — e.g. permission denied or unsupported
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release();
    };
  }, [enabled]);
}
