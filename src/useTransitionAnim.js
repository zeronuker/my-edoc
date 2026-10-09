import { useState, useRef, useLayoutEffect } from "react";

const ANIM_STYLES = ["slide", "rise"];

// Speed presets (ms) behind the --ed-dur CSS variable.
export const ANIM_SPEED_MS = { normal: 260, slow: 420, slower: 650 };

// Transition for a keyed panel (sidebar tab bodies). Put the returned
// className/style on the panel; the class is dropped after the animation so
// later re-renders don't replay it. `order` decides slide direction. The
// first render never animates — only an actual key change does.
export function useTransitionAnim(key, order, animStyle) {
  const prev = useRef(key);
  const dir = useRef(1);
  const [on, setOn] = useState(false);
  if (prev.current !== key) {
    dir.current = order.indexOf(key) > order.indexOf(prev.current) ? 1 : -1;
    prev.current = key;
  }
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), 1500);
    return () => clearTimeout(t);
  }, [key]);
  return {
    className: on ? `ed-anim-${ANIM_STYLES.includes(animStyle) ? animStyle : "slide"}` : "",
    style: { "--dir": dir.current },
  };
}

// Current transition duration in ms, or 0 when animations are off / the
// device asks for reduced motion — callers skip their exit animation then.
export function animDurationMs() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ed-dur")) || 0;
}
