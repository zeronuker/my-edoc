// What an empty viewer shows. `compact` is the small version for the second
// pane of a split, which has no file in it yet.
export default function EmptyState({ compact }) {
  if (compact) {
    return (
      <div className="empty-illustration-text">
        <div className="empty-illustration-headline">Empty pane</div>
        <div className="empty-illustration-subtext">Pick a tab or a file to show here</div>
      </div>
    );
  }
  return (
      <div className="empty-illustration">
        <svg className="empty-illustration-icon" width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
          <defs>
            <linearGradient id="empty-doc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--cb-mint)" />
              <stop offset="55%" stopColor="var(--cb-blue)" />
              <stop offset="100%" stopColor="var(--cb-violet)" />
            </linearGradient>
          </defs>
          <rect
            x="4"
            y="4"
            width="142"
            height="142"
            rx="8"
            fill="none"
            stroke="url(#empty-doc-grad)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            opacity="0.45"
          />
          <polyline
            points="52,38 52,112 98,112 98,58 78,38 52,38"
            fill="none"
            stroke="url(#empty-doc-grad)"
            strokeWidth="3"
            strokeLinejoin="miter"
          />
          <polyline
            points="78,38 78,58 98,58"
            fill="none"
            stroke="url(#empty-doc-grad)"
            strokeWidth="3"
            strokeLinejoin="miter"
          />
          <line x1="60" y1="76" x2="90" y2="76" stroke="url(#empty-doc-grad)" strokeWidth="2" />
          <line x1="60" y1="88" x2="90" y2="88" stroke="url(#empty-doc-grad)" strokeWidth="2" />
          <line x1="60" y1="100" x2="80" y2="100" stroke="url(#empty-doc-grad)" strokeWidth="2" />
          <polyline
            points="112,86 124,98 112,110"
            fill="none"
            stroke="url(#empty-doc-grad)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <line x1="112" y1="98" x2="123" y2="98" stroke="url(#empty-doc-grad)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div className="empty-illustration-text">
          <div className="empty-illustration-headline">Wow, such empty</div>
          <div className="empty-illustration-subtext">Drag a PDF here, or pick one from the sidebar</div>
        </div>
      </div>
  );
}
