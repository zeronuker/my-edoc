import { useRef, useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";
import { createOffer, acceptAnswer, sendFiles } from "./transfer.js";

const isPdf = (f) => f.name.toLowerCase().endsWith(".pdf") && f.size > 0;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// The PC half of "Receive from PC": open this page (the app's address with
// ?send on the end) in any desktop browser, pick PDFs or a folder, and swap
// codes with the device running eDoc.
export default function SendPage() {
  const [entries, setEntries] = useState(null); // [{ file, path }]
  const [kind, setKind] = useState("files");
  const [stage, setStage] = useState("pick"); // pick | offer | sending | done
  const [code, setCode] = useState("");
  const [reply, setReply] = useState("");
  const [progress, setProgress] = useState([0, 0]);
  const [error, setError] = useState("");
  const peer = useRef(null);

  function onPick(e, asFolder) {
    const pdfs = [...e.target.files].filter(isPdf);
    e.target.value = "";
    if (pdfs.length === 0) return setError("No PDF files found there.");
    setError("");
    setKind(asFolder ? "folder" : "files");
    setEntries(pdfs.map((file) => ({ file, path: asFolder ? file.webkitRelativePath : file.name })));
  }

  async function makeCode() {
    try {
      peer.current = await createOffer();
      setCode(peer.current.code);
      setStage("offer");
    } catch (err) {
      setError(`Couldn't make a code: ${err.message}`);
    }
  }

  async function connect() {
    setStage("sending");
    setError("");
    try {
      await acceptAnswer(peer.current.pc, reply);
      await sendFiles(peer.current.channel, entries, kind, (done, total) => setProgress([done, total]));
      setStage("done");
    } catch (err) {
      // A used-up code can't be retried; start over with a fresh one.
      setError(`Transfer failed: ${err.message}`);
      setStage("pick");
    }
    peer.current.pc.close();
  }

  const total = entries?.reduce((sum, e) => sum + e.file.size, 0) ?? 0;
  const copy = () => navigator.clipboard?.writeText(code).catch(() => {});

  return (
    <div className="send-page">
      <ChamferFrame className="send-card">
        <div className="update-dialog-title">SEND TO eDOC</div>
        <div className="update-dialog-subtitle">PC → iPAD / PHONE OVER WIFI</div>

        {stage === "pick" && (
          <>
            <div className="update-dialog-body">
              Both devices must be on the same wifi. Pick the PDFs, or a whole folder, to send.
            </div>
            <div className="send-row">
              <label className="cb-btn">
                Choose PDFs
                <input type="file" accept=".pdf,application/pdf" multiple hidden onChange={(e) => onPick(e, false)} />
              </label>
              <label className="cb-btn">
                Choose folder
                <input type="file" webkitdirectory="" multiple hidden onChange={(e) => onPick(e, true)} />
              </label>
            </div>
            {entries && (
              <>
                <div className="update-dialog-body">
                  {entries.length} PDF{entries.length === 1 ? "" : "s"} · {mb(total)}
                  {kind === "folder" && <> · folder “{entries[0].path.split("/")[0]}”</>}
                </div>
                <button className="cb-btn update-dialog-now" onClick={makeCode}>
                  Make code
                </button>
              </>
            )}
          </>
        )}

        {stage === "offer" && (
          <>
            <div className="update-dialog-body">
              1. In eDoc on the other device: + → Receive from PC, then paste this code.
            </div>
            <textarea className="send-code" readOnly value={code} onFocus={(e) => e.target.select()} />
            <button className="cb-btn" onClick={copy}>
              Copy code
            </button>
            <div className="update-dialog-body">2. Paste the code eDoc shows you back here.</div>
            <textarea
              className="send-code"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply code"
            />
            <button className="cb-btn update-dialog-now" onClick={connect} disabled={!reply.trim()}>
              Connect and send
            </button>
          </>
        )}

        {stage === "sending" && (
          <div className="update-dialog-body">
            Sending… {mb(progress[0])} of {mb(progress[1])}
          </div>
        )}
        {stage === "done" && <div className="update-dialog-body">Sent. You can close this page.</div>}

        {error && <div className="add-files-warning">{error}</div>}
      </ChamferFrame>
    </div>
  );
}
