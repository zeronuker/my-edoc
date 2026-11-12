import { useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";
import { formatBytes } from "./appHelpers.js";
import Checkbox from "./Checkbox.jsx";

function Facts({ label, node }) {
  const added = node.addedAt ? new Date(node.addedAt).toLocaleDateString() : "—";
  return (
    <div className="clash-facts">
      <div className="clash-facts-label">{label}</div>
      <div className="clash-facts-name">{node.name}</div>
      <div>{node.kind === "directory" ? "Folder" : "File"} · {formatBytes(node.size)}</div>
      <div>Added {added}</div>
    </div>
  );
}

// Same modal shell as ConfirmRemoveModal. Asked when a moved item's name is
// already taken in the destination. `request` is { clash, remaining } where
// clash is { incoming, existing, inBatch } (see planMove) and remaining is how
// many clashes are left including this one. onChoose gets ("skip" | "replace"
// | "both", applyToAll).
export default function MoveClashModal({ request, onChoose, closing }) {
  const { clash, remaining } = request;
  const [all, setAll] = useState(false);
  // A folder can't be replaced, and neither can something that is only
  // arriving in this same move.
  const canReplace = clash.incoming.kind === "file" && !clash.inBatch;

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">NAME ALREADY THERE</div>
            <div className="update-dialog-subtitle">{clash.incoming.name}</div>
          </div>
        </div>

        <div className="update-dialog-body">
          <div className="clash-compare">
            <Facts label="Already there" node={clash.existing} />
            <Facts label="Moving" node={clash.incoming} />
          </div>
          {canReplace && <p>Replace deletes the file already there, with its bookmarks and annotations.</p>}
          {remaining > 1 && (
            <label className="clash-all">
              <Checkbox checked={all} onChange={setAll} />
              Do this for all {remaining} conflicts
            </label>
          )}
        </div>

        <div className="update-dialog-actions clash-actions">
          <button className="cb-btn" onClick={() => onChoose("skip", all)}>
            Keep existing
          </button>
          {canReplace && (
            <button className="cb-btn" onClick={() => onChoose("replace", all)}>
              Replace
            </button>
          )}
          <button className="cb-btn update-dialog-now" onClick={() => onChoose("both", all)}>
            Keep both
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
