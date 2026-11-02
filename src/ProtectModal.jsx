import { useState } from "react";
import ToolModal from "./ToolModal.jsx";

// Asks for the password to lock a file with, twice, then hands it to the
// shared save dialog. onSave(replace, password) resolves once saved.
export default function ProtectModal({ name, busy, onSave, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm !== "" && confirm !== password;

  return (
    <ToolModal
      title="PROTECT"
      subtitle={name}
      busy={busy}
      canSave={password !== "" && password === confirm}
      onSave={(replace) => onSave(replace, password)}
      onClose={onClose}
    >
      <p>The file will only open with this password.</p>
      <input
        className="rename-input"
        type="password"
        autoFocus
        autoComplete="new-password"
        aria-label="Password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className="rename-input protect-confirm"
        type="password"
        autoComplete="new-password"
        aria-label="Confirm password"
        placeholder="Type it again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {mismatch && <p className="password-wrong">The two passwords don't match.</p>}
      <p>There is no way to get the file back if you forget it. Replace original can't be undone.</p>
    </ToolModal>
  );
}
