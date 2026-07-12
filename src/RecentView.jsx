import { formatRelativeTime, FileIcon } from "./TreeView.jsx";

// Flat list of recently opened files, newest first — separate from
// TreeView's folder tree so a deep file is one click away without hunting
// through folders.
export default function RecentView({ recentFiles, onSelectFile, selectedHandle }) {
  if (!recentFiles.length) return null;
  return (
    <div className="tree-view recent-view">
      {recentFiles.map((entry) => (
        <div
          key={entry.name + entry.openedAt}
          className={`tree-file${entry.fileHandle === selectedHandle ? " selected" : ""}`}
          onClick={() => onSelectFile(entry.fileHandle)}
          title={entry.name}
        >
          <span className="tree-chevron" />
          <FileIcon />
          <span className="tree-label">{entry.name}</span>
          <span className="tree-updated-chip">{formatRelativeTime(entry.openedAt)}</span>
        </div>
      ))}
    </div>
  );
}
