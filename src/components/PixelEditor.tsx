import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Download,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  GripVertical,
  Grid3X3,
  ImagePlus,
  Layers,
  Move,
  PaintBucket,
  Pause,
  Pencil,
  Pipette,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Creature, Frame } from "../types";
import { LocalStore } from "../stores/localStore";

type Tool = "pencil" | "eraser" | "pipette" | "bucket" | "move" | "select";
type UploadMode = "replace" | "insert";

interface PixelEditorProps {
  creature: Creature;
  animationId: string;
  frameIndex: number;
  direction: number;
  onSaved: (updatedCreature: Creature) => void;
  onBackToStudio: () => void;
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Gesture {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  source?: ImageData;
}

const TRANSPARENT = "rgba(0,0,0,0)";
const PMD_TICK_MS = 1000 / 60;
const PALETTE = [
  "#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F",
  "#C2C3C7", "#FFF1E8", "#FF004D", "#FFA300", "#FFEC27", "#00E436",
  "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA",
];

function cloneCreature(creature: Creature): Creature {
  if (typeof structuredClone === "function") return structuredClone(creature);
  return JSON.parse(JSON.stringify(creature)) as Creature;
}

function blankDataUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.toDataURL("image/png");
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = source;
  });
}

function pointFromEvent(
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width))),
    y: Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height))),
  };
}

function normalizedRect(x1: number, y1: number, x2: number, y2: number): SelectionRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1) + 1,
    height: Math.abs(y2 - y1) + 1,
  };
}

function parseColor(color: string): [number, number, number, number] {
  if (color === TRANSPARENT) return [0, 0, 0, 0];
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function linePixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  paint: (x: number, y: number) => void,
) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    paint(x, y);
    if (x === x1 && y === y1) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function fitImage(image: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  ctx.drawImage(image, Math.floor((width - drawWidth) / 2), Math.floor((height - drawHeight) / 2), drawWidth, drawHeight);
  return canvas.toDataURL("image/png");
}

