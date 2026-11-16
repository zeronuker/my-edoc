import { useEffect, useRef, useState } from "react";

const HOLD_MS = 3000;
const SETTLE_MS = 700; // the shrink-back transition, see .live-alert in oxygen.css

// A dot at the top of the screen grows into a pill with the message, holds, then
// shrinks away. Mount it with a new `key` to play it again; `onDone` fires once gone.
export default function LiveAlert({ text, onDone }) {
  const [open, setOpen] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const timers = [
      setTimeout(() => setOpen(true), 30),
      setTimeout(() => setOpen(false), 30 + HOLD_MS),
      setTimeout(() => doneRef.current(), 30 + HOLD_MS + SETTLE_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className={`live-alert${open ? " open" : ""}`} role="status" aria-live="polite">
      <span className="live-alert-dot" />
      <span className="live-alert-text">{text}</span>
    </div>
  );
}
