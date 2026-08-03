import React, { useState, useEffect, useRef } from "react";
import { Creature, Frame } from "../types";
import { LocalStore } from "../stores/localStore";
import {
  Pencil,
  Eraser,
  Pipette,
  PaintBucket,
  RotateCcw,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
  FlipHorizontal,
  FlipVertical,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

interface PixelEditorProps {
  creature: Creature;
  animationId: string;
  frameIndex: number;
  direction: number;
  onSaved: (updatedCreature: Creature) => void;
  onBackToStudio: () => void;
}

export const PixelEditor: React.FC<PixelEditorProps> = ({
  creature,
  animationId,
  frameIndex,
  direction,
  onSaved,
  onBackToStudio,
}) => {
  const [tool, setTool] = useState<"pencil" | "eraser" | "pipette" | "bucket">("pencil");
  const [selectedColor, setSelectedColor] = useState("#facc15"); // Pikachu Yellow default
  const [zoom, setZoom] = useState(12);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef<number>(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const anim = creature.animations.find((a) => a.id === animationId) || creature.animations[0];
  const width = anim?.frameWidth || 32;
  const height = anim?.frameHeight || 32;
  const targetFrame: Frame | undefined = anim?.framesByDirection?.[direction]?.[frameIndex];

  // Palette Presets
  const palette = [
    "#000000",
    "#ffffff",
    "#facc15", // Yellow
    "#eab308",
    "#ca8a04",
    "#ef4444", // Red
    "#b91c1c",
    "#3b82f6", // Blue
    "#1d4ed8",
    "#10b981", // Green
    "#047857",
    "#8b5cf6", // Purple
    "#f97316", // Orange
    "#78350f", // Brown
  ];

  const pushState = (ctx: CanvasRenderingContext2D) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const newHist = historyRef.current.slice(0, historyIdxRef.current + 1);
    newHist.push(imgData);
    historyRef.current = newHist;
    historyIdxRef.current = newHist.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  };

  // Load target frame onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    historyRef.current = [];
    historyIdxRef.current = -1;

    if (targetFrame?.dataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        pushState(ctx);
      };
      img.src = targetFrame.dataUrl;
    } else {
      pushState(ctx);
    }
  }, [animationId, frameIndex, direction, targetFrame]);

  const handleUndo = () => {
    if (historyIdxRef.current > 0) {
      historyIdxRef.current -= 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const imgData = historyRef.current[historyIdxRef.current];
      if (ctx && imgData) {
        ctx.putImageData(imgData, 0, 0);
      }
      setCanUndo(historyIdxRef.current > 0);
      setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
    }
  };

  const handleRedo = () => {
    if (historyIdxRef.current < historyRef.current.length - 1) {
      historyIdxRef.current += 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const imgData = historyRef.current[historyIdxRef.current];
      if (ctx && imgData) {
        ctx.putImageData(imgData, 0, 0);
      }
      setCanUndo(historyIdxRef.current > 0);
      setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
    }
  };

  const handleFlip = (horizontal: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (horizontal) {
      ctx.scale(-1, 1);
      ctx.drawImage(tempCanvas, -width, 0);
    } else {
      ctx.scale(1, -1);
      ctx.drawImage(tempCanvas, 0, -height);
    }
    ctx.restore();
    pushState(ctx);
  };

  const handleShift = (dx: number, dy: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, dx, dy);
    pushState(ctx);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    drawPixel(e);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing) drawPixel(e);
  };

  const handleCanvasPointerUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) pushState(ctx);
    }
  };

  const drawPixel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / width));
    const y = Math.floor((e.clientY - rect.top) / (rect.height / height));

    if (x < 0 || x >= width || y < 0 || y >= height) return;

    if (tool === "pencil") {
      ctx.fillStyle = selectedColor;
      ctx.fillRect(x, y, 1, 1);
    } else if (tool === "eraser") {
      ctx.clearRect(x, y, 1, 1);
    } else if (tool === "pipette") {
      const imgData = ctx.getImageData(x, y, 1, 1).data;
      if (imgData[3] > 0) {
        const hex = `#${((1 << 24) + (imgData[0] << 16) + (imgData[1] << 8) + imgData[2]).toString(16).slice(1)}`;
        setSelectedColor(hex);
        setTool("pencil");
      }
    } else if (tool === "bucket") {
      ctx.fillStyle = selectedColor;
      ctx.fillRect(0, 0, width, height); // Fill frame canvas
    }
  };

  const handleSaveFrame = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newDataUrl = canvas.toDataURL("image/png");

    // Deep clone creature and update target frame
    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === animationId);
    if (targetAnim && targetAnim.framesByDirection[direction]?.[frameIndex]) {
      targetAnim.framesByDirection[direction][frameIndex].dataUrl = newDataUrl;
    }

    // Convert creature to local source if remote
    if (updatedCreature.sourceKind === "remote") {
      updatedCreature.sourceKind = "local";
      updatedCreature.id = `local:${Date.now()}`;
      updatedCreature.displayName += " (Editado)";
    }

    await LocalStore.saveCreature(updatedCreature);
    setStatusMessage("Frame salvo com sucesso no IndexedDB local!");
    setTimeout(() => setStatusMessage(null), 3000);
    onSaved(updatedCreature);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-400" />
            Editor de Pixel Art & Canvas
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Animação: <strong className="text-slate-200">{anim?.name}</strong> • Direção:{" "}
            <strong className="text-slate-200">{direction}</strong> • Frame:{" "}
            <strong className="text-slate-200">{frameIndex + 1}</strong> ({width}x{height}px)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBackToStudio}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            Voltar ao Estúdio
          </button>

          <button
            onClick={handleSaveFrame}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar no IndexedDB</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-900/40 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-medium">
          {statusMessage}
        </div>
      )}

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tools Palette Toolbar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">Ferramentas de Desenho</h3>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "pencil", label: "Lápis", icon: Pencil },
                { id: "eraser", label: "Borracha", icon: Eraser },
                { id: "pipette", label: "Conta-gotas", icon: Pipette },
                { id: "bucket", label: "Balde Fill", icon: PaintBucket },
              ].map((t) => {
                const Icon = t.icon;
                const isActive = tool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id as any)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-500 shadow"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-medium block">Histórico & Transformação</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="flex-1 flex items-center justify-center gap-1 p-2 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs disabled:opacity-40 cursor-pointer transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>

                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="flex-1 flex items-center justify-center gap-1 p-2 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs disabled:opacity-40 cursor-pointer transition"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Redo</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleFlip(true)}
                  className="flex-1 flex items-center justify-center gap-1 p-1.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[11px] cursor-pointer transition"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Espelhar H</span>
                </button>

                <button
                  onClick={() => handleFlip(false)}
                  className="flex-1 flex items-center justify-center gap-1 p-1.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[11px] cursor-pointer transition"
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>Espelhar V</span>
                </button>
              </div>

              <div className="pt-2">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">Mover Canvas (Pixels)</span>
                <div className="grid grid-cols-3 gap-1">
                  <div />
                  <button onClick={() => handleShift(0, -1)} className="flex items-center justify-center p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded text-slate-300 cursor-pointer">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <div />
                  <button onClick={() => handleShift(-1, 0)} className="flex items-center justify-center p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded text-slate-300 cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center justify-center text-slate-500">
                    <Move className="w-3.5 h-3.5" />
                  </div>
                  <button onClick={() => handleShift(1, 0)} className="flex items-center justify-center p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded text-slate-300 cursor-pointer">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <div />
                  <button onClick={() => handleShift(0, 1)} className="flex items-center justify-center p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded text-slate-300 cursor-pointer">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <div />
                </div>
              </div>
            </div>

            {/* Color Palette */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Paleta de Cores</span>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {palette.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className={`w-full aspect-square rounded border cursor-pointer transition ${
                      selectedColor.toLowerCase() === c.toLowerCase()
                        ? "ring-2 ring-indigo-500 border-white scale-110"
                        : "border-slate-700"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center Canvas Workspace */}
        <div className="lg:col-span-9 bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col items-center justify-center shadow-xl relative min-h-[420px]">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setZoom((z) => Math.max(4, z - 2))}
              className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-300">{zoom}x Zoom</span>
            <button
              onClick={() => setZoom((z) => Math.min(24, z + 2))}
              className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div
            className="border-2 border-indigo-500/50 shadow-2xl rounded bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px] bg-slate-950 overflow-hidden cursor-crosshair"
            style={{ width: width * zoom, height: height * zoom }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              className="image-pixelated touch-none"
              style={{ width: width * zoom, height: height * zoom }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
