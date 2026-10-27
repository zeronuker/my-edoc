import { useEffect, useRef, useState } from "react";
import { animDurationMs } from "./useTransitionAnim.js";

// Closes whichever dropdown is open on an outside click or Escape — same
// pattern as App's floating + menu. `ref` goes on the trigger's wrapper; a
// menu drawn elsewhere in the page (a portal) puts `menuRef` on itself, so a
// click inside it doesn't count as outside.
export function useDropdown() {
  const [open, setOpenRaw] = useState(false);
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);
  const menuRef = useRef(null);

  // Same call shape as a state setter (value or updater). Closing keeps the
  // menu mounted for one exit animation, then unmounts it.
  function setOpen(value) {
    const next = typeof value === "function" ? value(open && !closing) : value;
    clearTimeout(timer.current);
    if (next) {
      setClosing(false);
      setOpenRaw(true);
      return;
    }
    if (!open) return;
    const ms = animDurationMs();
    if (!ms) {
      setClosing(false);
      setOpenRaw(false);
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      setOpenRaw(false);
      setClosing(false);
    }, ms);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open || closing) return;
    function onOutside(e) {
      const inside = ref.current?.contains(e.target) || menuRef.current?.contains(e.target);
      if (ref.current && !inside) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  return { open, closing, setOpen, ref, menuRef };
}
