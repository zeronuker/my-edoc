import { useState } from "react";
import {
  IconChecks,
  IconCopy,
  IconFolderShare,
  IconLayersIntersect,
  IconLock,
  IconPencil,
  IconRotate2,
  IconSquareOff,
  IconStar,
  IconStarFilled,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import { STAR_COLORS } from "./appHelpers.js";

// Pinned to the bottom of the Folders panel while Manage mode is on. Rename
// works on exactly one item; Delete on any number. The file tools row only
// shows what applies: Rotate and Flatten while exactly one PDF is ticked,
// Star while only files are ticked (one or many).
export default function ManageBar({
  count,
  fileTools,
  canStar,
  onSelectAll,
  onDeselectAll,
  onRename,
  onRotate,
  onFlatten,
  onStar,
  onProtect,
  onCopy,
  onMove,
  onDelete,
}) {
  const [starOpen, setStarOpen] = useState(false);
  const pickStar = (colorId) => {
    onStar(colorId);
    setStarOpen(false);
  };
  return (
    <div className="manage-bar">
      <div className="manage-bar-count">{count} selected</div>
      {(fileTools || canStar) && (
        <>
          <div className="manage-bar-label">FILE TOOLS</div>
          <div className="manage-bar-row tool-row">
            {fileTools && (
              <>
                <button className="cb-btn" onClick={onRotate}>
                  <IconRotate2 size={16} /> Rotate
                </button>
                <button className="cb-btn" onClick={onFlatten}>
                  <IconLayersIntersect size={16} /> Flatten
                </button>
              </>
            )}
            {canStar && (
              <button className="cb-btn" aria-expanded={starOpen && canStar} onClick={() => setStarOpen((v) => !v)}>
                <IconStar size={16} /> Star
              </button>
            )}
            {fileTools && (
              <button className="cb-btn" onClick={onProtect}>
                <IconLock size={16} /> Protect
              </button>
            )}
          </div>
          {canStar && starOpen && (
            <div className="star-palette">
              {STAR_COLORS.map((c) => (
                <button key={c.id} className="star-swatch" title={`${c.label} star`} aria-label={`${c.label} star`} onClick={() => pickStar(c.id)}>
                  <IconStarFilled size={22} style={{ color: c.color }} />
                </button>
              ))}
              <button className="star-swatch" title="Remove star" aria-label="Remove star" onClick={() => pickStar(null)}>
                <IconStarOff size={22} />
              </button>
            </div>
          )}
        </>
      )}
      <div className="manage-bar-actions">
        <div className="manage-bar-row">
          <button className="cb-btn" onClick={onSelectAll}>
            <IconChecks size={14} /> Select all
          </button>
          <button className="cb-btn" onClick={onDeselectAll} disabled={count === 0}>
            <IconSquareOff size={14} /> Deselect all
          </button>
        </div>
        <button className="cb-btn" onClick={onRename} disabled={count !== 1}>
          <IconPencil size={14} /> Rename
        </button>
        <button className="cb-btn" onClick={onCopy} disabled={count === 0}>
          <IconCopy size={14} /> Copy
        </button>
        <button className="cb-btn" onClick={onMove} disabled={count === 0}>
          <IconFolderShare size={14} /> Move
        </button>
        <button className="cb-btn" onClick={onDelete} disabled={count === 0}>
          <IconTrash size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