export const PixelEditor: React.FC<PixelEditorProps> = ({
  creature: initialCreature,
  animationId: initialAnimationId,
  frameIndex: initialFrameIndex,
  direction: initialDirection,
  onSaved,
  onBackToStudio,
}) => {
  const [localCreature, setLocalCreature] = useState(() => cloneCreature(initialCreature));
  const [animationId, setAnimationId] = useState(initialAnimationId);
  const [direction, setDirection] = useState(initialDirection);
  const [frameIndex, setFrameIndex] = useState(initialFrameIndex);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#facc15");
  const [brushSize, setBrushSize] = useState(1);
  const [zoom, setZoom] = useState(10);
  const [grid, setGrid] = useState(true);
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(initialFrameIndex);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasFrameClipboard, setHasFrameClipboard] = useState(false);
  const [hasPixelClipboard, setHasPixelClipboard] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<UploadMode>("replace");
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const gestureRef = useRef<Gesture | null>(null);
  const frameClipboardRef = useRef<string | null>(null);
  const pixelClipboardRef = useRef<ImageData | null>(null);

  const animation = useMemo(
    () => localCreature.animations.find((item) => item.id === animationId) || localCreature.animations[0],
    [animationId, localCreature.animations],
  );
  const width = animation?.frameWidth || 32;
  const height = animation?.frameHeight || 32;
  const directions = animation?.directions === 1 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const frames = animation?.framesByDirection[direction] || [];
  const frame = frames[frameIndex] || frames[0];
  const previousFrame = frames.length > 1 ? frames[(frameIndex - 1 + frames.length) % frames.length] : undefined;

  const flash = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2200);
  };

  const pushHistory = (ctx: CanvasRenderingContext2D) => {
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(ctx.getImageData(0, 0, width, height));
    if (next.length > 80) next.shift();
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const committedCreature = (): Creature => {
    const next = cloneCreature(localCreature);
    const targetAnimation = next.animations.find((item) => item.id === animationId);
    const targetFrame = targetAnimation?.framesByDirection[direction]?.[frameIndex];
    if (targetFrame && canvasRef.current) targetFrame.dataUrl = canvasRef.current.toDataURL("image/png");
    return next;
  };

  const mutateAnimation = (mutator: (target: NonNullable<typeof animation>) => void) => {
    const next = committedCreature();
    const target = next.animations.find((item) => item.id === animationId);
    if (!target) return;
    mutator(target);
    setLocalCreature(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    historyRef.current = [];
    historyIndexRef.current = -1;
    setSelection(null);
    if (!frame?.dataUrl) {
      pushHistory(ctx);
      return;
    }
    void loadImage(frame.dataUrl).then((image) => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      pushHistory(ctx);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [animationId, direction, frameIndex, frame?.dataUrl, height, width]);

  useEffect(() => {
    const canvas = onionRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!onion || !previousFrame?.dataUrl) return;
    void loadImage(previousFrame.dataUrl).then((image) => {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalAlpha = 1;
    });
  }, [height, onion, previousFrame?.dataUrl, width]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const previewFrame = frames[previewIndex] || frames[0];
    const timer = window.setTimeout(
      () => setPreviewIndex((index) => (index + 1) % frames.length),
      Math.max(16, (previewFrame.duration || 1) * PMD_TICK_MS),
    );
    return () => window.clearTimeout(timer);
  }, [frames, playing, previewIndex]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const previewFrame = frames[previewIndex] || frames[0];
    if (!previewFrame?.dataUrl) return;
    void loadImage(previewFrame.dataUrl).then((image) => ctx.drawImage(image, 0, 0, width, height));
  }, [frames, height, previewIndex, width]);

  const paint = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const half = Math.floor(brushSize / 2);
    if (tool === "eraser" || color === TRANSPARENT) {
      ctx.clearRect(x - half, y - half, brushSize, brushSize);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x - half, y - half, brushSize, brushSize);
    }
  };

  const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number) => {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const start = (startY * width + startX) * 4;
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const fill = parseColor(color);
    if (target.every((value, index) => value === fill[index])) return;
    const stack: Array<[number, number]> = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const index = (y * width + x) * 4;
      if (data[index] !== target[0] || data[index + 1] !== target[1] || data[index + 2] !== target[2] || data[index + 3] !== target[3]) continue;
      data[index] = fill[0]; data[index + 1] = fill[1]; data[index + 2] = fill[2]; data[index + 3] = fill[3];
      if (x > 0) stack.push([x - 1, y]);
      if (x < width - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < height - 1) stack.push([x, y + 1]);
    }
    ctx.putImageData(image, 0, 0);
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, canvas);
    gestureRef.current = {
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      source: tool === "move" ? ctx.getImageData(0, 0, width, height) : undefined,
    };
    if (tool === "pencil" || tool === "eraser") paint(ctx, point.x, point.y);
    if (tool === "pipette") {
      const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
      setColor(pixel[3] === 0 ? TRANSPARENT : `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
      setTool("pencil");
    }
    if (tool === "bucket") {
      floodFill(ctx, point.x, point.y);
      pushHistory(ctx);
    }
    if (tool === "select") setSelection({ x: point.x, y: point.y, width: 1, height: 1 });
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const gesture = gestureRef.current;
    if (!canvas || !ctx || !gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event, canvas);
    if (tool === "pencil" || tool === "eraser") {
      linePixels(gesture.lastX, gesture.lastY, point.x, point.y, (x, y) => paint(ctx, x, y));
    } else if (tool === "move" && gesture.source) {
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      sourceCanvas.getContext("2d")?.putImageData(gesture.source, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sourceCanvas, point.x - gesture.startX, point.y - gesture.startY);
    } else if (tool === "select") {
      setSelection(normalizedRect(gesture.startX, gesture.startY, point.x, point.y));
    }
    gesture.lastX = point.x;
    gesture.lastY = point.y;
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (ctx && (tool === "pencil" || tool === "eraser" || tool === "move")) pushHistory(ctx);
    gestureRef.current = null;
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const ctx = canvasRef.current?.getContext("2d");
    const state = historyRef.current[historyIndexRef.current];
    if (ctx && state) ctx.putImageData(state, 0, 0);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const ctx = canvasRef.current?.getContext("2d");
    const state = historyRef.current[historyIndexRef.current];
    if (ctx && state) ctx.putImageData(state, 0, 0);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const transform = (mode: "flip-x" | "flip-y" | "shift", dx = 0, dy = 0) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    source.getContext("2d")?.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (mode === "flip-x") { ctx.scale(-1, 1); ctx.drawImage(source, -width, 0); }
    else if (mode === "flip-y") { ctx.scale(1, -1); ctx.drawImage(source, 0, -height); }
    else ctx.drawImage(source, dx, dy);
    ctx.restore();
    pushHistory(ctx);
  };

  const copySelection = (cut = false) => {
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx || !selection) return;
    pixelClipboardRef.current = ctx.getImageData(selection.x, selection.y, selection.width, selection.height);
    setHasPixelClipboard(true);
    if (cut) {
      ctx.clearRect(selection.x, selection.y, selection.width, selection.height);
      pushHistory(ctx);
    }
    flash(cut ? "Seleção recortada" : "Seleção copiada");
  };

  const pasteSelection = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const pixels = pixelClipboardRef.current;
    if (!ctx || !pixels) return;
    const x = selection?.x ?? Math.floor((width - pixels.width) / 2);
    const y = selection?.y ?? Math.floor((height - pixels.height) / 2);
    ctx.putImageData(pixels, Math.max(0, x), Math.max(0, y));
    setSelection({ x: Math.max(0, x), y: Math.max(0, y), width: pixels.width, height: pixels.height });
    pushHistory(ctx);
  };

  const clearSelection = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !selection) return;
    ctx.clearRect(selection.x, selection.y, selection.width, selection.height);
    pushHistory(ctx);
  };

  const copyFrame = () => {
    if (!canvasRef.current) return;
    frameClipboardRef.current = canvasRef.current.toDataURL("image/png");
    setHasFrameClipboard(true);
    flash("Frame copiado");
  };

  const pasteFrame = async () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !frameClipboardRef.current) return;
    const image = await loadImage(frameClipboardRef.current);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    pushHistory(ctx);
  };

  const addFrame = (duplicate: boolean) => {
    const insertIndex = frameIndex + 1;
    mutateAnimation((target) => {
      const duration = target.durations[frameIndex] || 6;
      target.durations.splice(insertIndex, 0, duration);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const list = target.framesByDirection[directionIndex] || [];
        const source = list[frameIndex];
        const next: Frame = duplicate && source
          ? { ...source, id: `${target.id}_d${directionIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, frameIndex: insertIndex, origin: { ...source.origin }, shadowOrigin: source.shadowOrigin ? { ...source.shadowOrigin } : undefined }
          : { id: `${target.id}_d${directionIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, animationId: target.id, direction: directionIndex, frameIndex: insertIndex, dataUrl: blankDataUrl(target.frameWidth, target.frameHeight), duration, origin: { x: Math.floor(target.frameWidth / 2), y: Math.floor(target.frameHeight / 2) } };
        list.splice(insertIndex, 0, next);
        list.forEach((item, index) => { item.frameIndex = index; item.duration = target.durations[index] || item.duration; });
        target.framesByDirection[directionIndex] = list;
      }
    });
    setFrameIndex(insertIndex);
    setPreviewIndex(insertIndex);
    setPlaying(false);
  };

  const deleteFrame = () => {
    if (frames.length <= 1) return;
    mutateAnimation((target) => {
      target.durations.splice(frameIndex, 1);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const list = target.framesByDirection[directionIndex] || [];
        list.splice(frameIndex, 1);
        list.forEach((item, index) => { item.frameIndex = index; item.duration = target.durations[index] || item.duration; });
      }
    });
    setFrameIndex(Math.max(0, frameIndex - 1));
    setPlaying(false);
  };

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= frames.length) return;
    mutateAnimation((target) => {
      const [duration] = target.durations.splice(from, 1);
      target.durations.splice(to, 0, duration);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const list = target.framesByDirection[directionIndex] || [];
        const [item] = list.splice(from, 1);
        if (item) list.splice(to, 0, item);
        list.forEach((entry, index) => { entry.frameIndex = index; entry.duration = target.durations[index] || entry.duration; });
      }
    });
    setFrameIndex(to);
    setPlaying(false);
  };

  const chooseUpload = (mode: UploadMode) => {
    uploadModeRef.current = mode;
    fileRef.current?.click();
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const fitted = fitImage(await loadImage(source), width, height);
      if (uploadModeRef.current === "replace") {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const image = await loadImage(fitted);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        pushHistory(ctx);
      } else {
        const insertIndex = frameIndex + 1;
        mutateAnimation((target) => {
          const duration = target.durations[frameIndex] || 6;
          target.durations.splice(insertIndex, 0, duration);
          for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
            const list = target.framesByDirection[directionIndex] || [];
            list.splice(insertIndex, 0, {
              id: `${target.id}_d${directionIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              animationId: target.id,
              direction: directionIndex,
              frameIndex: insertIndex,
              dataUrl: directionIndex === direction ? fitted : blankDataUrl(target.frameWidth, target.frameHeight),
              duration,
              origin: { x: Math.floor(target.frameWidth / 2), y: Math.floor(target.frameHeight / 2) },
            });
            list.forEach((item, index) => { item.frameIndex = index; item.duration = target.durations[index] || item.duration; });
            target.framesByDirection[directionIndex] = list;
          }
        });
        setFrameIndex(insertIndex);
      }
      setPlaying(false);
      flash(uploadModeRef.current === "replace" ? "PNG aplicado" : "PNG inserido");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const navigate = (nextAnimation: string, nextDirection: number, nextFrame: number) => {
    setLocalCreature(committedCreature());
    setAnimationId(nextAnimation);
    setDirection(nextDirection);
    setFrameIndex(nextFrame);
    setPreviewIndex(nextFrame);
    setPlaying(false);
  };

  const save = async () => {
    try {
      const updated = committedCreature();
      const now = Date.now();
      if (updated.sourceKind === "remote") {
        const originalId = updated.id;
        updated.id = `local:${now}_${Math.random().toString(36).slice(2, 8)}`;
        updated.sourceKind = "local";
        updated.sourceRef = updated.sourceRef || originalId;
        updated.displayName = `${updated.displayName} (Cópia local)`;
        updated.provenance.parentCreatureId = originalId;
        updated.animations.forEach((item) => { item.locked = false; });
      }
      const versionId = `edit_${now}`;
      updated.versions.push({ versionId, timestamp: now, description: `Edição visual de ${animation?.name || "frame"}`, author: "Usuário" });
      updated.currentVersionId = versionId;
      await LocalStore.saveCreature(updated);
      setLocalCreature(updated);
      onSaved(updated);
      flash("Projeto salvo");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const updateDuration = (duration: number) => {
    if (!Number.isInteger(duration) || duration < 1) return;
    mutateAnimation((target) => {
      target.durations[frameIndex] = duration;
      for (let d = 0; d < target.directions; d += 1) {
        const item = target.framesByDirection[d]?.[frameIndex];
        if (item) item.duration = duration;
      }
    });
  };

  if (!animation) return <div className="p-6 text-amber-200">Nenhuma animação disponível.</div>;

  const toolButton = (id: Tool, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTool(id)} className={`flex min-w-[88px] flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold lg:min-w-0 ${tool === id ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-700 bg-slate-950"}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-slate-200">
      <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(event) => void upload(event)} />
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBackToStudio} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold">← Estúdio</button>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{localCreature.displayName}</div>
            <div className="text-[10px] text-slate-400">{animation.name} · direção {direction} · frame {frameIndex + 1}/{frames.length}</div>
          </div>
        </div>
        <button type="button" onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><Save className="h-4 w-4" /> Salvar projeto</button>
      </header>
      {status && <div className="border-b border-emerald-800 bg-emerald-950 px-4 py-2 text-xs text-emerald-200">{status}</div>}
      {error && <div className="border-b border-rose-800 bg-rose-950 px-4 py-2 text-xs text-rose-200">{error}</div>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900 p-2 lg:order-1 lg:w-24 lg:flex-col lg:border-r lg:border-t-0">
          {toolButton("pencil", "Lápis", <Pencil className="h-4 w-4" />)}
          {toolButton("eraser", "Borracha", <Eraser className="h-4 w-4" />)}
          {toolButton("pipette", "Conta-gotas", <Pipette className="h-4 w-4" />)}
          {toolButton("bucket", "Preencher", <PaintBucket className="h-4 w-4" />)}
          {toolButton("move", "Arrastar", <Move className="h-4 w-4" />)}
          {toolButton("select", "Selecionar", <Layers className="h-4 w-4" />)}
          <button type="button" onClick={undo} disabled={!canUndo} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><Undo2 className="mx-auto h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><Redo2 className="mx-auto h-4 w-4" /></button>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setZoom((value) => Math.max(2, value - 1))} className="rounded border border-slate-700 p-2"><ZoomOut className="h-4 w-4" /></button>
              <span className="font-mono text-xs">{zoom}×</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(32, value + 1))} className="rounded border border-slate-700 p-2"><ZoomIn className="h-4 w-4" /></button>
              <button type="button" onClick={() => setGrid((value) => !value)} className={`rounded border px-2 py-2 text-xs ${grid ? "border-indigo-500 bg-indigo-950" : "border-slate-700"}`}><Grid3X3 className="inline h-4 w-4" /> Grade</button>
              <button type="button" onClick={() => setOnion((value) => !value)} className={`rounded border px-2 py-2 text-xs ${onion ? "border-amber-500 bg-amber-950" : "border-slate-700"}`}><Layers className="inline h-4 w-4" /> Onion</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => chooseUpload("replace")} className="rounded border border-slate-700 px-3 py-2 text-xs"><Upload className="inline h-4 w-4" /> Substituir PNG</button>
              <button type="button" onClick={() => chooseUpload("insert")} className="rounded border border-slate-700 px-3 py-2 text-xs"><ImagePlus className="inline h-4 w-4" /> Inserir PNG</button>
              <button type="button" onClick={() => { if (!canvasRef.current) return; const anchor = document.createElement("a"); anchor.href = canvasRef.current.toDataURL("image/png"); anchor.download = `${localCreature.numericId}-${animation.name}-d${direction}-f${frameIndex}.png`; anchor.click(); }} className="rounded border border-slate-700 px-3 py-2 text-xs"><Download className="inline h-4 w-4" /> Baixar</button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            <div className="relative shrink-0 shadow-2xl" style={{ width: width * zoom, height: height * zoom, backgroundColor: "#1e293b", backgroundImage: "linear-gradient(45deg,#334155 25%,transparent 25%),linear-gradient(-45deg,#334155 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#334155 75%),linear-gradient(-45deg,transparent 75%,#334155 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0px" }}>
              <canvas ref={onionRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-70" style={{ imageRendering: "pixelated" }} />
              <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className="absolute inset-0 h-full w-full touch-none" style={{ imageRendering: "pixelated", cursor: tool === "move" ? "grab" : "crosshair" }} />
              {grid && zoom >= 5 && <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(to right,rgba(148,163,184,.22) 1px,transparent 1px),linear-gradient(to bottom,rgba(148,163,184,.22) 1px,transparent 1px)", backgroundSize: `${zoom}px ${zoom}px` }} />}
              {selection && <div className="pointer-events-none absolute border-2 border-dashed border-cyan-300 bg-cyan-300/10" style={{ left: selection.x * zoom, top: selection.y * zoom, width: selection.width * zoom, height: selection.height * zoom }} />}
            </div>
          </div>

          <section className="shrink-0 border-t border-slate-800 bg-slate-900 p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setPlaying((value) => !value); setPreviewIndex(frameIndex); }} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white ${playing ? "bg-rose-600" : "bg-emerald-600"}`}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Pausar prévia" : "Reproduzir prévia"}</button>
                <canvas ref={previewRef} className="h-12 w-12 rounded border border-slate-700 bg-slate-950" style={{ imageRendering: "pixelated" }} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => addFrame(false)} className="rounded border border-slate-700 px-2 py-2 text-xs"><Plus className="inline h-4 w-4" /> Novo</button>
                <button type="button" onClick={() => addFrame(true)} className="rounded border border-slate-700 px-2 py-2 text-xs"><Copy className="inline h-4 w-4" /> Duplicar</button>
                <button type="button" onClick={deleteFrame} disabled={frames.length <= 1} className="rounded border border-rose-800 px-2 py-2 text-xs text-rose-300 disabled:opacity-30"><Trash2 className="inline h-4 w-4" /> Excluir</button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frames.map((item, index) => (
                <div key={item.id} data-frame-index={index} className={`flex h-20 w-20 shrink-0 flex-col rounded-lg border-2 p-1 ${index === frameIndex ? "border-indigo-400 bg-indigo-950" : dragTo === index ? "border-cyan-400 bg-cyan-950" : "border-slate-700 bg-slate-950"}`}>
                  <button type="button" onClick={() => navigate(animationId, direction, index)} className="min-h-0 flex-1 overflow-hidden"><img src={item.dataUrl} alt={`Frame ${index + 1}`} className="h-full w-full object-contain" style={{ imageRendering: "pixelated" }} /></button>
                  <div className="flex items-center justify-between text-[9px] text-slate-400"><span>F{index + 1}</span><button type="button" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragFrom(index); setDragTo(index); }} onPointerMove={(event) => { if (dragFrom === null) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-frame-index]"); const next = Number(target?.dataset.frameIndex); if (Number.isInteger(next)) setDragTo(next); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (dragFrom !== null && dragTo !== null) reorder(dragFrom, dragTo); setDragFrom(null); setDragTo(null); }} className="touch-none p-1"><GripVertical className="h-3 w-3" /></button></div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="order-3 max-h-[42vh] shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-900 p-3 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Navegação</h3>
              <select value={animation.id} onChange={(event) => navigate(event.target.value, 0, 0)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs">{localCreature.animations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <div className="mt-2 grid grid-cols-4 gap-1">{directions.map((value) => <button type="button" key={value} onClick={() => navigate(animation.id, value, 0)} className={`rounded border px-2 py-2 text-xs ${direction === value ? "border-indigo-400 bg-indigo-600" : "border-slate-700"}`}>{value}</button>)}</div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Frame atual</h3>
              <input type="number" min={1} max={600} value={frame?.duration || 1} onChange={(event) => updateDuration(Number(event.target.value))} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs" />
              <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={copyFrame} className="rounded border border-slate-700 py-2 text-xs"><Copy className="inline h-4 w-4" /> Copiar frame</button><button type="button" onClick={() => void pasteFrame()} disabled={!hasFrameClipboard} className="rounded border border-slate-700 py-2 text-xs disabled:opacity-30">Colar frame</button></div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Cor e pincel</h3>
              <div className="flex gap-2"><input type="color" value={color === TRANSPARENT ? "#000000" : color} onChange={(event) => setColor(event.target.value)} className="h-10 w-14" /><button type="button" onClick={() => setColor(TRANSPARENT)} className="flex-1 rounded border border-slate-700 text-xs">Transparente</button></div>
              <input type="range" min={1} max={4} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="mt-2 w-full" />
              <div className="mt-2 grid grid-cols-8 gap-1">{PALETTE.map((value) => <button type="button" key={value} onClick={() => setColor(value)} className={`aspect-square rounded border ${color.toLowerCase() === value.toLowerCase() ? "border-white ring-2 ring-indigo-400" : "border-slate-700"}`} style={{ backgroundColor: value }} />)}</div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Transformar</h3>
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => transform("flip-x")} className="rounded border border-slate-700 py-2 text-xs"><FlipHorizontal className="inline h-4 w-4" /> Horizontal</button><button type="button" onClick={() => transform("flip-y")} className="rounded border border-slate-700 py-2 text-xs"><FlipVertical className="inline h-4 w-4" /> Vertical</button></div>
              <div className="mt-2 grid grid-cols-3 gap-1"><span /><button type="button" onClick={() => transform("shift", 0, -1)} className="rounded border border-slate-700 py-2"><ArrowUp className="mx-auto h-4 w-4" /></button><span /><button type="button" onClick={() => transform("shift", -1, 0)} className="rounded border border-slate-700 py-2"><ArrowLeft className="mx-auto h-4 w-4" /></button><button type="button" onClick={() => transform("shift", 0, 1)} className="rounded border border-slate-700 py-2"><ArrowDown className="mx-auto h-4 w-4" /></button><button type="button" onClick={() => transform("shift", 1, 0)} className="rounded border border-slate-700 py-2"><ArrowRight className="mx-auto h-4 w-4" /></button></div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Seleção</h3>
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => copySelection(false)} disabled={!selection} className="rounded border border-slate-700 py-2 text-xs disabled:opacity-30"><Copy className="inline h-4 w-4" /> Copiar</button><button type="button" onClick={() => copySelection(true)} disabled={!selection} className="rounded border border-slate-700 py-2 text-xs disabled:opacity-30"><Scissors className="inline h-4 w-4" /> Recortar</button><button type="button" onClick={pasteSelection} disabled={!hasPixelClipboard} className="rounded border border-slate-700 py-2 text-xs disabled:opacity-30">Colar</button><button type="button" onClick={clearSelection} disabled={!selection} className="rounded border border-rose-800 py-2 text-xs text-rose-300 disabled:opacity-30">Apagar</button></div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
};
