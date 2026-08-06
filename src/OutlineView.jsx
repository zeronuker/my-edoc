// Renders a PDF's built-in outline/bookmarks (pdf.getOutline()) as a
// clickable nested list, navigating via the same PDFLinkService the
// in-document links already use. Nodes collapse/expand via a disclosure
// triangle; which nodes are expanded is owned by the caller (App.jsx),
// keyed by a stable path string ("0-2-1") so it survives re-fetching the
// same outline on reopen.
function OutlineNode({ item, path, linkService, onNavigate, expandedKeys, onToggle }) {
  const hasChildren = item.items?.length > 0;
  const isExpanded = hasChildren && expandedKeys.has(path);

  function handleClick(e) {
    e.preventDefault();
    if (item.dest) {
      linkService?.goToDestination(item.dest);
      onNavigate?.();
    } else if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="outline-node">
      <div className="outline-row">
        {hasChildren ? (
          <button
            type="button"
            className="outline-chevron"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
            onClick={() => onToggle(path)}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="outline-chevron" aria-hidden="true" />
        )}
        <div className="outline-label" onClick={handleClick} title={item.title}>
          {item.title}
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="outline-children">
          {item.items.map((child, i) => (
            <OutlineNode
              key={i}
              item={child}
              path={`${path}-${i}`}
              linkService={linkService}
              onNavigate={onNavigate}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OutlineView({ items, linkService, onNavigate, expandedKeys, onToggle }) {
  if (!items?.length) return null;
  return (
    <div className="outline-view">
      {items.map((item, i) => (
        <OutlineNode
          key={i}
          item={item}
          path={`${i}`}
          linkService={linkService}
          onNavigate={onNavigate}
          expandedKeys={expandedKeys}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
