import { useEffect, useState } from "react";

// TEMP: diagnosing the iOS standalone-PWA bottom-bar bug — remove once fixed.
export default function DebugOverlay() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    const read = () => {
      const app = document.querySelector(".app");
      setStats({
        innerHeight: window.innerHeight,
        vvHeight: window.visualViewport?.height,
        vvOffsetTop: window.visualViewport?.offsetTop,
        scrollY: window.scrollY,
        docScrollHeight: document.documentElement.scrollHeight,
        docClientHeight: document.documentElement.clientHeight,
        appComputedHeight: app && getComputedStyle(app).height,
        appRectHeight: app && app.getBoundingClientRect().height,
        appVar: getComputedStyle(document.documentElement).getPropertyValue("--app-vh"),
      });
    };
    read();
    const id = setInterval(read, 300);
    window.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => {
      clearInterval(id);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
    };
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
        fontSize: "10px",
        fontFamily: "monospace",
        padding: "4px 6px",
        lineHeight: 1.4,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {Object.entries(stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}
    </div>
  );
}
