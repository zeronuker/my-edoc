import { useEffect, useRef, useState } from "react";
import { animDurationMs } from "./useTransitionAnim.js";

// A number that counts to its new value instead of jumping. Instant when animations
// are off or Reduce Motion is on.
export function useRolling(target) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const dur = Math.min(900, animDurationMs() * 2.5);
    if (!dur || current.current === target) {
      current.current = target;
      setShown(target);
      return undefined;
    }
    const start = current.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      current.current = start + (target - start) * (1 - Math.pow(1 - p, 4));
      setShown(Math.round(current.current));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return shown;
}
