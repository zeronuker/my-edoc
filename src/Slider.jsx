import { useRef } from "react";

// A drag-and-arrow-keys slider drawn from divs, so no stock range control
// shows. Pointer capture keeps the drag going when the finger leaves the track.
export default function Slider({ value, min, max, step = 1, onChange, ...rest }) {
  const track = useRef(null);
  const pct = ((value - min) / (max - min)) * 100;

  function setFromPointer(e) {
    const r = track.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const next = Math.round((min + ratio * (max - min)) / step) * step;
    if (next !== value) onChange(next);
  }

  function onKeyDown(e) {
    const bigStep = step * 10;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -bigStep, PageUp: bigStep }[e.key];
    if (delta !== undefined) onChange(Math.min(max, Math.max(min, value + delta)));
    else if (e.key === "Home") onChange(min);
    else if (e.key === "End") onChange(max);
    else return;
    e.preventDefault();
  }

  return (
    <div
      className="ed-slider"
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromPointer(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && setFromPointer(e)}
      {...rest}
    >
      <div className="ed-slider-track" ref={track}>
        <div className="ed-slider-fill" style={{ width: `${pct}%` }} />
        <div className="ed-slider-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
