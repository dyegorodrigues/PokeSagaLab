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
  Layers,
  ArrowLeft as ArrowLeftIcon,
  Play,
  Pause
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
  const [zoom, setZoom] = useState(8);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  const [onionSkin, setOnionSkin] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef<number>(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const anim = localCreature.animations.find((a) => a.id === currentAnimId) || localCreature.animations[0];
  const width = anim?.frameWidth || 32;
  const height = anim?.frameHeight || 32;
  const maxFrames = anim?.framesByDirection?.[currentDir]?.length || 1;
  const targetFrame: Frame | undefined = anim?.framesByDirection?.[currentDir]?.[currentFrameIdx];
  const prevFrameIdx = currentFrameIdx > 0 ? currentFrameIdx - 1 : maxFrames - 1;
  const prevFrame: Frame | undefined = anim?.framesByDirection?.[currentDir]?.[prevFrameIdx];

  // Professional Palette Presets (Pico-8 inspired + standard)
  const palette = [
    "#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
    "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA",
    "rgba(0,0,0,0)" // Transparent eraser explicitly
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

  // Auto-save logic to update the local creature state seamlessly
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
  }, [currentAnimId, currentFrameIdx, currentDir, width, height, targetFrame]);

  // Load Onion Skin
  useEffect(() => {
    const oCanvas = onionCanvasRef.current;
    if (!oCanvas) return;
    oCanvas.width = width;
    oCanvas.height = height;
    const ctx = oCanvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, width, height);
    if (onionSkin && prevFrame && prevFrame.dataUrl && maxFrames > 1) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      };
      img.src = prevFrame.dataUrl;
    }
  }, [currentAnimId, currentFrameIdx, currentDir, prevFrame, onionSkin, width, height, maxFrames]);

  // Playback Preview
  useEffect(() => {
    if (!isPlaying) return;
    const pCanvas = previewCanvasRef.current;
    if (!pCanvas) return;
    const ctx = pCanvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let timer: any;
    
    const frames = anim?.framesByDirection?.[currentDir] || [];
    if (frames.length === 0) return;

    const playNext = () => {
      const f = frames[frame];
      ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      if (f.dataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, pCanvas.width, pCanvas.height);
        };
        img.src = f.dataUrl;
      }
      
      const duration = (f.duration || 6) * 33.3; // Approx PMD tick
      frame = (frame + 1) % frames.length;
      timer = setTimeout(playNext, duration);
    };

    playNext();
    return () => clearTimeout(timer);
  }, [isPlaying, currentDir, currentAnimId, localCreature, anim]);

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
    e.currentTarget.setPointerCapture(e.pointerId);
    drawPixel(e);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing) drawPixel(e);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing) {
      setIsDrawing(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x < 0 || x >= width || y < 0 || y >= height) return;

    if (tool === "pencil") {
      ctx.fillStyle = selectedColor === "rgba(0,0,0,0)" ? "#000" : selectedColor;
      if (selectedColor === "rgba(0,0,0,0)") {
        ctx.clearRect(x, y, 1, 1);
      } else {
        ctx.fillRect(x, y, 1, 1);
      }
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
      // True Flood Fill
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      
      const targetIdx = (y * width + x) * 4;
      const targetR = data[targetIdx];
      const targetG = data[targetIdx+1];
      const targetB = data[targetIdx+2];
      const targetA = data[targetIdx+3];
      
      let fillR = 0, fillG = 0, fillB = 0, fillA = 0;
      if (selectedColor !== "rgba(0,0,0,0)") {
        const fillHex = selectedColor.replace('#', '');
        fillR = parseInt(fillHex.substring(0,2), 16);
        fillG = parseInt(fillHex.substring(2,4), 16);
        fillB = parseInt(fillHex.substring(4,6), 16);
        fillA = 255;
      }
      
      if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;
      
      const pixelsToCheck = [[x, y]];
      
      while(pixelsToCheck.length > 0) {
        const [cx, cy] = pixelsToCheck.pop()!;
        const idx = (cy * width + cx) * 4;
        
        if (data[idx] === targetR && data[idx+1] === targetG && data[idx+2] === targetB && data[idx+3] === targetA) {
          data[idx] = fillR;
          data[idx+1] = fillG;
          data[idx+2] = fillB;
          data[idx+3] = fillA;
          
          if (cx > 0) pixelsToCheck.push([cx - 1, cy]);
          if (cx < width - 1) pixelsToCheck.push([cx + 1, cy]);
          if (cy > 0) pixelsToCheck.push([cx, cy - 1]);
          if (cy < height - 1) pixelsToCheck.push([cx, cy + 1]);
        }
      }
      ctx.putImageData(imgData, 0, 0);
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
    setStatusMessage("Salvo no banco com sucesso!");
    setTimeout(() => setStatusMessage(null), 3000);
    setLocalCreature(updatedCreature);
    onSaved(updatedCreature);
  };

  const navPrevFrame = () => {
    commitCurrentFrame();
    setCurrentFrameIdx(prevFrameIdx);
  };

  const navNextFrame = () => {
    commitCurrentFrame();
    setCurrentFrameIdx((currentFrameIdx + 1) % maxFrames);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e1e] flex flex-col font-sans text-slate-300">
      {/* Top Header */}
      <div className="h-12 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { commitCurrentFrame(); onBackToStudio(); }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Voltar
          </button>
          <div className="h-4 w-px bg-[#3c3c3c]" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-400">{anim.name}</span>
            <span className="text-[10px] bg-[#3c3c3c] px-1.5 py-0.5 rounded text-slate-300 border border-[#4c4c4c]">Dir: {currentDir}</span>
            <span className="text-[10px] bg-[#3c3c3c] px-1.5 py-0.5 rounded text-slate-300 border border-[#4c4c4c]">Frame {currentFrameIdx + 1}/{maxFrames}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {statusMessage && (
            <span className="text-emerald-400 text-xs animate-pulse">{statusMessage}</span>
          )}
          <button
            onClick={handleSaveToDb}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded shadow-sm transition"
          >
            <Save className="w-3.5 h-3.5" /> Salvar Projeto
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-14 bg-[#333333] border-r border-[#3c3c3c] flex flex-col items-center py-4 gap-2 shrink-0">
          {[
            { id: "pencil", icon: Pencil, title: "Lápis" },
            { id: "eraser", icon: Eraser, title: "Borracha" },
            { id: "pipette", icon: Pipette, title: "Conta-gotas" },
            { id: "bucket", icon: PaintBucket, title: "Preencher (Flood Fill)" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id as any)}
              title={t.title}
              className={\`p-2 rounded-lg transition \${tool === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-[#444] hover:text-white'}\`}
            >
              <t.icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-8 h-px bg-[#4c4c4c] my-2" />
          <button onClick={handleUndo} disabled={!canUndo} title="Desfazer" className="p-2 text-slate-400 hover:text-white hover:bg-[#444] rounded-lg disabled:opacity-30">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={handleRedo} disabled={!canRedo} title="Refazer" className="p-2 text-slate-400 hover:text-white hover:bg-[#444] rounded-lg disabled:opacity-30">
            <RotateCw className="w-4 h-4" />
          </button>
          <div className="w-8 h-px bg-[#4c4c4c] my-2" />
          <button onClick={() => setOnionSkin(!onionSkin)} title="Onion Skin" className={\`p-2 rounded-lg \${onionSkin ? 'text-amber-400 bg-[#444]' : 'text-slate-400 hover:text-white hover:bg-[#444]'}\`}>
            <Layers className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-[#1e1e1e] flex flex-col relative">
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-[#252526] border border-[#3c3c3c] rounded p-1 shadow-xl z-10">
            <button onClick={() => setZoom(Math.max(2, zoom - 1))} className="p-1 text-slate-400 hover:text-white"><ZoomOut className="w-3.5 h-3.5"/></button>
            <span className="text-xs font-mono w-8 text-center">{zoom}x</span>
            <button onClick={() => setZoom(Math.min(32, zoom + 1))} className="p-1 text-slate-400 hover:text-white"><ZoomIn className="w-3.5 h-3.5"/></button>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzI1MjUyNiI+PC9yZWN0Pgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzYzNjM2MiPjwvcmVjdD4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzYzNjM2MiPjwvcmVjdD4KPC9zdmc+')]">
            <div 
              className="relative shadow-2xl" 
              style={{ 
                width: width * zoom, 
                height: height * zoom,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.5)'
              }}
            >
              <canvas
                ref={onionCanvasRef}
                className="image-pixelated absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%' }}
              />
              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerUp}
                className="image-pixelated absolute inset-0 touch-none cursor-crosshair"
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
          
          {/* Bottom Timeline */}
          <div className="h-16 bg-[#252526] border-t border-[#3c3c3c] flex items-center justify-center gap-4 shrink-0 px-4">
             <button onClick={navPrevFrame} className="p-1.5 rounded hover:bg-[#333] text-slate-300">
               <ChevronLeft className="w-5 h-5" />
             </button>
             <div className="flex items-center gap-1 overflow-x-auto px-2 max-w-lg">
                {anim?.framesByDirection?.[currentDir]?.map((f, idx) => (
                  <button
                    key={idx}
                    onClick={() => { commitCurrentFrame(); setCurrentFrameIdx(idx); }}
                    className={\`w-10 h-10 border-2 rounded overflow-hidden flex-shrink-0 transition-all \${idx === currentFrameIdx ? 'border-indigo-500 scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}\`}
                  >
                    <img src={f.dataUrl || ""} alt="frame" className="w-full h-full object-contain image-pixelated bg-[#1e1e1e]" />
                  </button>
                ))}
             </div>
             <button onClick={navNextFrame} className="p-1.5 rounded hover:bg-[#333] text-slate-300">
               <ChevronRight className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Right Panel (Colors & Preview) */}
        <div className="w-64 bg-[#252526] border-l border-[#3c3c3c] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#3c3c3c]">
            <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Preview</h3>
            <div className="aspect-square bg-[#1e1e1e] rounded-lg border border-[#3c3c3c] flex items-center justify-center relative overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzI1MjUyNiI+PC9yZWN0Pgo8cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzYzNjM2MiPjwvcmVjdD4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzYzNjM2MiPjwvcmVjdD4KPC9zdmc+')]">
              <canvas
                ref={previewCanvasRef}
                width={width}
                height={height}
                className="image-pixelated w-3/4 h-3/4 object-contain"
              />
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute bottom-2 right-2 bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-full shadow-lg"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Cores</h3>
            <div className="flex items-center gap-3 mb-4 bg-[#1e1e1e] p-2 rounded border border-[#3c3c3c]">
              <input
                type="color"
                value={selectedColor === "rgba(0,0,0,0)" ? "#000000" : selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent p-0"
              />
              <span className="text-xs font-mono text-slate-300">
                {selectedColor === "rgba(0,0,0,0)" ? "Transparente" : selectedColor}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {palette.map((color, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedColor(color)}
                  className={\`w-full aspect-square rounded shadow-sm border cursor-pointer hover:scale-105 transition-transform \${
                     selectedColor === color ? 'border-white' : 'border-[#3c3c3c]'
                  }\`}
                  style={{ 
                    backgroundColor: color, 
                    backgroundImage: color === "rgba(0,0,0,0)" ? "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')" : "none" 
                  }}
                  title={color}
                />
              ))}
            </div>

            <div className="mt-8">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Ações Rápidas</h3>
              <div className="space-y-2">
                <button onClick={() => handleFlip(true)} className="w-full flex items-center gap-2 p-2 bg-[#333] hover:bg-[#444] rounded text-xs text-slate-300">
                  <FlipHorizontal className="w-4 h-4" /> Espelhar Horiz.
                </button>
                <button onClick={() => handleFlip(false)} className="w-full flex items-center gap-2 p-2 bg-[#333] hover:bg-[#444] rounded text-xs text-slate-300">
                  <FlipVertical className="w-4 h-4" /> Espelhar Vert.
                </button>
                <div className="pt-2">
                  <span className="text-[10px] text-slate-500 mb-1 block">Nudge (Deslocar)</span>
                  <div className="grid grid-cols-3 gap-1 w-24">
                    <div />
                    <button onClick={() => handleNudge(0, -1)} className="p-1 bg-[#333] hover:bg-[#444] rounded flex items-center justify-center text-slate-300"><ArrowUp className="w-3 h-3" /></button>
                    <div />
                    <button onClick={() => handleNudge(-1, 0)} className="p-1 bg-[#333] hover:bg-[#444] rounded flex items-center justify-center text-slate-300"><ArrowLeft className="w-3 h-3" /></button>
                    <button onClick={() => handleNudge(0, 1)} className="p-1 bg-[#333] hover:bg-[#444] rounded flex items-center justify-center text-slate-300"><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => handleNudge(1, 0)} className="p-1 bg-[#333] hover:bg-[#444] rounded flex items-center justify-center text-slate-300"><ArrowRight className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
`
fs.writeFileSync('src/components/PixelEditor.tsx', code);
