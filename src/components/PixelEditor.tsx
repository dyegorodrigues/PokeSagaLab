import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clipboard,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  Eye,
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
  Selection,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Creature, Frame } from "../types";
import { LocalStore } from "../stores/localStore";

type EditorTool =
  | "pencil"
  | "eraser"
  | "pipette"
  | "bucket"
  | "move"
  | "select";

type UploadMode = "replace" | "insert";

interface PixelEditorProps {
  creature: Creature;
  animationId: string;
  frameIndex: number;
  direction: number;
  onSaved: (updatedCreature: Creature) => void;
  onBackToStudio: () => void;
}

interface RectSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PointerGesture {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  source?: ImageData;
}

const TRANSPARENT = "rgba(0,0,0,0)";
const PMD_TICK_MS = 1000 / 60;

const PALETTE = [
  "#000000",
  "#1D2B53",
  "#7E2553",
  "#008751",
  "#AB5236",
  "#5F574F",
  "#C2C3C7",
  "#FFF1E8",
  "#FF004D",
  "#FFA300",
  "#FFEC27",
  "#00E436",
  "#29ADFF",
  "#83769C",
  "#FF77A8",
  "#FFCCAA",
];

const TOOL_DEFINITIONS: Array<{
  id: EditorTool;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "pencil", label: "Lápis", icon: Pencil },
  { id: "eraser", label: "Borracha", icon: Eraser },
  { id: "pipette", label: "Conta-gotas", icon: Pipette },
  { id: "bucket", label: "Preencher", icon: PaintBucket },
  { id: "move", label: "Arrastar desenho", icon: Move },
  { id: "select", label: "Selecionar", icon: Selection },
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

function canvasPoint(
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(canvas.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width)),
    ),
    y: Math.max(
      0,
      Math.min(canvas.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height)),
    ),
  };
}

function normalizeSelection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): RectSelection {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX) + 1,
    height: Math.abs(endY - startY) + 1,
  };
}

function parseHexColor(color: string): [number, number, number, number] {
  if (color === TRANSPARENT) return [0, 0, 0, 0];
  const normalized = color.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  paint: (x: number, y: number) => void,
) {
  let currentX = x0;
  let currentY = y0;
  const deltaX = Math.abs(x1 - x0);
  const stepX = x0 < x1 ? 1 : -1;
  const deltaY = -Math.abs(y1 - y0);
  const stepY = y0 < y1 ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    paint(currentX, currentY);
    if (currentX === x1 && currentY === y1) break;
    const doubled = error * 2;
    if (doubled >= deltaY) {
      error += deltaY;
      currentX += stepX;
    }
    if (doubled <= deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }
}

