import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import ChamferFrame from "@brand/ChamferFrame";
import { makeCode, cleanCode, hostSession, joinSession, openLink } from "./transfer.js";
import { pickFolderLegacy, pickPdfFiles } from "./fileSystem.js";

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const CONNECT_TIMEOUT_MS = 15000;

function QrImage({ text }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return <img className="wifi-qr" src={qr.createDataURL(6, 8)} alt={`QR code for ${text}`} />;
}

// Camera → jsQR, a few looks a second, until it reads a valid code.
function QrScanner({ onCode, onFail }) {
  const video = useRef(null);
  useEffect(() => {
    let stream;
    let timer;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    function look() {
      const v = video.current;
      if (v?.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = v.videoWidth * scale;
        canvas.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = cleanCode(jsQR(img.data, img.width, img.height)?.data ?? "");
        if (code) return onCode(code);
      }
      timer = setTimeout(look, 200);
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        video.current.srcObject = s;
        video.current.play();
        look();
      })
      .catch(onFail);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return <video ref={video} className="wifi-scan" playsInline muted />;
}

// + → Send / receive via wifi. One device shows a code + QR, the other
// types or scans it; once connected, either side can send PDFs or a folder.
// Received files go to onReceived({ kind, files }), which runs the normal
// Add folder / Add files flows; `hidden` tucks this dialog away while those
// dialogs are up, without dropping the connection.
export default function WifiModal({ hidden, appError, onReceived, beginReceive, onClose, closing }) {
  const [stage, setStage] = useState("menu"); // menu | show | enter | connected
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const peer = useRef(null);
  const link = useRef(null);
  const timer = useRef(null);
  // The link outlives many renders; always hand files to the latest handler.
  const onReceivedRef = useRef(onReceived);
  onReceivedRef.current = onReceived;
  const beginReceiveRef = useRef(beginReceive);
  beginReceiveRef.current = beginReceive;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      peer.current?.destroy();
    },
    []
  );

  function reset(message = "") {
    clearTimeout(timer.current);
    peer.current?.destroy();
    peer.current = null;
    link.current = null;
    setScanning(false);
    setBusy(false);
    setStatus("");
    setError(message);
    setStage("menu");
  }

  function connected(conn) {
    clearTimeout(timer.current);
    conn.on("close", () => reset("The other device disconnected."));
    link.current = openLink(conn, {
      onReceived: (result) => {
        setStatus(`Received ${result.files.length} PDF${result.files.length === 1 ? "" : "s"}.`);
        onReceivedRef.current(result);
      },
      onReceiveProgress: (done, total) => setStatus(`Receiving… ${mb(done)} of ${mb(total)}`),
      onError: (err) => setError(err.message),
      beginReceive: (kind) => beginReceiveRef.current?.(kind),
    });
    setBusy(false);
    setScanning(false);
    setStage("connected");
  }

  function startHost() {
    const next = makeCode();
    setCode(next);
    setError("");
    setStage("show");
    peer.current?.destroy();
    peer.current = hostSession(next, connected, (err) => {
      // The pairing service is only needed to connect; once linked, its errors don't matter.
      if (link.current) return;
      if (err.type === "unavailable-id") startHost(); // someone else has that code; draw another
      else reset(`Couldn't start: ${err.message}`);
    });
  }

  function join(text) {
    const entered = cleanCode(text);
    if (!entered) return setError("A code is 6 letters or digits.");
    setError("");
    setBusy(true);
    setScanning(false);
    peer.current?.destroy();
    peer.current = joinSession(entered, connected, (err) => {
      if (link.current) return;
      reset(err.type === "peer-unavailable" ? "No device is showing that code." : `Couldn't connect: ${err.message}`);
    });
    timer.current = setTimeout(
      () => reset("Couldn't reach it over wifi. Both devices need to be on the same network."),
      CONNECT_TIMEOUT_MS
    );
  }

  async function sendPicked(folder) {
    let picked;
    try {
      picked = await (folder ? pickFolderLegacy() : pickPdfFiles());
    } catch {
      return; // cancelled
    }
    const pdfs = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf") && f.size > 0);
    if (pdfs.length === 0) return setError("No PDF files found there.");
    setError("");
    setBusy(true);
    try {
      const entries = pdfs.map((file) => ({ file, path: folder ? file.webkitRelativePath : file.name }));
      await link.current.send(entries, folder ? "folder" : "files", (done, total) =>
        setStatus(`Sending… ${mb(done)} of ${mb(total)}`)
      );
      setStatus(`Sent ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(`Couldn't send: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame className={`modal-dialog add-files-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">⇅</span>
          <div>
            <div className="update-dialog-title">SEND / RECEIVE VIA WIFI</div>
            <div className="update-dialog-subtitle">
              {stage === "connected" ? "CONNECTED" : "SAME WIFI NETWORK"}
            </div>
          </div>
        </div>

        {/* Keyed by stage so each step fades in as its own element. */}
        <div className="wifi-stage" key={stage}>
        {stage === "menu" && (
          <>
            <div className="update-dialog-body">
              Open this on both devices. Show a code on one and enter or scan it on the other.
            </div>
            <div className="update-dialog-actions">
              <button className="cb-btn" onClick={startHost}>
                Show code
              </button>
              <button className="cb-btn" onClick={() => setStage("enter")}>
                Enter code
              </button>
            </div>
          </>
        )}

        {stage === "show" && (
          <>
            <div className="wifi-code">{code}</div>
            <QrImage text={code} />
            <div className="update-dialog-body">Waiting for the other device…</div>
          </>
        )}

        {stage === "enter" && (
          <>
            {scanning ? (
              <QrScanner
                onCode={join}
                onFail={() => {
                  setScanning(false);
                  setError("Camera isn't available. Type the code instead.");
                }}
              />
            ) : (
              <>
                <input
                  className="wifi-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="CODE"
                  maxLength={9}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <div className="update-dialog-actions">
                  <button className="cb-btn" onClick={() => setScanning(true)} disabled={busy}>
                    Scan QR
                  </button>
                  <button className="cb-btn update-dialog-now" onClick={() => join(typed)} disabled={busy || !typed.trim()}>
                    {busy ? "Connecting…" : "Connect"}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {stage === "connected" && (
          <>
            <div className="update-dialog-body">Connected. Send PDFs from this device, or wait for the other one to send.</div>
            <div className="update-dialog-actions">
              <button className="cb-btn" onClick={() => sendPicked(false)} disabled={busy}>
                Send PDFs
              </button>
              <button className="cb-btn" onClick={() => sendPicked(true)} disabled={busy}>
                Send folder
              </button>
            </div>
          </>
        )}
        </div>

        {status && <div className="update-dialog-body wifi-status">{status}</div>}
        {/* The app's own error banner sits behind this dialog, so show it here too. */}
        {(error || appError) && <div className="add-files-warning wifi-error">{error || appError}</div>}

        <div className="update-dialog-actions wifi-close">
          <button className="cb-btn" onClick={stage === "show" || stage === "enter" ? () => reset() : onClose}>
            {stage === "menu" ? "Close" : stage === "connected" ? "Disconnect" : "Back"}
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
