// Per-file list of user-bookmarked pages — distinct from OutlineView, which
// renders the PDF's own built-in table of contents.
export default function BookmarksView({ bookmarks, currentPage, onNavigate, onRemove }) {
  if (!bookmarks.length) return null;
  return (
    <div className="tree-view bookmarks-view">
      {bookmarks.map((b) => (
        <div
          key={b.page}
          className={`tree-file${b.page === currentPage ? " selected" : ""}`}
          onClick={() => onNavigate(b.page)}
        >
          <span className="tree-chevron" />
          <span className="tree-label">Page {b.page}</span>
          <button
            className="tree-icon-btn"
            title="Remove bookmark"
            aria-label={`Remove bookmark for page ${b.page}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(b.page);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
