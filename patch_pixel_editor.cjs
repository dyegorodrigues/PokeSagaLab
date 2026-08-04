const fs = require('fs');

const code = `import React, { useState, useEffect, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
  Layers
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
  creature: initialCreature,
  animationId: initialAnimId,
  frameIndex: initialFrameIndex,
  direction: initialDirection,
  onSaved,
  onBackToStudio,
}) => {
  const [localCreature, setLocalCreature] = useState<Creature>(JSON.parse(JSON.stringify(initialCreature)));
  const [currentAnimId, setCurrentAnimId] = useState(initialAnimId);
  const [currentDir, setCurrentDir] = useState(initialDirection);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(initialFrameIndex);

  const [tool, setTool] = useState<"pencil" | "eraser" | "pipette" | "bucket">("pencil");
  const [selectedColor, setSelectedColor] = useState("#facc15"); // Pikachu Yellow default
  const [zoom, setZoom] = useState(12);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  const [onionSkin, setOnionSkin] = useState<boolean>(true);

  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef<number>(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);

  const anim = localCreature.animations.find((a) => a.id === currentAnimId) || localCreature.animations[0];
  const width = anim?.frameWidth || 32;
  const height = anim?.frameHeight || 32;
  const targetFrame: Frame | undefined = anim?.framesByDirection?.[currentDir]?.[currentFrameIdx];
  const prevFrame: Frame | undefined = anim?.framesByDirection?.[currentDir]?.[currentFrameIdx - 1];

  // Palette Presets
  const palette = [
    "#000000", "#ffffff", "#facc15", "#eab308", "#ca8a04", "#ef4444", "#b91c1c",
    "#3b82f6", "#1d4ed8", "#10b981", "#047857", "#8b5cf6", "#f97316", "#78350f",
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

  // Commit current canvas to localCreature state BEFORE switching frames
  const commitCurrentFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const newDataUrl = canvas.toDataURL("image/png");
    
    setLocalCreature((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as Creature;
      const targetAnim = next.animations.find((a) => a.id === currentAnimId);
      if (targetAnim && targetAnim.framesByDirection[currentDir]?.[currentFrameIdx]) {
        targetAnim.framesByDirection[currentDir][currentFrameIdx].dataUrl = newDataUrl;
      }
      return next;
    });
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
  }, [currentAnimId, currentFrameIdx, currentDir, targetFrame, width, height]);

  // Load Onion Skin
  useEffect(() => {
    const oCanvas = onionCanvasRef.current;
    if (!oCanvas) return;
    oCanvas.width = width;
    oCanvas.height = height;
    const ctx = oCanvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, width, height);
    if (onionSkin && prevFrame && prevFrame.dataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.35; // Translucent
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      };
      img.src = prevFrame.dataUrl;
    }
  }, [currentAnimId, currentFrameIdx, currentDir, prevFrame, onionSkin, width, height]);

  const handleUndo = () => {
    if (historyIdxRef.current > 0) {
      historyIdxRef.current -= 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const imgData = historyRef.current[historyIdxRef.current];
      if (ctx && imgData) {
        ctx.putImageData(imgData, 0, 0);
        setCanUndo(historyIdxRef.current > 0);
        setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
      }
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
        setCanUndo(historyIdxRef.current > 0);
        setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
      }
    }
  };

  const handleFlip = (horizontal: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

  const handleNudge = (dx: number, dy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
        const hex = \`#\${((1 << 24) + (imgData[0] << 16) + (imgData[1] << 8) + imgData[2]).toString(16).slice(1)}\`;
        setSelectedColor(hex);
        setTool("pencil");
      }
    } else if (tool === "bucket") {
      ctx.fillStyle = selectedColor;
      ctx.fillRect(0, 0, width, height); // Fill frame canvas
    }
  };

  const handleSaveToDb = async () => {
    commitCurrentFrame(); // ensure latest drawing is in localCreature
    
    // We must use the updated localCreature
    const canvas = canvasRef.current;
    const newDataUrl = canvas ? canvas.toDataURL("image/png") : targetFrame?.dataUrl;

    const updatedCreature = JSON.parse(JSON.stringify(localCreature)) as Creature;
    const targetAnim = updatedCreature.animations.find((a) => a.id === currentAnimId);
    if (targetAnim && targetAnim.framesByDirection[currentDir]?.[currentFrameIdx] && newDataUrl) {
      targetAnim.framesByDirection[currentDir][currentFrameIdx].dataUrl = newDataUrl;
    }

    if (updatedCreature.sourceKind === "remote") {
      updatedCreature.sourceKind = "local";
      updatedCreature.id = \`local:\${Date.now()}\`;
      if (!updatedCreature.displayName.includes("Editado")) {
        updatedCreature.displayName += " (Editado)";
      }
    }

    await LocalStore.saveCreature(updatedCreature);
    setStatusMessage("Salvo no IndexedDB local com sucesso!");
    setTimeout(() => setStatusMessage(null), 3000);
    setLocalCreature(updatedCreature);
    onSaved(updatedCreature);
  };

  const navPrevFrame = () => {
    if (currentFrameIdx > 0) {
      commitCurrentFrame();
      setCurrentFrameIdx(currentFrameIdx - 1);
    }
  };

  const navNextFrame = () => {
    const maxFrames = anim.framesByDirection[currentDir]?.length || 1;
    if (currentFrameIdx < maxFrames - 1) {
      commitCurrentFrame();
      setCurrentFrameIdx(currentFrameIdx + 1);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-400" />
            Editor de Pixel Art (Estúdio)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Animação: <strong className="text-slate-200">{anim?.name}</strong> • Direção:{" "}
            <strong className="text-slate-200">{currentDir}</strong> • Frame:{" "}
            <strong className="text-slate-200">{currentFrameIdx + 1}</strong> ({width}x{height}px)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              commitCurrentFrame();
              onBackToStudio();
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            Voltar ao Estúdio
          </button>

          <button
            onClick={handleSaveToDb}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar no Banco (IndexedDB)</span>
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
        {/* Left Toolbar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-200">Navegação de Frame</h3>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={navPrevFrame}
                disabled={currentFrameIdx === 0}
                className="flex items-center justify-center gap-1 flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="text-xs font-bold text-slate-200 w-8 text-center">{currentFrameIdx + 1}</span>
              <button 
                onClick={navNextFrame}
                disabled={currentFrameIdx >= (anim.framesByDirection[currentDir]?.length || 1) - 1}
                className="flex items-center justify-center gap-1 flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={onionSkin} 
                  onChange={(e) => setOnionSkin(e.target.checked)} 
                  className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-600"
                />
                <Layers className="w-3.5 h-3.5" /> Ativar Onion Skin (Camadas)
              </label>
              <p className="text-[10px] text-slate-500 mt-1">
                Permite visualizar o frame anterior transparente atrás do atual para auxiliar o alinhamento e animação.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">Ferramentas</h3>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "pencil", label: "Lápis", icon: Pencil },
                { id: "eraser", label: "Borracha", icon: Eraser },
                { id: "pipette", label: "Conta-gotas", icon: Pipette },
                { id: "bucket", label: "Preencher", icon: PaintBucket },
              ].map((t) => {
                const Icon = t.icon;
                const isActive = tool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id as any)}
                    className={\`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border transition cursor-pointer \${
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-500 shadow"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                    }\`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-medium block">Ações & Histórico</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="flex-1 flex items-center justify-center gap-1 p-2 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs disabled:opacity-40 cursor-pointer transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="flex-1 flex items-center justify-center gap-1 p-2 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs disabled:opacity-40 cursor-pointer transition"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Redo
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => handleFlip(true)} className="flex-1 flex items-center justify-center gap-1 p-1.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[11px] cursor-pointer">
                  <FlipHorizontal className="w-3.5 h-3.5" /> Espelhar H
                </button>
                <button onClick={() => handleFlip(false)} className="flex-1 flex items-center justify-center gap-1 p-1.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[11px] cursor-pointer">
                  <FlipVertical className="w-3.5 h-3.5" /> Espelhar V
                </button>
              </div>

              <div className="pt-2 pb-1">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1 mb-2">
                  <Move className="w-3.5 h-3.5" /> Deslocar Arte (Nudge)
                </span>
                <div className="grid grid-cols-3 gap-1 w-32 mx-auto">
                  <div />
                  <button onClick={() => handleNudge(0, -1)} className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded flex items-center justify-center text-slate-300 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                  <div />
                  <button onClick={() => handleNudge(-1, 0)} className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded flex items-center justify-center text-slate-300 cursor-pointer"><ArrowLeft className="w-4 h-4" /></button>
                  <button onClick={() => handleNudge(0, 1)} className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded flex items-center justify-center text-slate-300 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => handleNudge(1, 0)} className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded flex items-center justify-center text-slate-300 cursor-pointer"><ArrowRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">Paleta de Cores</h3>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="w-10 h-10 rounded border-0 cursor-pointer bg-transparent p-0"
              />
              <span className="text-xs font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                {selectedColor}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 pt-2">
              {palette.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="w-full aspect-square rounded shadow-sm border border-slate-700/50 cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="lg:col-span-9 bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-xl overflow-hidden min-h-[600px]">
          <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-400">Zoom Canvas:</span>
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setZoom(Math.max(4, zoom - 4))}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-200 w-12 text-center">{zoom}x</span>
                <button
                  onClick={() => setZoom(Math.min(32, zoom + 4))}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzFmMjkzNyI+PC9yZWN0Pgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzQxNTUiPjwvcmVjdD4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzQxNTUiPjwvcmVjdD4KPC9zdmc+')]">
            <div className="relative border shadow-2xl border-slate-700 bg-transparent" style={{ width: width * zoom, height: height * zoom }}>
              {/* Onion Skin Layer */}
              <canvas
                ref={onionCanvasRef}
                className="image-pixelated absolute top-0 left-0 pointer-events-none opacity-50"
                style={{ width: width * zoom, height: height * zoom }}
              />
              {/* Active Drawing Layer */}
              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                className="image-pixelated absolute top-0 left-0 touch-none"
                style={{ width: width * zoom, height: height * zoom }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
`

fs.writeFileSync('src/components/PixelEditor.tsx', code);
