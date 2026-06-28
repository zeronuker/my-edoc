export default function Toolbar({
  viewMode,
  setViewMode,
  scale,
  setScale,
  currentPage,
  setCurrentPage,
  numPages,
  step,
}) {
  return (
    <div className="toolbar">
      <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
        <option value="single">Single page</option>
        <option value="continuous">Continuous</option>
        <option value="two-up">Two-page</option>
      </select>

      {viewMode !== "continuous" && (
        <span className="page-nav">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(Math.max(1, currentPage - step))}
          >
            ‹
          </button>
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value) || 1)}
          />
          <span>/ {numPages || "-"}</span>
          <button
            disabled={!numPages || currentPage + step - 1 >= numPages}
            onClick={() => setCurrentPage(Math.min(numPages, currentPage + step))}
          >
            ›
          </button>
        </span>
      )}

      <span className="zoom">
        <button onClick={() => setScale(Math.max(0.25, scale - 0.25))}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(scale + 0.25)}>+</button>
      </span>
    </div>
  );
}
