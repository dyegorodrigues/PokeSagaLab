import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  GripVertical,
  ImagePlus,
  Layers3,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Animation, Creature, Frame } from "../types";
import {
  SpriteSheetLayer,
  assembleSpriteSheet,
} from "../domain/parser/animDataParser";

interface AnimationStudioProps {
  creature: Creature;
  onDuplicateToLocal: (creature: Creature) => void;
  onOpenPixelEditor: (
    creature: Creature,
    animationId: string,
    frameIndex: number,
    direction: number,
  ) => void;
  onOpenAiLab: (
    creature: Creature,
    animationName: string,
    direction: number,
  ) => void;
  onOpenNpcTest: (creature: Creature) => void;
  onExportZip: (creature: Creature) => void;
  onUpdateCreature?: (updatedCreature: Creature) => void;
}

const DIRECTIONS = [
  { index: 0, label: "S", name: "Sul" },
  { index: 1, label: "SE", name: "Sudeste" },
  { index: 2, label: "E", name: "Leste" },
  { index: 3, label: "NE", name: "Nordeste" },
  { index: 4, label: "N", name: "Norte" },
  { index: 5, label: "NW", name: "Noroeste" },
  { index: 6, label: "W", name: "Oeste" },
  { index: 7, label: "SW", name: "Sudoeste" },
] as const;

