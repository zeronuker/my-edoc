// Renders a PDF's built-in outline/bookmarks (pdf.getOutline()) as a
// clickable nested list, navigating via the same PDFLinkService the
// in-document links already use.
function OutlineNode({ item, linkService, onNavigate }) {
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
      <div className="outline-label" onClick={handleClick} title={item.title}>
        {item.title}
      </div>
      {item.items?.length > 0 && (
        <div className="outline-children">
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} linkService={linkService} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OutlineView({ items, linkService, onNavigate }) {
  if (!items?.length) return null;
  return (
    <div className="outline-view">
      {items.map((item, i) => (
        <OutlineNode key={i} item={item} linkService={linkService} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
