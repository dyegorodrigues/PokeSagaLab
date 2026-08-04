import React, { useState, useEffect, useRef } from "react";
import { Creature, Animation } from "../types";
import { assembleSpriteSheet } from "../domain/parser/animDataParser";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Copy,
  Edit3,
  Sparkles,
  Bot,
  Grid,
  Layers,
  Compass,
  Download,
  Eye,
  Zap,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Clock,
  Undo2,
  Redo2,
} from "lucide-react";

interface AnimationStudioProps {
  creature: Creature;
  onDuplicateToLocal: (creature: Creature) => void;
  onOpenPixelEditor: (creature: Creature, animationId: string, frameIndex: number, direction: number) => void;
  onOpenAiLab: (creature: Creature, animationName: string, direction: number) => void;
  onOpenNpcTest: (creature: Creature) => void;
  onExportZip: (creature: Creature) => void;
  onUpdateCreature?: (updatedCreature: Creature) => void;
}

export const AnimationStudio: React.FC<AnimationStudioProps> = ({
  creature,
  onDuplicateToLocal,
  onOpenPixelEditor,
  onOpenAiLab,
  onOpenNpcTest,
  onExportZip,
  onUpdateCreature,
}) => {
  const [selectedAnimIndex, setSelectedAnimIndex] = useState(0);
  const [direction, setDirection] = useState(0); // 0 to 7
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [bgMode, setBgMode] = useState<"checker" | "magenta" | "grass">("checker");
  const [showGrid, setShowGrid] = useState(true);
  const [showShadow, setShowShadow] = useState(true);
  const [showMultiDirView, setShowMultiDirView] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(4); // 4x default zoom
  const [viewMode, setViewMode] = useState<"standard" | "isometric">("standard");

  const activeAnim: Animation | undefined = creature.animations[selectedAnimIndex] || creature.animations[0];
  const frames = activeAnim?.framesByDirection?.[direction] || [];
  const currentFrame = frames[currentFrameIndex] || frames[0];

  // Animation Loop Timer
  useEffect(() => {
    if (!isPlaying || !frames.length) return;

    // PMDCollab durations are often based on a 30fps equivalent tick or 
    // the user reported 1.0 is too fast and 0.5 is correct. Thus, 16.6 * 2 = ~33.3ms per tick.
    const frameDurationMs = ((currentFrame?.duration || 6) * 33.3) / playbackSpeed;
    const timeout = setTimeout(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, frameDurationMs);

    return () => clearTimeout(timeout);
  }, [isPlaying, currentFrameIndex, frames, playbackSpeed, currentFrame?.duration]);

  const directionLabels = [
    "0: Sul (S)",
    "1: Sudoeste (SW)",
    "2: Oeste (W)",
    "3: Noroeste (NW)",
    "4: Norte (N)",
    "5: Nordeste (NE)",
    "6: Leste (E)",
    "7: Sudeste (SE)",
  ];

  const handleMoveFrame = (fromIndex: number, toIndex: number) => {
    if (!activeAnim || !onUpdateCreature) return;
    if (toIndex < 0 || toIndex >= frames.length) return;

    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === activeAnim.id);
    if (!targetAnim) return;

    // Swap durations
    const durTemp = targetAnim.durations[fromIndex];
    targetAnim.durations[fromIndex] = targetAnim.durations[toIndex];
    targetAnim.durations[toIndex] = durTemp;

    // Swap frames across all 8 directions
    for (let d = 0; d < 8; d++) {
      const dirFrames = targetAnim.framesByDirection[d];
      if (dirFrames && dirFrames[fromIndex] && dirFrames[toIndex]) {
        const temp = dirFrames[fromIndex];
        dirFrames[fromIndex] = dirFrames[toIndex];
        dirFrames[toIndex] = temp;
        dirFrames[fromIndex].frameIndex = fromIndex;
        dirFrames[toIndex].frameIndex = toIndex;
      }
    }

    onUpdateCreature(updatedCreature);
    setCurrentFrameIndex(toIndex);
  };

  const handleDuplicateFrame = (fIndex: number) => {
    if (!activeAnim || !onUpdateCreature) return;

    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === activeAnim.id);
    if (!targetAnim) return;

    targetAnim.durations.splice(fIndex + 1, 0, targetAnim.durations[fIndex] || 6);

    for (let d = 0; d < 8; d++) {
      const dirFrames = targetAnim.framesByDirection[d];
      if (dirFrames && dirFrames[fIndex]) {
        const cloneFrame = {
          ...dirFrames[fIndex],
          id: `${targetAnim.id}_d${d}_f${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          frameIndex: fIndex + 1,
        };
        dirFrames.splice(fIndex + 1, 0, cloneFrame);
        dirFrames.forEach((fr, idx) => (fr.frameIndex = idx));
      }
    }

    onUpdateCreature(updatedCreature);
    setCurrentFrameIndex(fIndex + 1);
  };

  const handleDeleteFrame = (fIndex: number) => {
    if (!activeAnim || !onUpdateCreature || frames.length <= 1) return;

    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === activeAnim.id);
    if (!targetAnim) return;

    targetAnim.durations.splice(fIndex, 1);

    for (let d = 0; d < 8; d++) {
      const dirFrames = targetAnim.framesByDirection[d];
      if (dirFrames && dirFrames[fIndex]) {
        dirFrames.splice(fIndex, 1);
        dirFrames.forEach((fr, idx) => (fr.frameIndex = idx));
      }
    }

    onUpdateCreature(updatedCreature);
    setCurrentFrameIndex(Math.max(0, fIndex - 1));
  };

  const handleNudgeOrigin = (dx: number, dy: number) => {
    if (!activeAnim || !onUpdateCreature || !currentFrame) return;
    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === activeAnim.id);
    if (!targetAnim) return;

    // Apply offset change to all directions for this frame index to keep it consistent
    // if we just want it to be per-frame-index, or per-direction?
    // Actually, PMD offsets apply to the specific frame across the entire animation typically, 
    // or we can just apply it to the specific directional frame. Let's do specific directional frame for precise control.
    const frameToUpdate = targetAnim.framesByDirection[direction][currentFrameIndex];
    if (frameToUpdate) {
      if (!frameToUpdate.origin) {
        frameToUpdate.origin = { x: Math.floor(targetAnim.frameWidth / 2), y: Math.floor(targetAnim.frameHeight / 2) };
      }
      frameToUpdate.origin.x += dx;
      frameToUpdate.origin.y += dy;
      onUpdateCreature(updatedCreature);
    }
  };

  const handleChangeDuration = (fIndex: number, newDur: number) => {
    if (!activeAnim || !onUpdateCreature || newDur < 1) return;

    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));
    const targetAnim = updatedCreature.animations.find((a) => a.id === activeAnim.id);
    if (!targetAnim) return;

    targetAnim.durations[fIndex] = newDur;
    for (let d = 0; d < 8; d++) {
      if (targetAnim.framesByDirection[d]?.[fIndex]) {
        targetAnim.framesByDirection[d][fIndex].duration = newDur;
      }
    }

    onUpdateCreature(updatedCreature);
  };

  const handleExportAnimationPNG = async () => {
    if (!activeAnim) return;
    try {
      const dataUrl = await assembleSpriteSheet(
        activeAnim.framesByDirection,
        activeAnim.frameWidth,
        activeAnim.frameHeight,
        8
      );
      
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${creature.numericId}-${activeAnim.name}-Anim.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export animation PNG", err);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-indigo-400 font-bold">#{creature.numericId}</span>
            <h2 className="text-xl font-bold text-slate-100">{creature.displayName}</h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 capitalize">
              {creature.sourceKind}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Licença: <span className="text-slate-300">{creature.license}</span> • Origem:{" "}
            <span className="text-slate-300">{creature.provenance.origin}</span>
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {creature.sourceKind === "remote" && (
            <button
              onClick={() => onDuplicateToLocal(creature)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicar para Projeto Local</span>
            </button>
          )}

          <button
            onClick={() =>
              activeAnim && onOpenPixelEditor(creature, activeAnim.id, currentFrameIndex, direction)
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Editar Frame no Canvas</span>
          </button>

          <button
            onClick={() => activeAnim && onOpenAiLab(creature, activeAnim.name, direction)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>IA Nano Banana</span>
          </button>

          <button
            onClick={() => onOpenNpcTest(creature)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulador NPC</span>
          </button>

          <button
            onClick={() => onExportZip(creature)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Exportar ZIP</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Animation Selector & Info */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between">
              <span>Animações do Personagem</span>
              <span className="text-xs font-mono text-slate-400">{creature.animations.length} disponíveis</span>
            </h3>

            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {creature.animations.map((anim, idx) => {
                const isSelected = selectedAnimIndex === idx;
                return (
                  <button
                    key={anim.id || idx}
                    onClick={() => {
                      setSelectedAnimIndex(idx);
                      setCurrentFrameIndex(0);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-left cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white font-semibold shadow"
                        : "bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-slate-100 border border-slate-800/80"
                    }`}
                  >
                    <span>{anim.name}</span>
                    <span className="text-[10px] opacity-75 font-mono">
                      {anim.frameWidth}x{anim.frameHeight} | {anim.durations?.length || 0}f
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleExportAnimationPNG}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer mt-2"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Baixar Spritesheet ({activeAnim?.name})</span>
            </button>
          </div>

          {/* Directional Dial Selector */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              Direção (8-Direções SpriteCollab)
            </h3>

            <select
              value={direction}
              onChange={(e) => setDirection(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              {directionLabels.map((lbl, idx) => (
                <option key={idx} value={idx}>
                  {lbl}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-1.5 pt-2">
              {[
                { dir: 3, label: "NW" },
                { dir: 4, label: "N" },
                { dir: 5, label: "NE" },
                { dir: 2, label: "W" },
                { dir: 0, label: "S (0)" },
                { dir: 6, label: "E" },
                { dir: 1, label: "SW" },
                { dir: 0, label: "S" },
                { dir: 7, label: "SE" },
              ].map((dItem, i) => {
                const isActive = direction === dItem.dir;
                return (
                  <button
                    key={i}
                    onClick={() => setDirection(dItem.dir)}
                    className={`py-1.5 text-xs font-bold rounded border transition cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {dItem.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center / Right: Canvas Preview & Timeline */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl">
            {/* Stage Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMultiDirView(!showMultiDirView)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer border ${
                    showMultiDirView
                      ? "bg-indigo-600 text-white border-indigo-500 shadow"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showMultiDirView ? "Visão Direção Única" : "Visão Multi-Direções (8 Direções)"}</span>
                </button>

                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Fundo:</span>
                {(["checker", "magenta", "grass"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBgMode(mode)}
                    className={`px-2 py-0.5 rounded capitalize transition cursor-pointer border ${
                      bgMode === mode
                        ? "bg-indigo-600 text-white border-indigo-500 font-semibold"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {mode === "checker" ? "Xadrez" : mode === "magenta" ? "Magenta" : "Grama"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Grade</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={viewMode === "isometric"}
                    onChange={(e) => setViewMode(e.target.checked ? "isometric" : "standard")}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-emerald-400 font-medium">Isométrica</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={showShadow}
                    onChange={(e) => setShowShadow(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Sombra</span>
                </label>

                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Zoom:</span>
                  {[2, 3, 4, 6].map((z) => (
                    <button
                      key={z}
                      onClick={() => setZoomLevel(z)}
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] cursor-pointer ${
                        zoomLevel === z ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Canvas Stage Display (Single or 8-Direction Grid) */}
            {showMultiDirView ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((dirIdx) => {
                  const dirFrames = activeAnim?.framesByDirection?.[dirIdx] || [];
                  const dirFrame = dirFrames[currentFrameIndex] || dirFrames[0];
                  return (
                    <div
                      key={dirIdx}
                      onClick={() => {
                        setDirection(dirIdx);
                        setShowMultiDirView(false);
                      }}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-between gap-2 cursor-pointer transition ${
                        direction === dirIdx
                          ? "bg-indigo-950/60 border-indigo-500 shadow-lg ring-1 ring-indigo-500"
                          : "bg-slate-900 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">
                        Dir {dirIdx}: {["S", "SE", "E", "NE", "N", "NW", "W", "SW"][dirIdx]}
                      </span>
                      <div className="w-16 h-16 flex items-center justify-center relative">
                        {dirFrame?.dataUrl ? (
                          <img
                            src={dirFrame.dataUrl}
                            alt={`Dir ${dirIdx}`}
                            className="image-pixelated object-contain max-h-14 max-w-full"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-600">Sem Frame</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={`rounded-xl border border-slate-800 h-80 flex items-center justify-center relative overflow-hidden transition-all ${
                  bgMode === "checker"
                    ? "bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] bg-slate-950"
                    : bgMode === "magenta"
                    ? "bg-[#ff00ff]"
                    : "bg-emerald-900/40"
                }`}
              >
                {/* Action Frame Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-30">
                  {activeAnim?.hitFrame !== undefined && activeAnim.hitFrame === currentFrameIndex && (
                    <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Hit Frame ({activeAnim.hitFrame})
                    </span>
                  )}
                  {activeAnim?.rushFrame !== undefined && activeAnim.rushFrame === currentFrameIndex && (
                    <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow flex items-center gap-1">
                      Rush Frame ({activeAnim.rushFrame})
                    </span>
                  )}
                  {activeAnim?.returnFrame !== undefined && activeAnim.returnFrame === currentFrameIndex && (
                    <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow flex items-center gap-1">
                      Return Frame ({activeAnim.returnFrame})
                    </span>
                  )}
                </div>

                {currentFrame?.dataUrl ? (
                  <div className="relative flex items-center justify-center w-full h-full pointer-events-none">
                    {/* Shadow preview under sprite */}
                    {showShadow && (
                      <div
                        className="absolute bg-black/40 rounded-full blur-[1px]"
                        style={{
                          width: (activeAnim?.frameWidth || 32) * (zoomLevel * 0.6),
                          height: 8 * (zoomLevel * 0.4),
                        }}
                      />
                    )}

                    {/* Frame Image */}
                    <img
                      src={currentFrame.dataUrl}
                      alt={`Frame ${currentFrameIndex}`}
                      className="image-pixelated drop-shadow-xl absolute z-10"
                      style={{
                        width: (activeAnim?.frameWidth || 32) * zoomLevel,
                        height: (activeAnim?.frameHeight || 32) * zoomLevel,
                        transform: `translate(${( (activeAnim?.frameWidth || 32) / 2 - (currentFrame.origin?.x || (activeAnim?.frameWidth || 32) / 2) ) * zoomLevel}px, ${( (activeAnim?.frameHeight || 32) / 2 - (currentFrame.origin?.y || (activeAnim?.frameHeight || 32) / 2) ) * zoomLevel}px)`
                      }}
                    />

                    {/* Isometric Grid Overlay */}
                    {viewMode === "isometric" && (
                      <div className="absolute pointer-events-none z-0" style={{ width: 0, height: 0 }}>
                        <svg className="overflow-visible" width="0" height="0" style={{ position: 'absolute', top: 0, left: 0 }}>
                          <g transform="scale(1, 0.5) rotate(45)">
                            <rect x="-100" y="-100" width="200" height="200" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
                            <rect x="-50" y="-50" width="100" height="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
                            <line x1="-200" y1="0" x2="200" y2="0" stroke="rgba(100,200,255,0.3)" strokeWidth="2" />
                            <line x1="0" y1="-200" x2="0" y2="200" stroke="rgba(100,200,255,0.3)" strokeWidth="2" />
                          </g>
                        </svg>
                        {/* Center Anchor Point (Red Cross) */}
                        <div className="absolute w-2 h-2 -ml-1 -mt-1 bg-red-500 rounded-full shadow-lg border border-white" />
                      </div>
                    )}

                    {/* Pixel Grid Overlay */}
                    {showGrid && viewMode === "standard" && (
                      <div
                        className="absolute border border-indigo-500/30 pointer-events-none z-20"
                        style={{
                          width: (activeAnim?.frameWidth || 32) * zoomLevel,
                          height: (activeAnim?.frameHeight || 32) * zoomLevel,
                          transform: `translate(${( (activeAnim?.frameWidth || 32) / 2 - (currentFrame.origin?.x || (activeAnim?.frameWidth || 32) / 2) ) * zoomLevel}px, ${( (activeAnim?.frameHeight || 32) / 2 - (currentFrame.origin?.y || (activeAnim?.frameHeight || 32) / 2) ) * zoomLevel}px)`
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                    <RotateCcw className="w-6 h-6 animate-spin text-indigo-400" />
                    <span>Carregando frame da animação...</span>
                  </div>
                )}
              </div>
            )}

            {/* Playback Controls & Timeline Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : frames.length - 1))}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow transition cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  <button
                    onClick={() => setCurrentFrameIndex((prev) => (prev + 1) % frames.length)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono flex flex-col">
                    <span>Frame <strong className="text-slate-200">{currentFrameIndex + 1}</strong> / {frames.length}</span>
                    {viewMode === "isometric" && currentFrame?.origin && (
                      <span className="text-[10px] text-emerald-400 mt-1 font-semibold">
                        Render Offset: [X: {(activeAnim?.frameWidth || 32)/2 - currentFrame.origin.x}, Y: {(activeAnim?.frameHeight || 32)/2 - currentFrame.origin.y}]
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400">Velocidade:</span>
                    {[0.5, 1.0, 1.5, 2.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => setPlaybackSpeed(s)}
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] cursor-pointer ${
                          playbackSpeed === s ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Frame Action Toolbar */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold font-mono">
                    Frame Ativo #{currentFrameIndex + 1}:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveFrame(currentFrameIndex, currentFrameIndex - 1)}
                      disabled={currentFrameIndex === 0}
                      title="Mover Frame para a Esquerda"
                      className="p-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveFrame(currentFrameIndex, currentFrameIndex + 1)}
                      disabled={currentFrameIndex === frames.length - 1}
                      title="Mover Frame para a Direita"
                      className="p-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer transition"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="w-px h-5 bg-slate-800 mx-1" />
                  <span className="text-[10px] text-slate-500 font-mono">Pivot:</span>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                    <button onClick={() => handleNudgeOrigin(1, 0)} title="Mover sprite p/ Esquerda (deslocar Pivot Direita)" className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowLeft className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleNudgeOrigin(0, 1)} title="Mover sprite p/ Cima (deslocar Pivot Baixo)" className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleNudgeOrigin(0, -1)} title="Mover sprite p/ Baixo (deslocar Pivot Cima)" className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleNudgeOrigin(-1, 0)} title="Mover sprite p/ Direita (deslocar Pivot Esquerda)" className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowRight className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[11px] text-slate-400">Duração:</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={currentFrame?.duration || 6}
                      onChange={(e) => handleChangeDuration(currentFrameIndex, Number(e.target.value))}
                      className="w-12 bg-slate-950 border border-slate-800 text-slate-200 font-mono text-center rounded px-1 text-xs focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">ticks</span>
                  </div>

                  <button
                    onClick={() => handleDuplicateFrame(currentFrameIndex)}
                    title="Duplicar Frame em todas as 8 direções"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold text-xs rounded-lg transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Duplicar Frame</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentFrame?.dataUrl) {
                        const link = document.createElement("a");
                        link.href = currentFrame.dataUrl;
                        link.download = `${creature.numericId}_${activeAnim?.name}_dir${direction}_f${currentFrameIndex}.png`;
                        link.click();
                      }
                    }}
                    title="Baixar Frame Atual"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-900/60 border border-emerald-700/50 hover:bg-emerald-800 text-emerald-200 font-semibold text-xs rounded-lg cursor-pointer transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Frame</span>
                  </button>

                  <button
                    onClick={() => handleDeleteFrame(currentFrameIndex)}
                    disabled={frames.length <= 1}
                    title="Deletar Frame"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-900/60 border border-rose-700/50 hover:bg-rose-800 text-rose-200 font-semibold text-xs rounded-lg disabled:opacity-30 cursor-pointer transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Deletar</span>
                  </button>
                </div>
              </div>

              {/* Frame Timeline Strip */}
              <div className="flex items-center gap-2 overflow-x-auto p-2 bg-slate-950 border border-slate-800 rounded-xl scrollbar-none">
                {frames.map((frame, fIdx) => {
                  const isActive = fIdx === currentFrameIndex;
                  return (
                    <button
                      key={frame.id || fIdx}
                      onClick={() => {
                        setCurrentFrameIndex(fIdx);
                        setIsPlaying(false);
                      }}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg border p-1 flex flex-col items-center justify-between transition cursor-pointer relative ${
                        isActive
                          ? "bg-indigo-900/50 border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg scale-105"
                          : "bg-slate-900 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <img src={frame.dataUrl} alt={`Frame ${fIdx}`} className="max-h-8 max-w-full object-contain image-pixelated" />
                      <span className="text-[9px] font-mono text-slate-400">f{fIdx + 1} ({frame.duration}t)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
