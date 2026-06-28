import { useEffect, useRef } from "react";
import { renderPageToCanvas } from "./edoc.js";

export default function PageCanvas({ pdf, pageNumber, scale }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    renderPageToCanvas(pdf, pageNumber, canvasRef.current, scale).catch((err) => {
      if (!cancelled) console.error(err);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);

  return <canvas className="page-canvas" ref={canvasRef} />;
}
