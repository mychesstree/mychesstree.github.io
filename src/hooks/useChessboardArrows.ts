import { useEffect, useRef, useCallback } from 'react';

const NUM_SQUARES = 8;

interface Point {
  x: number;
  y: number;
}

/**
 * A React hook that implements chessboard-arrows logic
 * on a canvas overlay atop a react-chessboard instance.
 * Right-click to draw arrows/circles, left-click to clear.
 */
export function useChessboardArrows(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  colour = 'rgba(225, 29, 72, 0.75)'  // default: accent red
) {
  const primaryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialPointRef = useRef<Point>({ x: 0, y: 0 });
  const finalPointRef = useRef<Point>({ x: 0, y: 0 });
  const mouseDownRef = useRef(false);
  const arrowWidth = 15;
  const resFactor = 2;

  const Q = useCallback((x: number, canvasWidth: number) => {
    const d = canvasWidth / (resFactor * NUM_SQUARES);
    return d * (Math.floor(x / d) + 0.5);
  }, [resFactor]);

  const getMousePos = useCallback((canvas: HTMLCanvasElement, evt: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    const canvasWidth = canvas.width;
    return {
      x: Q(evt.clientX - rect.left, canvasWidth),
      y: Q(evt.clientY - rect.top, canvasWidth),
    };
  }, [Q]);

  const setResolution = (canvas: HTMLCanvasElement, scale: number) => {
    canvas.style.width = canvas.style.width || canvas.width + 'px';
    canvas.style.height = canvas.style.height || canvas.height + 'px';
    canvas.width = Math.ceil(canvas.width * scale);
    canvas.height = Math.ceil(canvas.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    return ctx;
  };

  const drawArrowHead = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number, r: number) => {
    const x_center = tox;
    const y_center = toy;
    let angle = Math.atan2(toy - fromy, tox - fromx);

    ctx.beginPath();
    let x = r * Math.cos(angle) + x_center;
    let y = r * Math.sin(angle) + y_center;
    ctx.moveTo(x, y);
    angle += (1 / 3) * (2 * Math.PI);
    x = r * Math.cos(angle) + x_center;
    y = r * Math.sin(angle) + y_center;
    ctx.lineTo(x, y);
    angle += (1 / 3) * (2 * Math.PI);
    x = r * Math.cos(angle) + x_center;
    y = r * Math.sin(angle) + y_center;
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  };

  const drawArrowToCanvas = useCallback((ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
    let xFactor = 0, yFactor = 0;
    if (from.x === to.x) {
      yFactor = Math.sign(to.y - from.y) * arrowWidth;
    } else if (from.y === to.y) {
      xFactor = Math.sign(to.x - from.x) * arrowWidth;
    } else {
      const slope_mag = Math.abs((to.y - from.y) / (to.x - from.x));
      xFactor = Math.sign(to.x - from.x) * arrowWidth / Math.sqrt(1 + slope_mag ** 2);
      yFactor = Math.sign(to.y - from.y) * Math.abs(xFactor) * slope_mag;
    }
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x - xFactor, to.y - yFactor);
    ctx.stroke();
    drawArrowHead(ctx, from.x, from.y, to.x - xFactor, to.y - yFactor, arrowWidth);
  }, [arrowWidth]);

  const clearCanvas = useCallback(() => {
    const pc = primaryCanvasRef.current;
    const dc = drawCanvasRef.current;
    if (pc) pc.getContext('2d')?.clearRect(0, 0, pc.width, pc.height);
    if (dc) dc.getContext('2d')?.clearRect(0, 0, dc.width, dc.height);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Wait for the board to render before sizing canvases
    const init = () => {
      const boardSize = wrapper.clientWidth;
      if (!boardSize) return;

      // Create canvases
      const primaryCanvas = document.createElement('canvas');
      primaryCanvas.id = 'primary_canvas';
      primaryCanvas.width = boardSize;
      primaryCanvas.height = boardSize;
      Object.assign(primaryCanvas.style, { position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 });
      primaryCanvasRef.current = primaryCanvas;

      const drawCanvas = document.createElement('canvas');
      drawCanvas.id = 'drawing_canvas';
      drawCanvas.width = boardSize;
      drawCanvas.height = boardSize;
      Object.assign(drawCanvas.style, { position: 'absolute', top: 0, left: 0, zIndex: 11, cursor: 'crosshair' });
      drawCanvasRef.current = drawCanvas;

      const primaryCtx = setResolution(primaryCanvas, resFactor);
      const drawCtx = setResolution(drawCanvas, resFactor);

      const setStyle = (ctx: CanvasRenderingContext2D) => {
        ctx.strokeStyle = ctx.fillStyle = colour;
        ctx.lineJoin = 'bevel';
      };
      setStyle(primaryCtx);
      setStyle(drawCtx);

      wrapper.style.position = 'relative';
      wrapper.appendChild(primaryCanvas);
      wrapper.appendChild(drawCanvas);

      const drawCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.stroke();
      };

      const onMouseDown = (e: MouseEvent) => {
        if (e.which === 3) {
          mouseDownRef.current = true;
          const pos = getMousePos(drawCanvas, e);
          initialPointRef.current = pos;
          finalPointRef.current = pos;
          const radius = primaryCanvas.width / (resFactor * NUM_SQUARES * 2) - 1;
          drawCircle(drawCtx, pos.x, pos.y, radius);
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        if (e.which === 3) {
          mouseDownRef.current = false;
          const ip = initialPointRef.current;
          const fp = finalPointRef.current;
          if (ip.x === fp.x && ip.y === fp.y) {
            drawCircle(primaryCtx, ip.x, ip.y, primaryCanvas.width / (resFactor * NUM_SQUARES * 2) - 1);
          } else {
            drawArrowToCanvas(primaryCtx, ip, fp);
          }
          drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        } else if (e.which === 1) {
          primaryCtx.clearRect(0, 0, primaryCanvas.width, primaryCanvas.height);
          drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
      };

      const onMouseMove = (e: MouseEvent) => {
        const fp = getMousePos(drawCanvas, e);
        finalPointRef.current = fp;
        if (!mouseDownRef.current) return;
        const ip = initialPointRef.current;
        if (ip.x === fp.x && ip.y === fp.y) return;
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        drawArrowToCanvas(drawCtx, ip, fp);
      };

      drawCanvas.addEventListener('mousedown', onMouseDown);
      drawCanvas.addEventListener('mouseup', onMouseUp);
      drawCanvas.addEventListener('mousemove', onMouseMove);
      drawCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

      return () => {
        drawCanvas.removeEventListener('mousedown', onMouseDown);
        drawCanvas.removeEventListener('mouseup', onMouseUp);
        drawCanvas.removeEventListener('mousemove', onMouseMove);
        primaryCanvas.remove();
        drawCanvas.remove();
      };
    };

    // small delay to let board render
    const timerId = setTimeout(init, 100);
    return () => clearTimeout(timerId);
  }, [wrapperRef, colour, drawArrowToCanvas, getMousePos]);

  return { clearCanvas };
}
