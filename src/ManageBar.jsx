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
  IconX,
} from "@tabler/icons-react";
import { STAR_COLORS } from "./appHelpers.js";
import { useDropdown } from "./useDropdown.js";
import { useRolling } from "./useRolling.js";

// One icon-over-label button; every action in the bar is one of these.
function Tool({ icon: Icon, label, className = "", ...rest }) {
  return (
    <button className={`mb-btn ${className}`} {...rest}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

// Pinned to the bottom of the whole app while Manage mode is on (TreeView
// portals it into .manage-slot). Rename works on exactly one item; Delete on
// any number. The file tools only show what applies: Rotate and Flatten while
// exactly one PDF is ticked, Star while only files are ticked (one or many).
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
  const star = useDropdown();
  const shownCount = useRolling(count);
  const none = count === 0;
  const pickStar = (colorId) => {
    onStar(colorId);
    star.setOpen(false);
  };
  return (
    <div className="collapse">
      <div className="collapse-inner">
        <div className={`manage-bar${closing ? " is-closing" : ""}`}>
          <div className="mb-sel">
            <span className={`mb-pill${none ? " none" : ""}`}>
              {none ? "Select items" : `${shownCount} selected`}
              {!none && (
                <button className="mb-clear" aria-label="Clear selection" onClick={onDeselectAll}>
                  <IconX size={12} />
                </button>
              )}
            </span>
            <button className="mb-link" onClick={onSelectAll}>
              <IconChecks size={14} /> All
            </button>
            <button className="mb-link" onClick={onDeselectAll} disabled={none}>
              <IconSquareOff size={14} /> None
            </button>
          </div>
          {(fileTools || canStar) && (
            <div className="mb-group" role="group" aria-label="File tools">
              {fileTools && <Tool icon={IconRotate2} label="Rotate" onClick={onRotate} />}
              {fileTools && <Tool icon={IconLayersIntersect} label="Flatten" onClick={onFlatten} />}
              {canStar && (
                <span className="mb-star" ref={star.ref}>
                  <Tool
                    icon={IconStar}
                    label="Star"
                    className={star.open && !star.closing ? "on" : ""}
                    aria-expanded={star.open && !star.closing}
                    onClick={() => star.setOpen((v) => !v)}
                  />
                  {star.open && (
                    <div className={`star-palette${star.closing ? " is-closing" : ""}`} ref={star.menuRef}>
                      {STAR_COLORS.map((c) => (
                        <button key={c.id} className="star-swatch" data-tip={`${c.label} star`} aria-label={`${c.label} star`} onClick={() => pickStar(c.id)}>
                          <IconStarFilled size={22} style={{ color: c.color }} />
                        </button>
                      ))}
                      <button className="star-swatch" data-tip="Remove star" aria-label="Remove star" onClick={() => pickStar(null)}>
                        <IconStarOff size={22} />
                      </button>
                    </div>
                  )}
                </span>
              )}
              {fileTools && <Tool icon={IconLock} label="Protect" onClick={onProtect} />}
            </div>
          )}
          <span className="mb-spacer" />
          <div className="mb-group plain">
            <Tool icon={IconPencil} label="Rename" onClick={onRename} disabled={count !== 1} />
            <Tool icon={IconCopy} label="Copy" onClick={onCopy} disabled={none} />
            <Tool icon={IconFolderShare} label="Move" onClick={onMove} disabled={none} />
          </div>
          <span className="mb-div" />
          <Tool icon={IconTrash} label="Delete" className="danger" onClick={onDelete} disabled={none} />
        </div>
      </div>
    </div>
  );
}
