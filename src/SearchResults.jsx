import { flattenTreeFileHandles } from "./fileSystem.js";

// Full main-pane replacement while a global search query is active —
// matches filenames only (no document content indexing).
export default function SearchResults({ query, folders, onOpenResult }) {
  const q = query.trim().toLowerCase();
  const files = folders.filter((f) => f.tree).flatMap((f) => flattenTreeFileHandles(f.tree));
  const results = files.filter((f) => f.name.toLowerCase().includes(q));

  return (
    <div className="search-results">
      <div className="search-results-header">
        <p className="search-results-count">
          {results.length} result{results.length === 1 ? "" : "s"} for "{query.trim()}"
        </p>
      </div>
      <div className="search-results-list">
        {results.length === 0 && <p className="search-results-empty">No matches.</p>}
        {results.map((r, i) => (
          <div key={i} className="search-result-file" onClick={() => onOpenResult(r.handle)}>
            <p className="search-result-file-name">{r.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
