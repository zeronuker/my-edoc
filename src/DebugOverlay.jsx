import { useEffect, useState } from "react";

// TEMP: diagnosing the iOS standalone-PWA bottom-bar bug — remove once fixed.
export default function DebugOverlay() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    const read = () => {
      const app = document.querySelector(".app");
      const html = document.documentElement;
      const body = document.body;
      const root = document.getElementById("root");
      setStats({
        innerHeight: window.innerHeight,
        vvHeight: window.visualViewport?.height,
        scrollY: window.scrollY,
        htmlClientHeight: html.clientHeight,
        htmlOffsetHeight: html.offsetHeight,
        htmlComputedHeight: getComputedStyle(html).height,
        bodyClientHeight: body.clientHeight,
        bodyOffsetHeight: body.offsetHeight,
        bodyComputedHeight: getComputedStyle(body).height,
        rootClientHeight: root?.clientHeight,
        rootOffsetHeight: root?.offsetHeight,
        rootComputedHeight: root && getComputedStyle(root).height,
        appComputedHeight: app && getComputedStyle(app).height,
        appRectHeight: app && app.getBoundingClientRect().height,
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
