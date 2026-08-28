import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";


// A plain canvas signature pad - Pointer Events (not separate mouse/touch
// handlers) cover mouse, touch, and stylus input with one code path,
// which is all modern browsers Atlas targets. Exposed via a ref
// (getSignature/clear/isEmpty) rather than a controlled value prop,
// because a canvas's drawn content was never meant to round-trip
// through React state on every stroke - the parent only ever needs the
// final PNG at submit time.
const SignaturePad = forwardRef(function SignaturePad(props, ref) {

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef(null);

  const [isEmpty, setIsEmpty] = useState(true);

  // Canvas backing-store size is set in real device pixels (CSS size x
  // devicePixelRatio) so a signature drawn on a retina phone screen
  // isn't blurry - the drawing context is then scaled once so every
  // subsequent coordinate can still be given in plain CSS pixels.
  useEffect(() => {

    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const resize = () => {

      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f1117";

    };

    resize();

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);

  }, []);

  const getPoint = (e) => {

    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };

  };

  const handlePointerDown = (e) => {

    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);

  };

  const handlePointerMove = (e) => {

    if (!drawingRef.current) {
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    const point = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;

    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setIsEmpty(false);
    }

  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const clear = () => {

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    hasDrawnRef.current = false;
    setIsEmpty(true);

  };

  useImperativeHandle(ref, () => ({

    clear,

    isEmpty: () => !hasDrawnRef.current,

    // null when nothing's been drawn, so a caller can't accidentally
    // submit a blank signature just because toDataURL() always
    // succeeds even on an untouched canvas.
    getSignature: () => (hasDrawnRef.current ? canvasRef.current.toDataURL("image/png") : null)

  }));

  return (

    <div>

      <div
        ref={containerRef}
        className="h-40 w-full touch-none rounded-lg border border-border bg-white"
      >

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-full w-full touch-none"
        />

      </div>

      <div className="mt-2 flex items-center justify-between">

        <p className="text-xs text-fg-faint">
          Sign above with your finger, stylus, or mouse.
        </p>

        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="flex items-center gap-1 text-xs font-medium text-fg-muted transition hover:text-fg disabled:opacity-40"
        >
          <Eraser size={12} />
          Clear
        </button>

      </div>

    </div>

  );

});

export default SignaturePad;
