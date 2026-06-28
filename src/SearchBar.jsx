import { useEffect, useState } from "react";

// In-file keyword search via pdf.js's own PDFFindController — highlighting
// on the page and match navigation come from the library; we just relay
// the query through the eventBus and mirror the match count for display.
export default function SearchBar({ eventBus }) {
  const [query, setQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState(null);

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
        type="text"
        placeholder="Search in document…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <>
          <button onClick={() => dispatchFind("again", { findPrevious: true })}>‹</button>
          <span className="match-count">
            {matchInfo ? `${matchInfo.current}/${matchInfo.total}` : "0/0"}
          </span>
          <button onClick={() => dispatchFind("again", { findPrevious: false })}>›</button>
        </>
      )}
    </span>
  );
}
