import { useEffect, useRef, useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";
import { createAnswer, receiveFiles } from "./transfer.js";

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// The iPad/phone half of + → Receive from PC. Paste the code the PC page
// (the app's address with ?send) shows, copy the reply code back to it, and
// the PDFs arrive over wifi. onReceived({ kind, files }) hands them to the
// normal add-folder / add-files flow.
export default function ReceiveModal({ onReceived, onClose, closing }) {
  const [offer, setOffer] = useState("");
  const [reply, setReply] = useState("");
  const [progress, setProgress] = useState(null); // [received, total]
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pcRef = useRef(null);

  useEffect(() => () => pcRef.current?.close(), []);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const { pc, code } = await createAnswer(offer);
      pcRef.current = pc;
      setReply(code);
      const result = await receiveFiles(pc, (done, total) => setProgress([done, total]));
      onReceived(result);
    } catch (err) {
      pcRef.current?.close();
      pcRef.current = null;
      setReply("");
      setProgress(null);
      setBusy(false);
      setError(`Couldn't receive the files: ${err.message}`);
    }
  }

  const copy = () => navigator.clipboard?.writeText(reply).catch(() => {});

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame className={`modal-dialog add-files-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">⇩</span>
          <div>
            <div className="update-dialog-title">RECEIVE FROM PC</div>
            <div className="update-dialog-subtitle">OVER WIFI</div>
          </div>
        </div>

        {!reply && (
          <>
            <div className="update-dialog-body">
              On the PC, open this app’s address with <b>?send</b> on the end, pick the PDFs, and paste the code it
              shows here.
            </div>
            <textarea
              className="send-code"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Code from the PC"
              disabled={busy}
            />
          </>
        )}
        {reply && !progress && (
          <>
            <div className="update-dialog-body">Copy this reply code and paste it on the PC, then press Connect.</div>
            <textarea className="send-code" readOnly value={reply} onFocus={(e) => e.target.select()} />
            <button className="cb-btn" onClick={copy}>
              Copy reply code
            </button>
          </>
        )}
        {progress && (
          <div className="update-dialog-body">
            Receiving… {mb(progress[0])} of {mb(progress[1])}
          </div>
        )}

        {error && <div className="add-files-warning">{error}</div>}

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          {!reply && (
            <button className="cb-btn update-dialog-now" onClick={start} disabled={busy || !offer.trim()}>
              Continue
            </button>
          )}
        </div>
      </ChamferFrame>
    </>
  );
}
