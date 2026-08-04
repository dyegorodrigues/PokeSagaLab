import React, { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  Grid3X3,
  Layers3,
  Pause,
  Play,
  Sparkles,
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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
  const [playing, setPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(5);
  const [background, setBackground] = useState<keyof typeof BACKGROUNDS>("checker");
  const [layer, setLayer] = useState<SpriteSheetLayer>("sprite");
  const [showAnchors, setShowAnchors] = useState(true);
  const [showAllDirections, setShowAllDirections] = useState(false);
  const [exporting, setExporting] = useState(false);

  const animation = useMemo(
    () =>
      creature.animations.find((candidate) => candidate.id === selectedAnimationId) ||
      creature.animations[0],
    [creature.animations, selectedAnimationId],
  );
  const availableDirections = animation?.directions === 1 ? DIRECTIONS.slice(0, 1) : DIRECTIONS;
  const frames = animation?.framesByDirection[direction] || [];
  const currentFrame = frames[frameIndex] || frames[0];
  const readOnly = creature.sourceKind === "remote";

  useEffect(() => {
    const stillExists = creature.animations.some(
      (candidate) => candidate.id === selectedAnimationId,
    );
    if (!stillExists) setSelectedAnimationId(creature.animations[0]?.id || "");
  }, [creature.animations, selectedAnimationId]);

  useEffect(() => {
    if (!animation) return;
    if (animation.directions === 1 && direction !== 0) setDirection(0);
    if (animation.directions === 8 && direction > 7) setDirection(0);
    setFrameIndex(0);
  }, [animation?.id, animation?.directions]);

  useEffect(() => {
    if (!playing || !currentFrame || frames.length <= 1) return;
    // PMD durations are expressed in 1/60-second ticks.
    const durationMs = Math.max(
      1,
      (currentFrame.duration * 1000) / 60 / Math.max(playbackRate, 0.1),
    );
    const timer = window.setTimeout(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [currentFrame, frames.length, playing, playbackRate]);

  if (!animation) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 p-5 text-amber-100">
          Este personagem não possui animações carregadas.
        </div>
      </div>
    );
  }

  const updateDuration = (nextDuration: number) => {
    if (readOnly || !onUpdateCreature || !Number.isInteger(nextDuration) || nextDuration < 1) {
      return;
    }
    const updated = cloneCreature(creature);
    const target = updated.animations.find((candidate) => candidate.id === animation.id);
    if (!target) return;
    target.durations[frameIndex] = nextDuration;
    for (let index = 0; index < target.directions; index += 1) {
      const frame = target.framesByDirection[index]?.[frameIndex];
      if (frame) frame.duration = nextDuration;
    }
    onUpdateCreature(updated);
  };

  const nudgeAnchor = (x: number, y: number, target: "origin" | "shadow") => {
    if (readOnly || !onUpdateCreature || !currentFrame) return;
    const updated = cloneCreature(creature);
    const targetAnimation = updated.animations.find(
      (candidate) => candidate.id === animation.id,
    );
    const frame = targetAnimation?.framesByDirection[direction]?.[frameIndex];
    if (!frame) return;

    if (target === "origin") {
      frame.origin = { x: frame.origin.x + x, y: frame.origin.y + y };
      frame.offsetsDataUrl = undefined;
    } else {
      const current = frame.shadowOrigin || frame.origin;
      frame.shadowOrigin = { x: current.x + x, y: current.y + y };
      frame.shadowDataUrl = undefined;
    }
    onUpdateCreature(updated);
  };

  const exportCurrentLayer = async () => {
    setExporting(true);
    try {
      const dataUrl = await assembleSpriteSheet(
        animation.framesByDirection,
        animation.frameWidth,
        animation.frameHeight,
        animation.directions,
        layer,
      );
      const suffix =
        layer === "sprite" ? "Anim" : layer === "offsets" ? "Offsets" : "Shadow";
      downloadDataUrl(
        dataUrl,
        `${creature.numericId}-${animation.name}-${suffix}.png`,
      );
    } finally {
      setExporting(false);
    }
  };

  const visibleUrl = frameLayerUrl(currentFrame, layer);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
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
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicar para editar
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenPixelEditor(creature, animation.id, frameIndex, direction)
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
            >
              <Edit3 className="h-3.5 w-3.5 text-amber-400" /> Editar frame
            </button>
            <button
              type="button"
              onClick={() => onOpenAiLab(creature, animation.name, direction)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500"
            >
              <Sparkles className="h-3.5 w-3.5" /> Gerar com IA
            </button>
            <button
              type="button"
              onClick={() => onOpenNpcTest(creature)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
            >
              <Bot className="h-3.5 w-3.5 text-emerald-400" /> Testar NPC
            </button>
            <button
              type="button"
              onClick={() => onExportZip(creature)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-blue-400" /> Exportar pacote
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_290px]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Ações</h3>
              <span className="font-mono text-[11px] text-slate-500">
                {creature.animations.length}
              </span>
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {creature.animations.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => setSelectedAnimationId(candidate.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    candidate.id === animation.id
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{candidate.name}</span>
                    <span className="font-mono text-[10px] opacity-70">
                      {candidate.durations.length}f · {candidate.directions}d
                    </span>
                  </div>
                  {candidate.copyOf && (
                    <span className="mt-1 block text-[10px] opacity-75">
                      CopyOf: {candidate.copyOf}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Direção PMD</h3>
            <div className="grid grid-cols-4 gap-2">
              {availableDirections.map((item) => (
                <button
                  type="button"
                  key={item.index}
                  title={item.name}
                  onClick={() => {
                    setDirection(item.index);
                    setFrameIndex(0);
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                    item.index === direction
                      ? "border-indigo-400 bg-indigo-600 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-400 hover:text-white"
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
                  {animation.frameWidth}×{animation.frameHeight}px · frame {frameIndex + 1}/
                  {frames.length} · {currentFrame?.duration || 0} ticks
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((value) => !value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 p-2 hover:bg-slate-700"
                >
                  {playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
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
                  {[2, 3, 4, 5, 6, 8, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="relative flex min-h-[420px] items-center justify-center overflow-auto p-8"
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
                        title="Origem corporal (verde)"
                        className="pointer-events-none absolute z-10 block rounded-full border border-black bg-emerald-400"
                        style={{
                          width: Math.max(4, zoom),
                          height: Math.max(4, zoom),
                          left: currentFrame.origin.x * zoom - zoom / 2,
                          top: currentFrame.origin.y * zoom - zoom / 2,
                        }}
                      />
                      {currentFrame.shadowOrigin && (
                        <span
                          title="Origem da sombra (branca)"
                          className="pointer-events-none absolute z-10 block rounded-full border border-black bg-white"
                          style={{
                            width: Math.max(4, zoom),
                            height: Math.max(4, zoom),
                            left: currentFrame.shadowOrigin.x * zoom - zoom / 2,
                            top: currentFrame.shadowOrigin.y * zoom - zoom / 2,
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-700/50 bg-amber-950/60 p-4 text-sm text-amber-100">
                  A camada {layer} não existe neste frame.
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 overflow-x-auto border-t border-slate-800 bg-slate-950/70 px-4 py-3">
              <button
                type="button"
                onClick={() => setFrameIndex((value) => (value - 1 + frames.length) % frames.length)}
                disabled={!frames.length}
                className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
                {frames.map((frame, index) => (
                  <button
                    type="button"
                    key={frame.id}
                    onClick={() => setFrameIndex(index)}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900 p-1 ${
                      index === frameIndex
                        ? "border-indigo-400"
                        : "border-slate-800 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Frame ${index + 1}`}
                      className="h-full w-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <span className="absolute bottom-0 right-0 bg-black/80 px-1 font-mono text-[9px]">
                      {frame.duration}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFrameIndex((value) => (value + 1) % frames.length)}
                disabled={!frames.length}
                className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          {showAllDirections && animation.directions === 8 && (
            <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-4">
              {DIRECTIONS.map((item) => {
                const frame = animation.framesByDirection[item.index]?.[frameIndex];
                return (
                  <button
                    type="button"
                    key={item.index}
                    onClick={() => setDirection(item.index)}
                    className={`rounded-lg border p-3 ${
                      direction === item.index
                        ? "border-indigo-500 bg-indigo-950/50"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <span className="mb-2 block text-xs font-bold text-slate-300">
                      {item.label}
                    </span>
                    {frame && (
                      <img
                        src={frame.dataUrl}
                        alt={item.name}
                        className="mx-auto h-20 w-20 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    )}
                  </button>
                );
              })}
            </section>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Layers3 className="h-4 w-4 text-indigo-400" /> Camadas técnicas
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(["sprite", "offsets", "shadow"] as SpriteSheetLayer[]).map(
                (candidate) => (
                  <button
                    type="button"
                    key={candidate}
                    onClick={() => setLayer(candidate)}
                    className={`rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize ${
                      layer === candidate
                        ? "border-indigo-400 bg-indigo-600 text-white"
                        : "border-slate-700 bg-slate-950 text-slate-400"
                    }`}
                  >
                    {candidate}
                  </button>
                ),
              )}
            </div>
            <label className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5" /> Mostrar âncoras
              </span>
              <input
                type="checkbox"
                checked={showAnchors}
                onChange={(event) => setShowAnchors(event.target.checked)}
              />
            </label>
            <label className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <Grid3X3 className="h-3.5 w-3.5" /> Oito direções
              </span>
              <input
                type="checkbox"
                checked={showAllDirections}
                disabled={animation.directions !== 8}
                onChange={(event) => setShowAllDirections(event.target.checked)}
              />
            </label>
            <button
              type="button"
              onClick={() => void exportCurrentLayer()}
              disabled={exporting}
              className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              {exporting ? "Gerando PNG…" : `Baixar camada ${layer}`}
            </button>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Frame atual</h3>
            {readOnly && (
              <p className="mb-3 rounded border border-blue-800/60 bg-blue-950/50 p-2 text-[11px] text-blue-200">
                Asset remoto em modo leitura. Duplique para alterar duração e âncoras.
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
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
              />
            </label>

            <div className="mt-4 space-y-3">
              {(["origin", "shadow"] as const).map((target) => (
                <div key={target}>
                  <div className="mb-2 flex justify-between text-[11px] text-slate-400">
                    <span>{target === "origin" ? "Âncora corporal" : "Âncora da sombra"}</span>
                    <span className="font-mono">
                      {target === "origin"
                        ? `${currentFrame?.origin.x ?? "—"}, ${currentFrame?.origin.y ?? "—"}`
                        : `${currentFrame?.shadowOrigin?.x ?? "—"}, ${currentFrame?.shadowOrigin?.y ?? "—"}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span />
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => nudgeAnchor(0, -1, target)}
                      className="rounded border border-slate-700 bg-slate-950 py-1 text-xs disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <span />
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => nudgeAnchor(-1, 0, target)}
                      className="rounded border border-slate-700 bg-slate-950 py-1 text-xs disabled:opacity-30"
                    >
                      ←
                    </button>
                    <span className="rounded border border-slate-800 bg-slate-950 py-1 text-center text-[10px] text-slate-600">
                      1px
                    </span>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => nudgeAnchor(1, 0, target)}
                      className="rounded border border-slate-700 bg-slate-950 py-1 text-xs disabled:opacity-30"
                    >
                      →
                    </button>
                    <span />
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => nudgeAnchor(0, 1, target)}
                      className="rounded border border-slate-700 bg-slate-950 py-1 text-xs disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <span />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(animation.warnings?.length || animation.copyOf) && (
            <section className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-300">
                Diagnóstico
              </h3>
              <ul className="space-y-1 text-[11px] text-amber-100/80">
                {animation.copyOf && <li>• CopyOf: {animation.copyOf}</li>}
                {animation.warnings?.map((warning, index) => (
                  <li key={`${warning}-${index}`}>• {warning}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
