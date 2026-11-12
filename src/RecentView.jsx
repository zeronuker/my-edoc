import { useState } from "react";
import { IconStarFilled } from "@tabler/icons-react";
import { FileIcon } from "./TreeView.jsx";
import { STAR_COLORS } from "./appHelpers.js";

// Two flat lists, so a deep file is one click away without hunting through
// folders: the starred files (every folder, filterable by colour), then the
// recently opened ones, newest first. `starred` is [{ name, path, handle,
// color }] — see starredEntries.
export default function RecentView({ recentFiles, starred, onSelectFile, selectedHandle, onClearAll }) {
  const [only, setOnly] = useState(null);
  if (!recentFiles.length && !starred.length) return null;
  // Colours that are in use, in the usual order — and a filter left on a
  // colour that is no longer used falls back to showing everything.
  const used = STAR_COLORS.filter((c) => starred.some((s) => s.color === c.id));
  const filter = used.some((c) => c.id === only) ? only : null;
  const shown = starred.filter((s) => !filter || s.color === filter);
  return (
    <div className="tree-view recent-view">
      {starred.length > 0 && (
        <>
          <div className="recent-header starred-header">
            <span className="recent-title">STARRED</span>
            <span className="starred-filter">
              <button
                className={`starred-chip${filter === null ? " active" : ""}`}
                aria-pressed={filter === null}
                onClick={() => setOnly(null)}
              >
                All
              </button>
              {used.map((c) => (
                <button
                  key={c.id}
                  className={`starred-chip${filter === c.id ? " active" : ""}`}
                  aria-pressed={filter === c.id}
                  aria-label={`${c.label} stars`}
                  data-tip={`${c.label} stars`}
                  onClick={() => setOnly(c.id)}
                >
                  <IconStarFilled size={14} style={{ color: c.color }} />
                </button>
              ))}
            </span>
          </div>
          {shown.map((s) => (
            <div
              key={s.handle.fileKey ?? s.path + s.name}
              className={`tree-file${s.handle === selectedHandle ? " selected" : ""}`}
              onClick={() => onSelectFile(s.handle)}
              data-tip={s.path ? `${s.path}/${s.name}` : s.name}
            >
              <span className="tree-chevron" />
              <FileIcon />
              <span className="tree-label">{s.name}</span>
              <IconStarFilled className="tree-star" size={12} style={{ color: STAR_COLORS.find((c) => c.id === s.color)?.color }} />
            </div>
          ))}
        </>
      )}
      {recentFiles.length > 0 && (
        <>
          <div className="recent-header">
            <span className="recent-title">RECENT</span>
            <button className="recent-clear-btn" onClick={onClearAll}>
              Clear all
            </button>
          </div>
          {recentFiles.map((entry) => (
            <div
              key={entry.name + entry.openedAt}
              className={`tree-file${entry.fileHandle === selectedHandle ? " selected" : ""}`}
              onClick={() => onSelectFile(entry.fileHandle)}
              data-tip={entry.name}
            >
              <span className="tree-chevron" />
              <FileIcon />
              <span className="tree-label">{entry.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
