import { useEffect, useRef, useState } from "react";
import { animDurationMs } from "./useTransitionAnim.js";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

// In-file keyword search via pdf.js's own PDFFindController — highlighting
// on the page and match navigation come from the library; we just relay
// the query through the eventBus and mirror the match count for display.
export default function SearchBar({ eventBus }) {
  const [query, setQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState(null);
  // The prev/next/count controls stay mounted for one exit animation after
  // the query is cleared.
  const [showControls, setShowControls] = useState(false);
  const [controlsClosing, setControlsClosing] = useState(false);
  const controlsTimer = useRef(null);

  useEffect(() => {
    clearTimeout(controlsTimer.current);
    if (query) {
      setControlsClosing(false);
      setShowControls(true);
      return undefined;
    }
    const ms = animDurationMs();
    if (!ms) {
      setShowControls(false);
      setControlsClosing(false);
      return undefined;
    }
    setControlsClosing(true);
    controlsTimer.current = setTimeout(() => {
      setShowControls(false);
      setControlsClosing(false);
    }, ms);
    return () => clearTimeout(controlsTimer.current);
  }, [query]);

  useEffect(() => {
    if (!eventBus) return;
    const onUpdate = (e) => setMatchInfo(e.matchesCount);
    eventBus.on("updatefindmatchescount", onUpdate);
    eventBus.on("updatefindcontrolstate", onUpdate);
    return () => {
      eventBus.off("updatefindmatchescount", onUpdate);
      eventBus.off("updatefindcontrolstate", onUpdate);
    };
  }, [eventBus]);

  function dispatchFind(type, extra = {}) {
    eventBus?.dispatch("find", {
      source: "edoc",
      type,
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
      ...extra,
    });
  }

  useEffect(() => {
    if (!eventBus) return;
    if (!query) {
      setMatchInfo(null);
      eventBus.dispatch("findbarclose", { source: "edoc" });
      return;
    }
    dispatchFind("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, eventBus]);

  return (
    <span className="search-bar">
      <input
        id="doc-search-input"
        type="text"
        placeholder="Search in document…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            e.target.blur();
          } else if (e.key === "Enter" && query) {
            dispatchFind("again", { findPrevious: e.shiftKey });
          }
        }}
      />
      {(query || showControls) && (
        <>
          <button aria-label="Previous match" className={controlsClosing ? "is-closing" : undefined} onClick={() => dispatchFind("again", { findPrevious: true })}>
            <IconChevronLeft size={16} />
          </button>
          <span className={`match-count${controlsClosing ? " is-closing" : ""}`}>
            {matchInfo ? `${matchInfo.current}/${matchInfo.total}` : "0/0"}
          </span>
          <button aria-label="Next match" className={controlsClosing ? "is-closing" : undefined} onClick={() => dispatchFind("again", { findPrevious: false })}>
            <IconChevronRight size={16} />
          </button>
        </>
      )}
    </span>
  );
}
