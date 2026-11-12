// A button that acts as a checkbox, so no stock browser control is drawn.
// Extra props (aria-label, ...) go to the button; onClick runs first, which
// is how a row can stop its own click from firing.
export default function Checkbox({ checked, onChange, onClick, className = "", ...rest }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`ed-check ${className}`}
      onClick={(e) => {
        onClick?.(e);
        onChange(!checked);
      }}
      {...rest}
    >
      {checked && (
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 6.5 4.8 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
