import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

// The strip of open files above the viewer. `tabs` is [{ key, handle }]; only
// the active one is loaded (see usePdfDocument), the rest reopen when picked.
// `paneOf(key)` (split view only) says which pane, "L" or "R", is showing a
// tab's file, if either: the tab takes that pane's colour, or its letter when
// pane colours are off (see App.css).
export default function TabBar({ tabs, activeKey, paneOf, onSelect, onClose }) {
  const activeRef = useRef(null);

  // Keep the active tab in view when the strip overflows.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey, tabs.length]);

  return (
    <div className="tab-bar">
      {tabs.map(({ key, handle }) => {
        const active = key === activeKey;
        const pane = paneOf?.(key);
        return (
          <div
            key={key}
            ref={active ? activeRef : null}
            className={`doc-tab${active ? " active" : ""}`}
            data-pane={pane || undefined}
            title={pane ? `${handle.name} — shown in the ${pane === "L" ? "left" : "right"} pane` : handle.name}
            onAuxClick={(e) => e.button === 1 && onClose(key)}
          >
            <button className="doc-tab-name" aria-current={active} onClick={() => onSelect(handle)}>
              {handle.name}
            </button>
            {pane && <span className="doc-tab-pane">{pane}</span>}
            <button className="doc-tab-close" aria-label={`Close ${handle.name}`} onClick={() => onClose(key)}>
              <IconX size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
