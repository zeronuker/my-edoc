import { useLayoutEffect, useState } from "react";
import { animDurationMs } from "./useTransitionAnim.js";

// Keeps something mounted for one exit animation after `open` goes false.
// `closing` is derived in the same render the close happens (no lagging
// state), so the caller's `is-closing` class — and its pointer-events:none —
// apply immediately. With animations off or Reduce Motion on there's no wait:
// the layout effect unmounts before paint.
export function usePresence(open) {
  const [mounted, setMounted] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const ms = animDurationMs();
    if (!ms) {
      setMounted(false);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open]);

  const present = open || mounted;
  return { present, closing: present && !open };
}
