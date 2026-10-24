import ChamferFrame from "@brand/ChamferFrame";
// A small "pick one" dialog, same shell as the other modals. `actions` is
// [{ label, value, primary? }]; Cancel is always offered and resolves
// undefined. Used where the app has to ask something before it goes on —
// updating a folder that's already there, what to do with saved annotations —
// via App.jsx's askChoice, which turns it into a promise.
export default function ChoiceModal({ spec, onChoose, onClose, closing }) {
  const { title, subtitle, body, items, actions } = spec;
  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">?</span>
          <div>
            <div className="update-dialog-title">{title}</div>
            {subtitle && <div className="update-dialog-subtitle">{subtitle}</div>}
          </div>
        </div>

        <div className="update-dialog-body">{body}</div>
        {items?.length > 0 && (
          <ul className="modal-list">
            {items.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        <div className="update-dialog-actions choice-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          {actions.map((a) => (
            <button
              key={a.value}
              className={`cb-btn${a.primary ? " update-dialog-now" : ""}`}
              onClick={() => onChoose(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </ChamferFrame>
    </>
  );
}
