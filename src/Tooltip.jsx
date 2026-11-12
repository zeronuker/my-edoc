import { useEffect, useRef, useState } from "react";
import { usePresence } from "./usePresence.js";

const SHOW_DELAY_MS = 400;
const HALF_WIDTH = 130; // half of .ed-tip's max-width, to keep it on screen
const EDGE = 8;

// One tooltip for the whole app, drawn from any element's `data-tip`, in place
// of the browser's own `title` tooltip. Mouse hover waits a moment; keyboard
// focus shows it at once; touch never shows it.
export default function Tooltip() {
  const [tip, setTip] = useState(null); // { text, rect } while it should show
  const last = useRef(null);
  if (tip) last.current = tip;
  const { present, closing } = usePresence(!!tip);

  useEffect(() => {
    let timer;
    let current = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (el, delay) => {
      if (el === current) return;
      hide();
      current = el;
      timer = setTimeout(() => setTip({ text: el.dataset.tip, rect: el.getBoundingClientRect() }), delay);
    };
    const target = (e) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);

    const over = (e) => {
      const el = target(e);
      if (el && e.pointerType === "mouse") show(el, SHOW_DELAY_MS);
    };
    const out = (e) => {
      if (current && !current.contains(e.relatedTarget)) hide();
    };
    const focus = (e) => {
      const el = target(e);
      if (el?.matches(":focus-visible")) show(el, 0);
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  const shown = tip ?? last.current;
  if (!present || !shown) return null;
  const { text, rect } = shown;
  const centre = Math.min(window.innerWidth - HALF_WIDTH - EDGE, Math.max(HALF_WIDTH + EDGE, rect.left + rect.width / 2));
  const below = rect.bottom + 48 < window.innerHeight;
  const place = below ? { top: rect.bottom + EDGE } : { bottom: window.innerHeight - rect.top + EDGE };
  return (
    <div className={`ed-tip${closing ? " is-closing" : ""}`} role="tooltip" style={{ left: centre, ...place }}>
      {text}
    </div>
  );
}
