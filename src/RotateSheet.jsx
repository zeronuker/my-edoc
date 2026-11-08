import { useEffect, useRef, useState } from "react";
import { RenderingCancelledException } from "pdfjs-dist";
import { IconChecks, IconChevronLeft, IconRotate, IconRotateClockwise, IconSquareOff, IconX } from "@tabler/icons-react";
import ChamferFrame from "@brand/ChamferFrame";
import { loadDocument } from "./edoc.js";

const THUMB = 96; // px: longest side of a page thumbnail

// One page at a time: rendering several big scanned pages at once is what
// runs a small device out of memory.
let renderQueue = Promise.resolve();
const enqueue = (task) => {
  const run = renderQueue.then(task);
  renderQueue = run.catch(() => {});
  return run;
};

// A page thumbnail that draws once it scrolls near view, turned by `rotation`
// degrees on top of the page's own turn. The frame is square, and the page is
// drawn with its longest side at THUMB, so any turn fits inside it.
function PageThumb({ pdf, pageNumber, rotation, checked, onToggle }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (drawn) return;
    const el = wrapRef.current;
    let cancelled = false;
    let renderTask = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        enqueue(draw).catch(() => {});
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);

    async function draw() {
      if (cancelled) return;
      const page = await pdf.getPage(pageNumber);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (THUMB * ratio) / Math.max(natural.width, natural.height) });
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      try {
        await renderTask.promise;
      } catch (err) {
        if (!(err instanceof RenderingCancelledException)) throw err;
        return;
      }
      page.cleanup();
      if (!cancelled) setDrawn(true);
    }

    return () => {
      cancelled = true;
      renderTask?.cancel();
      observer.disconnect();
    };
  }, [pdf, pageNumber, drawn]);

  return (
    <button
      ref={wrapRef}
      className={`rotate-thumb${checked ? " checked" : ""}`}
      aria-pressed={checked}
      aria-label={`Page ${pageNumber}`}
      onClick={() => onToggle(pageNumber)}
    >
      <span className="rotate-thumb-frame">
        <canvas ref={canvasRef} hidden={!drawn} style={{ transform: `rotate(${rotation}deg)` }} />
        {checked && <span className="rotate-thumb-tick">✓</span>}
      </span>
      <span className="thumb-page-num">{pageNumber}</span>
    </button>
  );
}

// Full-screen sheet for turning a file's pages. Every page starts selected,
// so Rotate with no further taps turns the whole file; tap pages to pick just
// some. `file` is what the sheet shows and turns (the saved annotated version
// when the file has one). onSave(rotations, replace) gets the degrees to add
// to each page and whether to replace the original; it resolves once saved.
export default function RotateSheet({ file, name, onSave, onClose, closing = false }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [turns, setTurns] = useState([]); // degrees added so far, per page
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let doc = null;
    let gone = false;
    loadDocument(file, { skipPassword: true })
      .then((loaded) => {
        doc = loaded;
        if (gone) return loaded.destroy();
        setPdf(loaded);
        setTurns(new Array(loaded.numPages).fill(0));
        setSelected(new Set(Array.from({ length: loaded.numPages }, (_, i) => i + 1)));
      })
      .catch(() => !gone && setError("This file can't be opened here. It may be password protected or damaged."));
    return () => {
      gone = true;
      doc?.destroy();
    };
  }, [file]);

  const turn = (delta) => setTurns((prev) => prev.map((t, i) => (selected.has(i + 1) ? (t + delta) % 360 : t)));
  const toggle = (n) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const numPages = pdf?.numPages ?? 0;
  const changed = turns.some((t) => t !== 0);
  const noneSelected = selected.size === 0;

  async function save(replace) {
    setBusy(true);
    try {
      await onSave(turns, replace);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <ChamferFrame className={`modal-dialog move-picker${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`Rotate ${name}`}>
      <div className="move-picker-head">
        <button className="icon-btn" aria-label="Back" onClick={onClose} disabled={busy}>
          <IconChevronLeft size={18} />
        </button>
        <div className="move-picker-title">Rotate "{name}"</div>
      </div>

      <div className="rotate-tools">
        <button className="cb-btn" onClick={() => turn(270)} disabled={noneSelected || busy}>
          <IconRotate size={14} /> Left
        </button>
        <button className="cb-btn" onClick={() => turn(90)} disabled={noneSelected || busy}>
          <IconRotateClockwise size={14} /> Right
        </button>
        <button className="cb-btn" onClick={() => turn(180)} disabled={noneSelected || busy}>
          180°
        </button>
        <span className="rotate-tools-gap" />
        <button className="cb-btn" onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i + 1)))} disabled={busy}>
          <IconChecks size={14} /> All
        </button>
        <button className="cb-btn" onClick={() => setSelected(new Set())} disabled={busy}>
          <IconSquareOff size={14} /> None
        </button>
      </div>
      <div className="move-picker-crumbs">
        {pdf ? `${selected.size} of ${numPages} pages selected` : error ?? "Loading pages…"}
      </div>

      <div className="rotate-grid">
        {pdf &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <PageThumb key={n} pdf={pdf} pageNumber={n} rotation={turns[n - 1] ?? 0} checked={selected.has(n)} onToggle={toggle} />
          ))}
      </div>

      <div className="move-picker-foot rotate-foot">
        <span className="move-picker-hint">
          {changed ? "Replace overwrites the original and can't be undone." : "Rotate pages, then save."}
        </span>
        <button className="cb-btn" onClick={onClose} disabled={busy}>
          <IconX size={14} /> Cancel
        </button>
        <button className="cb-btn" onClick={() => save(true)} disabled={!changed || busy}>
          Replace original
        </button>
        <button className="cb-btn update-dialog-now" onClick={() => save(false)} disabled={!changed || busy}>
          {busy ? "Saving…" : "Save as new file"}
        </button>
      </div>
      </ChamferFrame>
    </>
  );
}
