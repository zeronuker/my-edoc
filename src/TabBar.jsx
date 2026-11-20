import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX, IconDotsVertical,IconInfoCircle, IconColumns2, IconPresentation } from "@tabler/icons-react";
import { useDropdown } from "./useDropdown.js";
import { animDurationMs } from "./useTransitionAnim.js";

// The ⋯ on a tab that is on screen: actions for that file. It is drawn into
// <body>, positioned from its button — the tab strip scrolls sideways and would
// clip a menu drawn inside it. Opening it makes the tab's pane the active one,
// so every action acts on the file the menu belongs to.
function TabMenu({
  name,
  pane,
  onActivatePane,
  onShowInfo,
  onStartPresentation,
}) {
  const menu = useDropdown();
  const buttonRef = useRef(null);
  const [pos, setPos] = useState(null);

  // The menu is anchored in screen space; if the page moves under it, close it.
  useEffect(() => {
    if (!menu.open) return undefined;
    const close = () => menu.setOpen(false);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.open]);

  function toggle() {
    if (!menu.open) {
      onActivatePane(pane);
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    menu.setOpen((v) => !v);
  }

  const run = (fn) => () => {
    fn();
    menu.setOpen(false);
  };

  return (
    <span className="doc-tab-menu" ref={menu.ref}>
      <button
        ref={buttonRef}
        className="doc-tab-more"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={toggle}
      >
        <IconDotsVertical size={14} />
      </button>
      {menu.open &&
        pos &&
        createPortal(
          <div
            ref={menu.menuRef}
            className={`dropdown-menu tab-menu${menu.closing ? " is-closing" : ""}`}
            style={{ top: pos.top, right: pos.right }}
          >
            <button onClick={run(onShowInfo)}>
              <IconInfoCircle size={16} /> Document properties
            </button>
            <span className="dropdown-sep" />
            <button onClick={run(onStartPresentation)}>
              <IconPresentation size={16} /> Presentation mode
            </button>
          </div>,
          document.body
        )}
    </span>
  );
}

// The strip of open files above the viewer. `tabs` is [{ key, handle }]; only
// the ones on screen are loaded (see usePdfDocument), the rest reopen when
// picked. `paneOf(key)` says which pane, "L" or "R", is showing a tab's file,
// if either. In a split such a tab takes that pane's colour — or its letter
// when pane colours are off (see App.css). A tab on screen has a ⋯ menu.
export default function TabBar({
  tabs,
  activeKey,
  split,
  paneOf,
  canSplit,
  onSelect,
  onClose,
  onActivatePane,
  onShowInfo,
  onToggleSplit,
  onStartPresentation,
}) {
  const activeRef = useRef(null);
  const barRef = useRef(null);
  // Highlight under the active tab; it glides to the next one (look in oxygen.css).
  const [ind, setInd] = useState(null);
  const [armed, setArmed] = useState(false); // first placement is instant, later moves glide
  const prevTabs = useRef(tabs);
  const widths = useRef({});
  // Tabs that just left, kept as inert copies for one collapse animation. The
  // switch to the next document is immediate; only the strip lags.
  const [leaving, setLeaving] = useState([]);

  // Keep the active tab in view when the strip overflows.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey, tabs.length]);

  // Layout effect so the copy is in place before the removal ever paints.
  useLayoutEffect(() => {
    const ms = animDurationMs();
    const keys = new Set(tabs.map((t) => t.key));
    const gone = ms
      ? prevTabs.current
          .map((t, i) => ({ key: t.key, name: t.handle.name, i, w: widths.current[t.key] }))
          .filter((t) => !keys.has(t.key))
      : [];
    prevTabs.current = tabs;
    if (!gone.length) return;
    setLeaving((l) => [...l.filter((x) => !keys.has(x.key)), ...gone]);
    const goneKeys = new Set(gone.map((t) => t.key));
    setTimeout(() => setLeaving((l) => l.filter((x) => !goneKeys.has(x.key))), ms);
  }, [tabs]);

  // Re-measured on any tab resize too: a closing tab collapses over time and
  // shifts the active one with it.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = () => {
      const el = bar.querySelector(".doc-tab.active");
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      setInd((p) => (p && next && p.left === next.left && p.width === next.width ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    bar.querySelectorAll(".doc-tab").forEach((t) => ro.observe(t));
    return () => ro.disconnect();
  }, [activeKey, tabs, leaving]);

  useEffect(() => setArmed(true), []);

  const items = tabs.map((t) => ({ tab: t }));
  [...leaving]
    .filter((g) => !tabs.some((t) => t.key === g.key))
    .sort((a, b) => a.i - b.i)
    .forEach((g) => items.splice(Math.min(g.i, items.length), 0, { ghost: g }));

  return (
    <div className="tab-bar" ref={barRef}>
      {ind && (
        <i
          className={`tab-ind${armed ? " tab-ind-go" : ""}`}
          aria-hidden="true"
          style={{ width: ind.width, transform: `translateX(${ind.left}px)` }}
        />
      )}
      {canSplit && (
        <button
          className={`tab-split${split ? " on" : ""}`}
          aria-label={split ? "Close split view" : "Split view"}
          aria-pressed={split}
          data-tip={split ? "Close split view" : "Split view"}
          onClick={onToggleSplit}
        >
          <IconColumns2 size={16} />
        </button>
      )}
      {items.map(({ tab, ghost }) => {
        if (ghost) {
          return (
            <div
              key={`leaving-${ghost.key}`}
              className="doc-tab is-leaving"
              style={ghost.w ? { "--w": `${ghost.w}px` } : undefined}
              aria-hidden="true"
            >
              <span className="doc-tab-name">{ghost.name}</span>
            </div>
          );
        }
        const { key, handle } = tab;
        const active = key === activeKey;
        const pane = paneOf(key);
        const marked = split && pane;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) widths.current[key] = el.offsetWidth;
              if (active) activeRef.current = el;
            }}
            className={`doc-tab${active ? " active" : ""}`}
            data-pane={marked || undefined}
            data-tip={marked ? `${handle.name} — shown in the ${pane === "L" ? "left" : "right"} pane` : handle.name}
            onAuxClick={(e) => e.button === 1 && onClose(key)}
          >
            <button className="doc-tab-name" aria-current={active} onClick={() => onSelect(handle)}>
              {handle.name}
            </button>
            {pane && (
              <TabMenu
                name={handle.name}
                pane={pane}
                onActivatePane={onActivatePane}
                onShowInfo={onShowInfo}
                onStartPresentation={onStartPresentation}
              />
            )}
            <button className="doc-tab-close" aria-label={`Close ${handle.name}`} onClick={() => onClose(key)}>
              <IconX size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
