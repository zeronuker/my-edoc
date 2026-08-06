import { flattenTreeFileHandles } from "./fileSystem.js";

// Snippets are built at render time straight from the per-file text blob in
// textIndex (see textIndex.js) — no separate stored index of match
// positions. Cheap enough to redo on every keystroke for the handful of
// files a personal document folder holds.
const CONTEXT_CHARS = 40;
const MAX_SNIPPETS_PER_FILE = 3;

function buildSnippets(text, query) {
  const lower = text.toLowerCase();
  const snippets = [];
  let idx = lower.indexOf(query);
  while (idx !== -1 && snippets.length < MAX_SNIPPETS_PER_FILE) {
    const start = Math.max(0, idx - CONTEXT_CHARS);
    const end = Math.min(text.length, idx + query.length + CONTEXT_CHARS);
    snippets.push({
      pre: (start > 0 ? "…" : "") + text.slice(start, idx),
      match: text.slice(idx, idx + query.length),
      post: text.slice(idx + query.length, end) + (end < text.length ? "…" : ""),
    });
    idx = lower.indexOf(query, idx + query.length);
  }
  return snippets;
}

// Full main-pane replacement while a global search query is active: matches
// filenames and, via textIndex, document content, and groups hits by file.
// textIndex is built lazily in the background (App.jsx), so a search fired
// right after connecting a folder can miss not-yet-indexed files — the
// pendingCount note below is the only acknowledgment of that gap for now.
export default function SearchResults({ query, folders, textIndex, onOpenResult }) {
  const q = query.trim().toLowerCase();
  const files = folders.filter((f) => f.tree).flatMap((f) => flattenTreeFileHandles(f.tree));
  const indexedNames = new Set(Object.keys(textIndex));
  const pendingCount = files.filter((f) => !indexedNames.has(f.name)).length;

  const results = [];
  for (const { name, handle } of files) {
    const nameMatch = name.toLowerCase().includes(q);
    const text = textIndex[name];
    const snippets = text ? buildSnippets(text, q) : [];
    if (nameMatch || snippets.length) results.push({ name, handle, nameMatch, snippets });
  }
  results.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || b.snippets.length - a.snippets.length);

  const totalHits = results.reduce((sum, r) => sum + Math.max(r.snippets.length, r.nameMatch ? 1 : 0), 0);

  return (
    <div className="search-results">
      <div className="search-results-header">
        <p className="search-results-count">
          {totalHits} result{totalHits === 1 ? "" : "s"} for "{query.trim()}"
        </p>
        {pendingCount > 0 && (
          <p className="search-results-indexing">
            <span className="spinner" />
            still indexing {pendingCount} file{pendingCount === 1 ? "" : "s"}…
          </p>
        )}
      </div>
      <div className="search-results-list">
        {results.length === 0 && <p className="search-results-empty">No matches.</p>}
        {results.map((r) => (
          <div key={r.name} className="search-result-file" onClick={() => onOpenResult(r.handle, query.trim())}>
            <p className="search-result-file-name">
              {r.name}
              <span className="search-result-hit-count">
                {r.snippets.length > 0 ? `${r.snippets.length} hit${r.snippets.length === 1 ? "" : "s"}` : "name match"}
              </span>
            </p>
            {r.snippets.map((s, i) => (
              <p className="search-result-snippet" key={i}>
                {s.pre}
                <mark>{s.match}</mark>
                {s.post}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