const BACKGROUNDS = {
  checker:
    "repeating-conic-gradient(#172033 0% 25%, #0f172a 0% 50%) 50% / 18px 18px",
  magenta: "#ff00ff",
  grass:
    "linear-gradient(#183c32 0 68%, #245a3d 68% 72%, #2e6b42 72% 100%)",
} as const;

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
  ctx.drawImage(
    image,
    Math.floor((width - drawWidth) / 2),
    Math.floor((height - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );
  return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

function frameLayerUrl(frame: Frame | undefined, layer: SpriteSheetLayer) {
  if (!frame) return undefined;
  if (layer === "sprite") return frame.dataUrl;
  if (layer === "offsets") return frame.offsetsDataUrl;
  return frame.shadowDataUrl;
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
  const [selectedAnimationId, setSelectedAnimationId] = useState(
    creature.animations[0]?.id || "",
  );
  const [direction, setDirection] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(6);
  const [background, setBackground] =
    useState<keyof typeof BACKGROUNDS>("checker");
  const [layer, setLayer] = useState<SpriteSheetLayer>("sprite");
  const [showAnchors, setShowAnchors] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  const [uploadMode, setUploadMode] = useState<"replace" | "insert">("replace");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const animation = useMemo(
    () =>
      creature.animations.find(
        (candidate) => candidate.id === selectedAnimationId,
      ) || creature.animations[0],
    [creature.animations, selectedAnimationId],
  );
  const availableDirections =
    animation?.directions === 1 ? DIRECTIONS.slice(0, 1) : DIRECTIONS;
  const frames = animation?.framesByDirection[direction] || [];
  const currentFrame = frames[frameIndex] || frames[0];
  const readOnly = creature.sourceKind === "remote";

  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2500);
  };

  useEffect(() => {
    if (!animation) return;
    if (animation.directions === 1 && direction !== 0) setDirection(0);
    setFrameIndex(0);
    setPlaying(false);
  }, [animation?.id, animation?.directions]);

  useEffect(() => {
    if (!playing || !currentFrame || frames.length <= 1) return;
    const durationMs = Math.max(
      16,
      ((currentFrame.duration || 1) * 1000) /
        60 /
        Math.max(playbackRate, 0.1),
    );
    const timer = window.setTimeout(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      durationMs,
    );
    return () => window.clearTimeout(timer);
  }, [currentFrame?.duration, frames.length, frameIndex, playing, playbackRate]);

  if (!animation) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-amber-200">
        Este personagem não possui animações carregadas.
      </div>
    );
  }

  const commitUpdate = (updater: (target: Animation) => void) => {
    if (readOnly || !onUpdateCreature) return;
    const updated = cloneCreature(creature);
    const target = updated.animations.find(
      (candidate) => candidate.id === animation.id,
    );
    if (!target) return;
    updater(target);
    onUpdateCreature(updated);
  };

  const updateDuration = (duration: number) => {
    if (!Number.isInteger(duration) || duration < 1) return;
    commitUpdate((target) => {
      target.durations[frameIndex] = duration;
      for (let index = 0; index < target.directions; index += 1) {
        const frame = target.framesByDirection[index]?.[frameIndex];
        if (frame) frame.duration = duration;
      }
    });
  };

  const addFrame = (duplicate: boolean) => {
    const insertIndex = frameIndex + 1;
    commitUpdate((target) => {
      const duration = target.durations[frameIndex] || 6;
      target.durations.splice(insertIndex, 0, duration);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const directionFrames = target.framesByDirection[directionIndex] || [];
        const source = directionFrames[frameIndex];
        const next: Frame =
          duplicate && source
            ? {
                ...source,
                id: `${target.id}_d${directionIndex}_f${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                frameIndex: insertIndex,
                origin: { ...source.origin },
                shadowOrigin: source.shadowOrigin
                  ? { ...source.shadowOrigin }
                  : undefined,
              }
            : {
                id: `${target.id}_d${directionIndex}_f${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                animationId: target.id,
                direction: directionIndex,
                frameIndex: insertIndex,
                dataUrl: blankDataUrl(target.frameWidth, target.frameHeight),
                duration,
                origin: {
                  x: Math.floor(target.frameWidth / 2),
                  y: Math.floor(target.frameHeight / 2),
                },
              };
        directionFrames.splice(insertIndex, 0, next);
        directionFrames.forEach((frame, index) => {
          frame.frameIndex = index;
          frame.duration = target.durations[index] || frame.duration || 6;
        });
        target.framesByDirection[directionIndex] = directionFrames;
      }
    });
    setFrameIndex(insertIndex);
    setPlaying(false);
    showStatus(duplicate ? "Frame duplicado" : "Frame vazio adicionado");
  };

  const deleteFrame = () => {
    if (frames.length <= 1) return;
    commitUpdate((target) => {
      target.durations.splice(frameIndex, 1);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const directionFrames = target.framesByDirection[directionIndex] || [];
        directionFrames.splice(frameIndex, 1);
        directionFrames.forEach((frame, index) => {
          frame.frameIndex = index;
          frame.duration = target.durations[index] || frame.duration || 6;
        });
      }
    });
    setFrameIndex(Math.max(0, frameIndex - 1));
    setPlaying(false);
    showStatus("Frame removido");
  };

  const reorderFrames = (from: number, to: number) => {
    if (from === to || to < 0 || to >= frames.length) return;
    commitUpdate((target) => {
      const [duration] = target.durations.splice(from, 1);
      target.durations.splice(to, 0, duration);
      for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
        const directionFrames = target.framesByDirection[directionIndex] || [];
        const [frame] = directionFrames.splice(from, 1);
        if (frame) directionFrames.splice(to, 0, frame);
        directionFrames.forEach((item, index) => {
          item.frameIndex = index;
          item.duration = target.durations[index] || item.duration || 6;
        });
      }
    });
    setFrameIndex(to);
    setPlaying(false);
    showStatus("Frame reposicionado");
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragFrom !== null && dragTo !== null) reorderFrames(dragFrom, dragTo);
    setDragFrom(null);
    setDragTo(null);
  };

  const nudgeAnchor = (x: number, y: number, targetKind: "origin" | "shadow") => {
    commitUpdate((target) => {
      const frame = target.framesByDirection[direction]?.[frameIndex];
      if (!frame) return;
      if (targetKind === "origin") {
        frame.origin = { x: frame.origin.x + x, y: frame.origin.y + y };
        frame.offsetsDataUrl = undefined;
      } else {
        const current = frame.shadowOrigin || frame.origin;
        frame.shadowOrigin = { x: current.x + x, y: current.y + y };
        frame.shadowDataUrl = undefined;
      }
    });
  };

  const chooseUpload = (mode: "replace" | "insert") => {
    if (readOnly) return;
    setUploadMode(mode);
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(file);
      });
      const image = await loadImage(source);
      const fitted = fitImageToCell(image, animation.frameWidth, animation.frameHeight);
      const targetIndex = uploadMode === "insert" ? frameIndex + 1 : frameIndex;

      commitUpdate((target) => {
        if (uploadMode === "insert") {
          const duration = target.durations[frameIndex] || 6;
          target.durations.splice(targetIndex, 0, duration);
          for (let directionIndex = 0; directionIndex < target.directions; directionIndex += 1) {
            const directionFrames = target.framesByDirection[directionIndex] || [];
            const newFrame: Frame = {
              id: `${target.id}_d${directionIndex}_f${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 6)}`,
              animationId: target.id,
              direction: directionIndex,
              frameIndex: targetIndex,
              dataUrl:
                directionIndex === direction
                  ? fitted
                  : blankDataUrl(target.frameWidth, target.frameHeight),
              duration,
              origin: {
                x: Math.floor(target.frameWidth / 2),
                y: Math.floor(target.frameHeight / 2),
              },
            };
            directionFrames.splice(targetIndex, 0, newFrame);
            directionFrames.forEach((frame, index) => {
              frame.frameIndex = index;
              frame.duration = target.durations[index] || frame.duration || 6;
            });
            target.framesByDirection[directionIndex] = directionFrames;
          }
        } else {
          const targetFrame = target.framesByDirection[direction]?.[frameIndex];
          if (targetFrame) targetFrame.dataUrl = fitted;
        }
      });
      setFrameIndex(targetIndex);
      setPlaying(false);
      showStatus(uploadMode === "insert" ? "PNG inserido" : "Frame substituído por PNG");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const exportCurrentLayer = async () => {
    const dataUrl = await assembleSpriteSheet(
      animation.framesByDirection,
      animation.frameWidth,
      animation.frameHeight,
      animation.directions,
      layer,
    );
    const suffix =
      layer === "sprite" ? "Anim" : layer === "offsets" ? "Offsets" : "Shadow";
    downloadDataUrl(dataUrl, `${creature.numericId}-${animation.name}-${suffix}.png`);
  };

  const visibleUrl = frameLayerUrl(currentFrame, layer);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(event) => void handleUpload(event)}
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-400">
                #{creature.numericId}
              </span>
              <h2 className="text-xl font-bold text-white">{creature.displayName}</h2>
              <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] uppercase text-slate-300">
                {creature.sourceKind}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {creature.provenance.origin} · {creature.provenance.author}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {readOnly && (
              <button
                type="button"
                onClick={() => onDuplicateToLocal(creature)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              >
                <Copy className="h-4 w-4" /> Duplicar para editar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                onOpenPixelEditor(creature, animation.id, frameIndex, direction);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              <Edit3 className="h-4 w-4 text-amber-400" /> Editor completo
            </button>
            <button
              type="button"
              onClick={() => onOpenAiLab(creature, animation.name, direction)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white"
            >
              <Sparkles className="h-4 w-4" /> Gerar com IA
            </button>
            <button
              type="button"
              onClick={() => onOpenNpcTest(creature)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              <Bot className="h-4 w-4 text-emerald-400" /> Testar NPC
            </button>
            <button
              type="button"
              onClick={() => onExportZip(creature)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              <Download className="h-4 w-4 text-blue-400" /> Exportar pacote
            </button>
          </div>
        </div>
      </section>

      {status && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/60 px-4 py-2 text-xs text-emerald-200">
          {status}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-950/60 px-4 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Ações</h3>
            <div className="max-h-[430px] space-y-1 overflow-y-auto">
              {creature.animations.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => {
                    setSelectedAnimationId(candidate.id);
                    setPlaying(false);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    candidate.id === animation.id
                      ? "border-indigo-400 bg-indigo-600 text-white"
                      : "border-slate-800 bg-slate-950 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{candidate.name}</span>
                    <span className="font-mono text-[10px] opacity-70">
                      {candidate.durations.length}f · {candidate.directions}d
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Direção</h3>
            <div className="grid grid-cols-4 gap-2">
              {availableDirections.map((item) => (
                <button
                  type="button"
                  key={item.index}
                  onClick={() => {
                    setDirection(item.index);
                    setFrameIndex(0);
                    setPlaying(false);
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                    direction === item.index
                      ? "border-indigo-400 bg-indigo-600"
                      : "border-slate-700 bg-slate-950 text-slate-400"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {animation.name} · {DIRECTIONS[direction]?.name || "Única"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  frame {frameIndex + 1}/{frames.length} · {currentFrame?.duration || 0} ticks
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((value) => !value)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white ${
                    playing ? "bg-rose-600" : "bg-emerald-600"
                  }`}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {playing ? "Pausar animação" : "Reproduzir animação"}
                </button>
                <select
                  value={playbackRate}
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                >
                  <option value={0.5}>0,5×</option>
                  <option value={1}>1× PMD</option>
                  <option value={1.5}>1,5×</option>
                  <option value={2}>2×</option>
                </select>
                <select
                  value={background}
                  onChange={(event) =>
                    setBackground(event.target.value as keyof typeof BACKGROUNDS)
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                >
                  <option value="checker">Transparência</option>
                  <option value="magenta">Magenta</option>
                  <option value="grass">Cenário</option>
                </select>
                <select
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                >
                  {[2, 3, 4, 5, 6, 8, 10, 12].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="relative flex min-h-[430px] items-center justify-center overflow-auto p-8"
              style={{ background: BACKGROUNDS[background] }}
            >
              {visibleUrl ? (
                <div
                  className="relative shrink-0"
                  style={{
                    width: animation.frameWidth * zoom,
                    height: animation.frameHeight * zoom,
                  }}
                >
                  <img
                    src={visibleUrl}
                    alt={`${animation.name} frame ${frameIndex + 1}`}
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  {layer === "sprite" && showAnchors && currentFrame && (
                    <>
                      <span
                        className="pointer-events-none absolute z-10 rounded-full border border-black bg-emerald-400"
                        style={{
                          width: Math.max(5, zoom),
                          height: Math.max(5, zoom),
                          left: currentFrame.origin.x * zoom - zoom / 2,
                          top: currentFrame.origin.y * zoom - zoom / 2,
                        }}
                      />
                      {currentFrame.shadowOrigin && (
                        <span
                          className="pointer-events-none absolute z-10 rounded-full border border-black bg-white"
                          style={{
                            width: Math.max(5, zoom),
                            height: Math.max(5, zoom),
                            left: currentFrame.shadowOrigin.x * zoom - zoom / 2,
                            top: currentFrame.shadowOrigin.y * zoom - zoom / 2,
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded border border-amber-700 bg-amber-950 p-4 text-sm text-amber-100">
                  Esta camada não existe no frame.
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 bg-slate-950/70 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFrameIndex((value) => (value - 1 + frames.length) % frames.length);
                      setPlaying(false);
                    }}
                    className="rounded border border-slate-700 p-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFrameIndex((value) => (value + 1) % frames.length);
                      setPlaying(false);
                    }}
                    className="rounded border border-slate-700 p-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => addFrame(false)}
                    className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" /> Novo
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => addFrame(true)}
                    className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs disabled:opacity-30"
                  >
                    <Copy className="h-4 w-4" /> Duplicar
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => chooseUpload("replace")}
                    className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs disabled:opacity-30"
                  >
                    <Upload className="h-4 w-4" /> Substituir PNG
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => chooseUpload("insert")}
                    className="flex items-center gap-1 rounded border border-slate-700 px-2 py-2 text-xs disabled:opacity-30"
                  >
                    <ImagePlus className="h-4 w-4" /> Inserir PNG
                  </button>
                  <button
                    type="button"
                    disabled={readOnly || frames.length <= 1}
                    onClick={deleteFrame}
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
                    data-studio-frame-index={index}
                    className={`flex h-20 w-20 shrink-0 flex-col rounded-lg border-2 p-1 ${
                      index === frameIndex
                        ? "border-indigo-400 bg-indigo-950"
                        : dragTo === index
                          ? "border-cyan-400 bg-cyan-950"
                          : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFrameIndex(index);
                        setPlaying(false);
                      }}
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
                      <span>{frame.duration}t</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragFrom(index);
                          setDragTo(index);
                        }}
                        onPointerMove={(event) => {
                          if (dragFrom === null) return;
                          const target = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest<HTMLElement>("[data-studio-frame-index]");
                          const next = Number(target?.dataset.studioFrameIndex);
                          if (Number.isInteger(next)) setDragTo(next);
                        }}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                        className="touch-none rounded p-1 disabled:opacity-20"
                      >
                        <GripVertical className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Layers3 className="h-4 w-4 text-indigo-400" /> Camadas
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(["sprite", "offsets", "shadow"] as SpriteSheetLayer[]).map(
                (candidate) => (
                  <button
                    type="button"
                    key={candidate}
                    onClick={() => setLayer(candidate)}
                    className={`rounded border px-2 py-2 text-[11px] capitalize ${
                      layer === candidate
                        ? "border-indigo-400 bg-indigo-600"
                        : "border-slate-700 bg-slate-950 text-slate-400"
                    }`}
                  >
                    {candidate}
                  </button>
                ),
              )}
            </div>
            <label className="mt-3 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Mostrar âncoras
              </span>
              <input
                type="checkbox"
                checked={showAnchors}
                onChange={(event) => setShowAnchors(event.target.checked)}
              />
            </label>
            <button
              type="button"
              onClick={() => void exportCurrentLayer()}
              className="mt-4 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              Baixar camada {layer}
            </button>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Frame atual</h3>
            {readOnly && (
              <p className="mb-3 rounded border border-blue-800 bg-blue-950 p-2 text-[11px] text-blue-200">
                Original remoto protegido. Duplique para alterar frames, duração e âncoras.
              </p>
            )}
            <label className="block text-xs text-slate-400">
              Duração em ticks de 1/60 s
              <input
                type="number"
                min={1}
                max={600}
                value={currentFrame?.duration || 1}
                disabled={readOnly}
                onChange={(event) => updateDuration(Number(event.target.value))}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm disabled:opacity-30"
              />
            </label>

            {(["origin", "shadow"] as const).map((targetKind) => (
              <div key={targetKind} className="mt-4">
                <div className="mb-2 flex justify-between text-[11px] text-slate-400">
                  <span>{targetKind === "origin" ? "Âncora corporal" : "Âncora da sombra"}</span>
                  <span className="font-mono">
                    {targetKind === "origin"
                      ? `${currentFrame?.origin.x ?? "—"}, ${currentFrame?.origin.y ?? "—"}`
                      : `${currentFrame?.shadowOrigin?.x ?? "—"}, ${currentFrame?.shadowOrigin?.y ?? "—"}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span />
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => nudgeAnchor(0, -1, targetKind)}
                    className="rounded border border-slate-700 py-2 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <span />
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => nudgeAnchor(-1, 0, targetKind)}
                    className="rounded border border-slate-700 py-2 disabled:opacity-30"
                  >
                    ←
                  </button>
                  <span className="rounded border border-slate-800 py-2 text-center text-[10px] text-slate-500">
                    1px
                  </span>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => nudgeAnchor(1, 0, targetKind)}
                    className="rounded border border-slate-700 py-2 disabled:opacity-30"
                  >
                    →
                  </button>
                  <span />
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => nudgeAnchor(0, 1, targetKind)}
                    className="rounded border border-slate-700 py-2 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <span />
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
};