function fitImageToCell(
  image: HTMLImageElement,
  width: number,
  height: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const drawX = Math.floor((width - drawWidth) / 2);
  const drawY = Math.floor((height - drawHeight) / 2);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
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
  const [localCreature, setLocalCreature] = useState<Creature>(() =>
    cloneCreature(initialCreature),
  );
  const [currentAnimationId, setCurrentAnimationId] = useState(initialAnimationId);
  const [currentDirection, setCurrentDirection] = useState(initialDirection);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(initialFrameIndex);
  const [tool, setTool] = useState<EditorTool>("pencil");
  const [selectedColor, setSelectedColor] = useState("#facc15");
  const [brushSize, setBrushSize] = useState(1);
  const [zoom, setZoom] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const [onionSkin, setOnionSkin] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [previewFrameIndex, setPreviewFrameIndex] = useState(0);
  const [selection, setSelection] = useState<RectSelection | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggedTimelineIndex, setDraggedTimelineIndex] = useState<number | null>(null);
  const [timelineDropIndex, setTimelineDropIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<UploadMode>("replace");
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const gestureRef = useRef<PointerGesture | null>(null);
  const frameClipboardRef = useRef<string | null>(null);
  const pixelClipboardRef = useRef<ImageData | null>(null);

  const animation = useMemo(
    () =>
      localCreature.animations.find((candidate) => candidate.id === currentAnimationId) ||
      localCreature.animations[0],
    [currentAnimationId, localCreature.animations],
  );
  const width = animation?.frameWidth || 32;
  const height = animation?.frameHeight || 32;
  const availableDirections = animation?.directions === 1 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const frames = animation?.framesByDirection[currentDirection] || [];
  const currentFrame = frames[currentFrameIndex] || frames[0];
  const previousFrame =
    frames.length > 1
      ? frames[(currentFrameIndex - 1 + frames.length) % frames.length]
      : undefined;

  const showStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2500);
  };

  const pushHistory = (ctx: CanvasRenderingContext2D) => {
    const state = ctx.getImageData(0, 0, width, height);
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(state);
    if (nextHistory.length > 80) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const creatureWithCanvasCommitted = (source = localCreature): Creature => {
    const canvas = canvasRef.current;
    if (!canvas || !animation) return cloneCreature(source);
    const next = cloneCreature(source);
    const targetAnimation = next.animations.find(
      (candidate) => candidate.id === currentAnimationId,
    );
    const targetFrame = targetAnimation?.framesByDirection[currentDirection]?.[currentFrameIndex];
    if (targetFrame) targetFrame.dataUrl = canvas.toDataURL("image/png");
    return next;
  };

  const updateAnimation = (
    updater: (targetAnimation: NonNullable<typeof animation>) => void,
    commitCanvas = true,
  ) => {
    const base = commitCanvas ? creatureWithCanvasCommitted() : cloneCreature(localCreature);
    const targetAnimation = base.animations.find(
      (candidate) => candidate.id === currentAnimationId,
    );
    if (!targetAnimation) return;
    updater(targetAnimation);
    setLocalCreature(base);
  };

  useEffect(() => {
    if (!animation) return;
    if (!availableDirections.includes(currentDirection)) setCurrentDirection(0);
    if (currentFrameIndex >= frames.length) setCurrentFrameIndex(Math.max(0, frames.length - 1));
  }, [animation, availableDirections, currentDirection, currentFrameIndex, frames.length]);

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

    if (!currentFrame?.dataUrl) {
      pushHistory(ctx);
      return;
    }

    void loadImage(currentFrame.dataUrl)
      .then((image) => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        pushHistory(ctx);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : String(error));
        pushHistory(ctx);
      });
  }, [currentAnimationId, currentDirection, currentFrameIndex, currentFrame?.dataUrl, height, width]);

  useEffect(() => {
    const canvas = onionCanvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    if (!onionSkin || !previousFrame?.dataUrl) return;

    void loadImage(previousFrame.dataUrl).then((image) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalAlpha = 1;
    });
  }, [height, onionSkin, previousFrame?.dataUrl, width]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const frame = frames[previewFrameIndex] || frames[0];
    const timer = window.setTimeout(
      () => setPreviewFrameIndex((index) => (index + 1) % frames.length),
      Math.max(16, (frame.duration || 1) * PMD_TICK_MS),
    );
    return () => window.clearTimeout(timer);
  }, [frames, playing, previewFrameIndex]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const frame = frames[previewFrameIndex] || frames[0];
    ctx.clearRect(0, 0, width, height);
    if (!frame?.dataUrl) return;
    void loadImage(frame.dataUrl).then((image) => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
    });
  }, [frames, height, previewFrameIndex, width]);

  const paintPixel = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const half = Math.floor(brushSize / 2);
    const drawX = x - half;
    const drawY = y - half;
    if (tool === "eraser" || selectedColor === TRANSPARENT) {
      ctx.clearRect(drawX, drawY, brushSize, brushSize);
    } else {
      ctx.fillStyle = selectedColor;
      ctx.fillRect(drawX, drawY, brushSize, brushSize);
    }
  };

  const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const targetIndex = (startY * width + startX) * 4;
    const target = [
      data[targetIndex],
      data[targetIndex + 1],
      data[targetIndex + 2],
      data[targetIndex + 3],
    ];
    const fill = parseHexColor(selectedColor);
    if (target.every((value, index) => value === fill[index])) return;

    const stack: Array<[number, number]> = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const index = (y * width + x) * 4;
      if (
        data[index] !== target[0] ||
        data[index + 1] !== target[1] ||
        data[index + 2] !== target[2] ||
        data[index + 3] !== target[3]
      ) {
        continue;
      }
      data[index] = fill[0];
      data[index + 1] = fill[1];
      data[index + 2] = fill[2];
      data[index + 3] = fill[3];
      if (x > 0) stack.push([x - 1, y]);
      if (x < width - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < height - 1) stack.push([x, y + 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event, canvas);
    gestureRef.current = {
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      source:
        tool === "move" ? ctx.getImageData(0, 0, width, height) : undefined,
    };

    if (tool === "pencil" || tool === "eraser") {
      paintPixel(ctx, point.x, point.y);
    } else if (tool === "pipette") {
      const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
      if (pixel[3] === 0) {
        setSelectedColor(TRANSPARENT);
      } else {
        const color = `#${[pixel[0], pixel[1], pixel[2]]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("")}`;
        setSelectedColor(color);
      }
      setTool("pencil");
    } else if (tool === "bucket") {
      floodFill(ctx, point.x, point.y);
      pushHistory(ctx);
    } else if (tool === "select") {
      setSelection({ x: point.x, y: point.y, width: 1, height: 1 });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const gesture = gestureRef.current;
    if (!canvas || !ctx || !gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const point = canvasPoint(event, canvas);

    if (tool === "pencil" || tool === "eraser") {
      drawLine(ctx, gesture.lastX, gesture.lastY, point.x, point.y, (x, y) =>
        paintPixel(ctx, x, y),
      );
    } else if (tool === "move" && gesture.source) {
      const deltaX = point.x - gesture.startX;
      const deltaY = point.y - gesture.startY;
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      sourceCanvas.getContext("2d")?.putImageData(gesture.source, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sourceCanvas, deltaX, deltaY);
    } else if (tool === "select") {
      setSelection(normalizeSelection(gesture.startX, gesture.startY, point.x, point.y));
    }

    gesture.lastX = point.x;
    gesture.lastY = point.y;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const gesture = gestureRef.current;
    if (!canvas || !ctx || !gesture) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (tool === "pencil" || tool === "eraser" || tool === "move") pushHistory(ctx);
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

  const transformCanvas = (kind: "flip-x" | "flip-y" | "nudge", x = 0, y = 0) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    source.getContext("2d")?.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (kind === "flip-x") {
      ctx.scale(-1, 1);
      ctx.drawImage(source, -width, 0);
    } else if (kind === "flip-y") {
      ctx.scale(1, -1);
      ctx.drawImage(source, 0, -height);
    } else {
      ctx.drawImage(source, x, y);
    }
    ctx.restore();
    pushHistory(ctx);
  };

  const clearSelectionPixels = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !selection) return;
    ctx.clearRect(selection.x, selection.y, selection.width, selection.height);
    pushHistory(ctx);
  };

  const copySelection = (cut = false) => {
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx || !selection) return;
    pixelClipboardRef.current = ctx.getImageData(
      selection.x,
      selection.y,
      selection.width,
      selection.height,
    );
    if (cut) clearSelectionPixels();
    showStatus(cut ? "Seleção recortada" : "Seleção copiada");
  };

  const pasteSelection = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const pixels = pixelClipboardRef.current;
    if (!ctx || !pixels) return;
    const x = selection?.x ?? Math.max(0, Math.floor((width - pixels.width) / 2));
    const y = selection?.y ?? Math.max(0, Math.floor((height - pixels.height) / 2));
    ctx.putImageData(pixels, x, y);
    setSelection({ x, y, width: pixels.width, height: pixels.height });
    pushHistory(ctx);
    showStatus("Seleção colada");
  };

  const copyFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    frameClipboardRef.current = canvas.toDataURL("image/png");
    showStatus("Frame copiado");
  };

  const pasteFrame = async () => {
    const source = frameClipboardRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!source || !canvas || !ctx) return;
    const image = await loadImage(source);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    pushHistory(ctx);
    showStatus("Frame colado");
  };

  const addFrame = (duplicate: boolean) => {
    if (!animation) return;
    const sourceCreature = creatureWithCanvasCommitted();
    const targetAnimation = sourceCreature.animations.find(
      (candidate) => candidate.id === currentAnimationId,
    );
    if (!targetAnimation) return;
    const insertIndex = currentFrameIndex + 1;
    const nextDuration = targetAnimation.durations[currentFrameIndex] || 6;
    targetAnimation.durations.splice(insertIndex, 0, nextDuration);

    for (let directionIndex = 0; directionIndex < targetAnimation.directions; directionIndex += 1) {
      const directionFrames = targetAnimation.framesByDirection[directionIndex] || [];
      const sourceFrame = directionFrames[currentFrameIndex];
      const id = `${targetAnimation.id}_d${directionIndex}_f${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const nextFrame: Frame = duplicate && sourceFrame
        ? {
            ...sourceFrame,
            id,
            animationId: targetAnimation.id,
            direction: directionIndex,
            frameIndex: insertIndex,
            origin: { ...sourceFrame.origin },
            shadowOrigin: sourceFrame.shadowOrigin
              ? { ...sourceFrame.shadowOrigin }
              : undefined,
          }
        : {
            id,
            animationId: targetAnimation.id,
            direction: directionIndex,
            frameIndex: insertIndex,
            dataUrl: blankDataUrl(targetAnimation.frameWidth, targetAnimation.frameHeight),
            duration: nextDuration,
            origin: {
              x: Math.floor(targetAnimation.frameWidth / 2),
              y: Math.floor(targetAnimation.frameHeight / 2),
            },
          };
      directionFrames.splice(insertIndex, 0, nextFrame);
      directionFrames.forEach((frame, index) => {
        frame.frameIndex = index;
        frame.duration = targetAnimation.durations[index] || frame.duration || 6;
      });
      targetAnimation.framesByDirection[directionIndex] = directionFrames;
    }

    setLocalCreature(sourceCreature);
    setCurrentFrameIndex(insertIndex);
    setPreviewFrameIndex(insertIndex);
    setPlaying(false);
    showStatus(duplicate ? "Frame duplicado" : "Frame vazio adicionado");
  };

  const deleteFrame = () => {
    if (!animation || frames.length <= 1) return;
    updateAnimation((targetAnimation) => {
      targetAnimation.durations.splice(currentFrameIndex, 1);
      for (let directionIndex = 0; directionIndex < targetAnimation.directions; directionIndex += 1) {
        const directionFrames = targetAnimation.framesByDirection[directionIndex] || [];
        directionFrames.splice(currentFrameIndex, 1);
        directionFrames.forEach((frame, index) => {
          frame.frameIndex = index;
          frame.duration = targetAnimation.durations[index] || frame.duration || 6;
        });
      }
    });
    setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1));
    setPlaying(false);
    showStatus("Frame removido");
  };

  const reorderFrames = (from: number, to: number) => {
    if (!animation || from === to || to < 0 || to >= frames.length) return;
    updateAnimation((targetAnimation) => {
      const [duration] = targetAnimation.durations.splice(from, 1);
      targetAnimation.durations.splice(to, 0, duration);
      for (let directionIndex = 0; directionIndex < targetAnimation.directions; directionIndex += 1) {
        const directionFrames = targetAnimation.framesByDirection[directionIndex] || [];
        const [frame] = directionFrames.splice(from, 1);
        if (frame) directionFrames.splice(to, 0, frame);
        directionFrames.forEach((item, index) => {
          item.frameIndex = index;
          item.duration = targetAnimation.durations[index] || item.duration || 6;
        });
      }
    });
    setCurrentFrameIndex(to);
    setPlaying(false);
    showStatus("Frame reposicionado");
  };

  const handleTimelinePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (draggedTimelineIndex === null) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-frame-index]");
    if (!target) return;
    const index = Number(target.dataset.frameIndex);
    if (Number.isInteger(index)) setTimelineDropIndex(index);
  };

  const finishTimelineDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (
      draggedTimelineIndex !== null &&
      timelineDropIndex !== null &&
      draggedTimelineIndex !== timelineDropIndex
    ) {
      reorderFrames(draggedTimelineIndex, timelineDropIndex);
    }
    setDraggedTimelineIndex(null);
    setTimelineDropIndex(null);
  };

  const chooseUpload = (mode: UploadMode) => {
    uploadModeRef.current = mode;
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const image = await loadImage(dataUrl);
      const fittedDataUrl = fitImageToCell(image, width, height);

      if (uploadModeRef.current === "replace") {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const fitted = await loadImage(fittedDataUrl);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(fitted, 0, 0, width, height);
        pushHistory(ctx);
        showStatus("PNG aplicado ao frame atual");
      } else {
        addFrame(false);
        window.setTimeout(() => {
          setLocalCreature((previous) => {
            const next = cloneCreature(previous);
            const targetAnimation = next.animations.find(
              (candidate) => candidate.id === currentAnimationId,
            );
            const targetFrame =
              targetAnimation?.framesByDirection[currentDirection]?.[currentFrameIndex + 1];
            if (targetFrame) targetFrame.dataUrl = fittedDataUrl;
            return next;
          });
        }, 0);
        showStatus("PNG inserido como novo frame");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const updateDuration = (duration: number) => {
    if (!Number.isInteger(duration) || duration < 1 || !animation) return;
    updateAnimation((targetAnimation) => {
      targetAnimation.durations[currentFrameIndex] = duration;
      for (let directionIndex = 0; directionIndex < targetAnimation.directions; directionIndex += 1) {
        const frame = targetAnimation.framesByDirection[directionIndex]?.[currentFrameIndex];
        if (frame) frame.duration = duration;
      }
    });
  };

  const navigateTo = (nextAnimationId: string, nextDirection: number, nextFrameIndex: number) => {
    setLocalCreature(creatureWithCanvasCommitted());
    setCurrentAnimationId(nextAnimationId);
    setCurrentDirection(nextDirection);
    setCurrentFrameIndex(nextFrameIndex);
    setPreviewFrameIndex(nextFrameIndex);
    setPlaying(false);
  };

  const saveProject = async () => {
    try {
      const updated = creatureWithCanvasCommitted();
      const now = Date.now();
      if (updated.sourceKind === "remote") {
        const oldId = updated.id;
        updated.id = `local:${now}_${Math.random().toString(36).slice(2, 8)}`;
        updated.sourceKind = "local";
        updated.sourceRef = updated.sourceRef || oldId;
        updated.displayName = updated.displayName.includes("Cópia local")
          ? updated.displayName
          : `${updated.displayName} (Cópia local)`;
        updated.provenance.parentCreatureId = oldId;
        for (const targetAnimation of updated.animations) targetAnimation.locked = false;
      }
      const versionId = `edit_${now}`;
      updated.versions.push({
        versionId,
        timestamp: now,
        description: `Edição visual de ${animation?.name || "frame"}`,
        author: "Usuário",
      });
      updated.currentVersionId = versionId;
      await LocalStore.saveCreature(updated);
      setLocalCreature(updated);
      onSaved(updated);
      showStatus("Projeto salvo no dispositivo");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const exportFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas || !animation) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `${localCreature.numericId}-${animation.name}-d${currentDirection}-f${currentFrameIndex}.png`;
    anchor.click();
  };

  if (!animation) {
    return (
      <div className="p-6 text-amber-200">Nenhuma animação disponível para edição.</div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-slate-200">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(event) => void handleUpload(event)}
      />

      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLocalCreature(creatureWithCanvasCommitted());
              onBackToStudio();
            }}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
          >
            ← Estúdio
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">
              {localCreature.displayName}
            </div>
            <div className="truncate text-[10px] text-slate-400">
              {animation.name} · direção {currentDirection} · frame {currentFrameIndex + 1}/
              {frames.length}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusMessage && (
            <span className="hidden text-xs text-emerald-300 sm:inline">{statusMessage}</span>
          )}
          <button
            type="button"
            onClick={() => void saveProject()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
          >
            <Save className="h-4 w-4" /> Salvar projeto
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="shrink-0 border-b border-rose-800 bg-rose-950 px-4 py-2 text-xs text-rose-200">
          {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-3 underline"
          >
            fechar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900 p-2 lg:order-1 lg:w-24 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-t-0">
          {TOOL_DEFINITIONS.map((definition) => {
            const Icon = definition.icon;
            return (
              <button
                type="button"
                key={definition.id}
                onClick={() => setTool(definition.id)}
                className={`flex min-w-[88px] flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold lg:min-w-0 ${
                  tool === definition.id
                    ? "border-indigo-400 bg-indigo-600 text-white"
                    : "border-slate-700 bg-slate-950 text-slate-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {definition.label}
              </button>
            );
          })}
          <div className="hidden h-px bg-slate-700 lg:block" />
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="flex min-w-[72px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs disabled:opacity-30 lg:min-w-0"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="flex min-w-[72px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs disabled:opacity-30 lg:min-w-0"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col bg-slate-950 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(2, value - 1))}
                className="rounded border border-slate-700 p-2"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-12 text-center font-mono text-xs">{zoom}×</span>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(32, value + 1))}
                className="rounded border border-slate-700 p-2"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((value) => !value)}
                className={`flex items-center gap-1 rounded border px-2 py-2 text-xs ${
                  showGrid ? "border-indigo-500 bg-indigo-950" : "border-slate-700"
                }`}
              >
                <Grid3X3 className="h-4 w-4" /> Grade
              </button>
              <button
                type="button"
                onClick={() => setOnionSkin((value) => !value)}
                className={`flex items-center gap-1 rounded border px-2 py-2 text-xs ${
                  onionSkin ? "border-amber-500 bg-amber-950" : "border-slate-700"
                }`}
              >
                <Layers className="h-4 w-4" /> Onion
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => chooseUpload("replace")}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
              >
                <Upload className="h-4 w-4" /> Substituir por PNG
              </button>
              <button
                type="button"
                onClick={() => chooseUpload("insert")}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
              >
                <ImagePlus className="h-4 w-4" /> Inserir PNG
              </button>
              <button
                type="button"
                onClick={exportFrame}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
              >
                <Download className="h-4 w-4" /> Baixar frame
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            <div
              className="relative shrink-0 shadow-2xl"
              style={{
                width: width * zoom,
                height: height * zoom,
                backgroundColor: "#1e293b",
                backgroundImage:
                  "linear-gradient(45deg,#334155 25%,transparent 25%),linear-gradient(-45deg,#334155 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#334155 75%),linear-gradient(-45deg,transparent 75%,#334155 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0px",
              }}
            >
              <canvas
                ref={onionCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
                style={{ imageRendering: "pixelated" }}
              />
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ imageRendering: "pixelated", cursor: tool === "move" ? "grab" : "crosshair" }}
              />
              {showGrid && zoom >= 5 && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right,rgba(148,163,184,.22) 1px,transparent 1px),linear-gradient(to bottom,rgba(148,163,184,.22) 1px,transparent 1px)",
                    backgroundSize: `${zoom}px ${zoom}px`,
                  }}
                />
              )}
              {selection && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-cyan-300 bg-cyan-300/10"
                  style={{
                    left: selection.x * zoom,
                    top: selection.y * zoom,
                    width: selection.width * zoom,
                    height: selection.height * zoom,
                  }}
                />
              )}
            </div>
          </div>

          <section className="shrink-0 border-t border-slate-800 bg-slate-900 p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying((value) => !value);
                    setPreviewFrameIndex(currentFrameIndex);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold ${
                    playing ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
                  }`}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {playing ? "Pausar prévia" : "Reproduzir prévia"}
                </button>
                <div className="flex h-12 w-12 items-center justify-center rounded border border-slate-700 bg-slate-950">
                  <canvas
                    ref={previewCanvasRef}
                    className="h-10 w-10"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => addFrame(false)}
                  className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs"
                >
                  <Plus className="h-4 w-4" /> Novo
                </button>
                <button
                  type="button"
                  onClick={() => addFrame(true)}
                  className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs"
                >
                  <Copy className="h-4 w-4" /> Duplicar
                </button>
                <button
                  type="button"
                  onClick={deleteFrame}
                  disabled={frames.length <= 1}
                  className="flex items-center gap-1 rounded border border-rose-800 px-2 py-2 text-xs text-rose-300 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {frames.map((frame, index) => (
                <div
                  key={frame.id}
                  data-frame-index={index}
                  className={`relative flex h-20 w-20 shrink-0 flex-col rounded-lg border-2 p-1 ${
                    index === currentFrameIndex
                      ? "border-indigo-400 bg-indigo-950/50"
                      : timelineDropIndex === index
                        ? "border-cyan-400 bg-cyan-950/50"
                        : "border-slate-700 bg-slate-950"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo(currentAnimationId, currentDirection, index)
                    }
                    className="min-h-0 flex-1 overflow-hidden"
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Frame ${index + 1}`}
                      className="h-full w-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </button>
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>F{index + 1}</span>
                    <button
                      type="button"
                      aria-label={`Arrastar frame ${index + 1}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDraggedTimelineIndex(index);
                        setTimelineDropIndex(index);
                      }}
                      onPointerMove={handleTimelinePointerMove}
                      onPointerUp={finishTimelineDrag}
                      onPointerCancel={finishTimelineDrag}
                      className="touch-none rounded p-1 text-slate-300"
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="order-3 max-h-[42vh] shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-900 p-3 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Navegação
              </h3>
              <label className="block text-[11px] text-slate-400">
                Animação
                <select
                  value={animation.id}
                  onChange={(event) => navigateTo(event.target.value, 0, 0)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                >
                  {localCreature.animations.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {availableDirections.map((directionIndex) => (
                  <button
                    type="button"
                    key={directionIndex}
                    onClick={() => navigateTo(animation.id, directionIndex, 0)}
                    className={`rounded border px-2 py-2 text-xs ${
                      currentDirection === directionIndex
                        ? "border-indigo-400 bg-indigo-600"
                        : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    {directionIndex}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Frame atual
              </h3>
              <label className="block text-[11px] text-slate-400">
                Duração em ticks de 1/60 s
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={currentFrame?.duration || 1}
                  onChange={(event) => updateDuration(Number(event.target.value))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copyFrame}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs"
                >
                  <Clipboard className="h-4 w-4" /> Copiar
                </button>
                <button
                  type="button"
                  onClick={() => void pasteFrame()}
                  disabled={!frameClipboardRef.current}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs disabled:opacity-30"
                >
                  <ClipboardPaste className="h-4 w-4" /> Colar
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Cor e pincel
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedColor === TRANSPARENT ? "#000000" : selectedColor}
                  onChange={(event) => setSelectedColor(event.target.value)}
                  className="h-10 w-14 rounded border border-slate-700 bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setSelectedColor(TRANSPARENT)}
                  className={`flex-1 rounded border px-2 py-2 text-xs ${
                    selectedColor === TRANSPARENT
                      ? "border-indigo-400 bg-indigo-950"
                      : "border-slate-700"
                  }`}
                >
                  Transparente
                </button>
              </div>
              <label className="mt-2 block text-[11px] text-slate-400">
                Pincel {brushSize} px
                <input
                  type="range"
                  min={1}
                  max={4}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <div className="mt-2 grid grid-cols-8 gap-1">
                {PALETTE.map((color) => (
                  <button
                    type="button"
                    key={color}
                    title={color}
                    onClick={() => setSelectedColor(color)}
                    className={`aspect-square rounded border ${
                      selectedColor.toLowerCase() === color.toLowerCase()
                        ? "border-white ring-2 ring-indigo-400"
                        : "border-slate-700"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Transformar desenho
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => transformCanvas("flip-x")}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs"
                >
                  <FlipHorizontal className="h-4 w-4" /> Espelhar H
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas("flip-y")}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs"
                >
                  <FlipVertical className="h-4 w-4" /> Espelhar V
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <span />
                <button
                  type="button"
                  onClick={() => transformCanvas("nudge", 0, -1)}
                  className="rounded border border-slate-700 py-2"
                >
                  <ArrowUp className="mx-auto h-4 w-4" />
                </button>
                <span />
                <button
                  type="button"
                  onClick={() => transformCanvas("nudge", -1, 0)}
                  className="rounded border border-slate-700 py-2"
                >
                  <ArrowLeft className="mx-auto h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas("nudge", 0, 1)}
                  className="rounded border border-slate-700 py-2"
                >
                  <ArrowDown className="mx-auto h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas("nudge", 1, 0)}
                  className="rounded border border-slate-700 py-2"
                >
                  <ArrowRight className="mx-auto h-4 w-4" />
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Seleção
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copySelection(false)}
                  disabled={!selection}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs disabled:opacity-30"
                >
                  <Copy className="h-4 w-4" /> Copiar
                </button>
                <button
                  type="button"
                  onClick={() => copySelection(true)}
                  disabled={!selection}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs disabled:opacity-30"
                >
                  <Scissors className="h-4 w-4" /> Recortar
                </button>
                <button
                  type="button"
                  onClick={pasteSelection}
                  disabled={!pixelClipboardRef.current}
                  className="flex items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs disabled:opacity-30"
                >
                  <ClipboardPaste className="h-4 w-4" /> Colar
                </button>
                <button
                  type="button"
                  onClick={clearSelectionPixels}
                  disabled={!selection}
                  className="flex items-center justify-center gap-1 rounded border border-rose-800 py-2 text-xs text-rose-300 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" /> Apagar
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-slate-700 py-2 text-xs"
              >
                <Eye className="h-4 w-4" /> Limpar seleção
              </button>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
};
