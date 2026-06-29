import { useEffect, useState } from "react";

// TEMP: diagnosing the iOS standalone-PWA bottom-bar bug — remove once fixed.
export default function DebugOverlay() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Sample a few points along the bottom strip to identify what's there.
      const points = [10, w * 0.5, w - 10].map((x) => {
        const el = document.elementFromPoint(x, h - 5);
        if (!el) return "none";
        const r = el.getBoundingClientRect();
        const bg = getComputedStyle(el).backgroundColor;
        return `${el.tagName}.${el.className || "(none)"} bg=${bg} rect=${Math.round(r.top)}-${Math.round(r.bottom)}`;
      });
      setStats({
        innerWidth: w,
        innerHeight: h,
        scrollY: window.scrollY,
        bottomLeft: points[0],
        bottomCenter: points[1],
        bottomRight: points[2],
      });
    };
    read();
    const id = setInterval(read, 300);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 99999,
        background: "rgba(255,0,0,0.85)",
        color: "#fff",
        fontSize: "9px",
        fontFamily: "monospace",
        padding: "4px 6px",
        lineHeight: 1.4,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        maxWidth: "100vw",
      }}
    >
      {Object.entries(stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}
    </div>
  );
}
