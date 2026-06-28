import { useEffect, useRef } from "react";
import { startPageRender } from "./edoc.js";

export default function PageCanvas({ pdf, pageNumber, scale }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    let renderTask;

    startPageRender(pdf, pageNumber, canvasRef.current, scale).then((task) => {
      if (!active) {
        task.cancel();
        return;
      }
      renderTask = task;
      renderTask.promise.catch((err) => {
        if (err?.name !== "RenderingCancelledException") console.error(err);
      });
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  return <canvas className="page-canvas" ref={canvasRef} />;
}
