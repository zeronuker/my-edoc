import { animDurationMs } from "./useTransitionAnim.js";

// Soft light ripple from the touch/click point on these controls. Their
// position/overflow are set in oxygen.css so the ripple stays inside.
const RIPPLE_TARGETS = ".cb-btn, .sidebar-tab, .tree-file, .tree-folder-label, .doc-tab-name, .add-folder-fab";

export function installRipple() {
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || !animDurationMs()) return;
      const el = e.target.closest(RIPPLE_TARGETS);
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement("span");
      dot.className = "oxy-ripple";
      dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    },
    { passive: true }
  );
}
