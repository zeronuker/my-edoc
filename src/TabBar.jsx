import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

// The strip of open files above the viewer. `tabs` is [{ key, handle }]; only
// the active one is loaded (see usePdfDocument), the rest reopen when picked.
export default function TabBar({ tabs, activeKey, onSelect, onClose }) {
  const activeRef = useRef(null);

  // Keep the active tab in view when the strip overflows.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey, tabs.length]);

  return (
    <div className="tab-bar">
      {tabs.map(({ key, handle }) => {
        const active = key === activeKey;
        return (
          <div
            key={key}
            ref={active ? activeRef : null}
            className={`doc-tab${active ? " active" : ""}`}
            title={handle.name}
            onAuxClick={(e) => e.button === 1 && onClose(key)}
          >
            <button className="doc-tab-name" aria-current={active} onClick={() => onSelect(handle)}>
              {handle.name}
            </button>
            <button className="doc-tab-close" aria-label={`Close ${handle.name}`} onClick={() => onClose(key)}>
              <IconX size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
