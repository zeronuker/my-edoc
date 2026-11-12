import { useRef, useState } from "react";
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
import { usePresence } from "./usePresence.js";

// Grows open and shrinks shut instead of popping in. The last children are
// kept while it closes, since whatever decided to close it has usually
// already emptied them.
function Collapse({ open, children }) {
  const { present, closing } = usePresence(open);
  const last = useRef(children);
  if (open) last.current = children;
  if (!present) return null;
  return (
    <div className={`collapse${closing ? " is-closing" : ""}`}>
      <div className="collapse-inner">{open ? children : last.current}</div>
    </div>
  );
}

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
  closing = false,
}) {
  const [starOpen, setStarOpen] = useState(false);
  const pickStar = (colorId) => {
    onStar(colorId);
    setStarOpen(false);
  };
  return (
    <div className={`collapse${closing ? " is-closing" : ""}`}>
    <div className="collapse-inner">
    <div className={`manage-bar${closing ? " is-closing" : ""}`}>
      <div className="manage-bar-count">{count} selected</div>
      <Collapse open={fileTools || canStar}>
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
          <Collapse open={canStar && starOpen}>
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
          </Collapse>
        </>
      </Collapse>
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
    </div>
    </div>
  );
}
