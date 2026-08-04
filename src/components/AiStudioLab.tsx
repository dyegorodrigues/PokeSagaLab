import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  RefreshCw,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { Creature, GenerationPlan } from "../types";
import {
  AlphaValidationResult,
  cleanImageAlpha,
  normalizeFrameImage,
} from "../services/alphaCleaner";

interface AiStudioLabProps {
  creature: Creature;
  initialAnimationName?: string;
  initialDirection?: number;
  onVersionApproved: (updatedCreature: Creature) => void;
}

const DIRECTIONS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];

function cloneCreature(creature: Creature): Creature {
  if (typeof structuredClone === "function") return structuredClone(creature);
  return JSON.parse(JSON.stringify(creature)) as Creature;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function migrateGeneratedIds(creature: Creature, newCreatureId: string) {
  for (const animation of creature.animations) {
    const newAnimationId = `${newCreatureId}_${animation.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")}`;
    animation.id = newAnimationId;
    for (const [direction, frames] of Object.entries(animation.framesByDirection)) {
      frames.forEach((frame, frameIndex) => {
        frame.id = `${newAnimationId}_d${direction}_f${frameIndex}`;
        frame.animationId = newAnimationId;
      });
    }
  }
}

export const AiStudioLab: React.FC<AiStudioLabProps> = ({
  creature,
  initialAnimationName,
  initialDirection,
  onVersionApproved,
}) => {
  const [promptText, setPromptText] = useState(
    "Crie uma variação coerente do frame, preservando exatamente a identidade, silhueta, proporções, paleta e contorno do personagem.",
  );
  const [targetAnimName, setTargetAnimName] = useState(
    initialAnimationName || creature.animations[0]?.name || "",
  );
  const [targetDirection, setTargetDirection] = useState(initialDirection ?? 0);
  const [targetFrameIndex, setTargetFrameIndex] = useState(0);
  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(null);
  const [rawGeneratedUrl, setRawGeneratedUrl] = useState<string | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [normalizedUrl, setNormalizedUrl] = useState<string | null>(null);
  const [normalizedBoundingBox, setNormalizedBoundingBox] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);
  const [validationResult, setValidationResult] =
    useState<AlphaValidationResult | null>(null);
  const [matteColor, setMatteColor] = useState("#FF00FF");
  const [tolerance, setTolerance] = useState(35);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAnimation = useMemo(
    () =>
      creature.animations.find((animation) => animation.name === targetAnimName) ||
      creature.animations[0],
    [creature.animations, targetAnimName],
  );
  const availableDirections = activeAnimation?.directions === 1 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const targetFrames = activeAnimation?.framesByDirection[targetDirection] || [];
  const sourceFrame = targetFrames[targetFrameIndex] || targetFrames[0];

  useEffect(() => {
    if (!activeAnimation) return;
    if (activeAnimation.directions === 1 && targetDirection !== 0) setTargetDirection(0);
    setTargetFrameIndex(0);
    setGenerationPlan(null);
    setRawGeneratedUrl(null);
    setCleanedUrl(null);
    setNormalizedUrl(null);
    setValidationResult(null);
  }, [activeAnimation?.id, activeAnimation?.directions]);

  useEffect(() => {
    if (targetFrameIndex >= targetFrames.length) setTargetFrameIndex(0);
  }, [targetFrameIndex, targetFrames.length]);

  if (!activeAnimation || !sourceFrame) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/50 p-5 text-amber-100">
          Não existe um frame válido para usar como referência de geração.
        </div>
      </div>
    );
  }

  const resetResult = () => {
    setRawGeneratedUrl(null);
    setCleanedUrl(null);
    setNormalizedUrl(null);
    setNormalizedBoundingBox(null);
    setValidationResult(null);
  };

  const createPlan = async () => {
    setIsPlanning(true);
    setError(null);
    resetResult();
    try {
      const response = await fetch("/api/gemini/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          targetCreatureId: creature.id,
          targetAnimationName: activeAnimation.name,
          targetDirection,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const plan = payload.plan as GenerationPlan;
      // The logical frame contract always comes from the selected PMD animation,
      // never from an unconstrained model suggestion.
      setGenerationPlan({
        ...plan,
        targetCreatureId: creature.id,
        targetAnimationName: activeAnimation.name,
        targetDirection,
        expectedFrameCount: 1,
        frameWidth: activeAnimation.frameWidth,
        frameHeight: activeAnimation.frameHeight,
        matteColor,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsPlanning(false);
    }
  };

  const processGeneratedImage = async (
    rawUrl: string,
    selectedMatte = matteColor,
    selectedTolerance = tolerance,
  ) => {
    setIsProcessing(true);
    setError(null);
    try {
      const cleaned = await cleanImageAlpha(rawUrl, {
        matteColor: selectedMatte,
        tolerance: selectedTolerance,
        removeFringe: true,
      });
      setCleanedUrl(cleaned.cleanedDataUrl);
      setValidationResult(cleaned.validation);
      if (!cleaned.validation.isValid) {
        setNormalizedUrl(null);
        setNormalizedBoundingBox(null);
        return;
      }

      const normalized = await normalizeFrameImage(
        cleaned.cleanedDataUrl,
        cleaned.validation.boundingBox,
        activeAnimation.frameWidth,
        activeAnimation.frameHeight,
        1,
      );
      setNormalizedUrl(normalized.dataUrl);
      setNormalizedBoundingBox(normalized.boundingBox);
    } catch (caught) {
      setNormalizedUrl(null);
      setError(`Falha no recorte/normalização: ${errorMessage(caught)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeGeneration = async () => {
    if (!generationPlan) return;
    setIsGenerating(true);
    setError(null);
    resetResult();
    try {
      const effectivePlan: GenerationPlan = {
        ...generationPlan,
        targetAnimationName: activeAnimation.name,
        targetDirection,
        frameWidth: activeAnimation.frameWidth,
        frameHeight: activeAnimation.frameHeight,
        expectedFrameCount: 1,
        matteColor,
      };
      const response = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: effectivePlan,
          referenceImage: sourceFrame.dataUrl,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.rawImageUrl) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setRawGeneratedUrl(payload.rawImageUrl);
      await processGeneratedImage(payload.rawImageUrl);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsGenerating(false);
    }
  };

  const approveVersion = () => {
    if (!normalizedUrl || !validationResult?.isValid || !normalizedBoundingBox) return;
    const updated = cloneCreature(creature);
    const now = Date.now();
    const originalCreatureId = updated.id;

    if (updated.sourceKind === "remote") {
      const newId = `generated:${now}_${Math.random().toString(36).slice(2, 8)}`;
      updated.id = newId;
      updated.sourceKind = "generated";
      updated.sourceRef = originalCreatureId;
      updated.displayName = `${updated.displayName} (Variação IA)`;
      updated.provenance = {
        ...updated.provenance,
        origin: `${updated.provenance.origin} → variação gerada no SAGA SpriteLab`,
        parentCreatureId: originalCreatureId,
        promptUsed: promptText,
        createdAt: now,
        updatedAt: now,
      };
      migrateGeneratedIds(updated, newId);
    } else {
      updated.provenance = {
        ...updated.provenance,
        promptUsed: promptText,
        updatedAt: now,
      };
    }

    const targetAnimation = updated.animations.find(
      (animation) => animation.name === activeAnimation.name,
    );
    const frame = targetAnimation?.framesByDirection[targetDirection]?.[targetFrameIndex];
    if (!targetAnimation || !frame) {
      setError("O frame alvo desapareceu antes da aprovação.");
      return;
    }

    if (targetAnimation.copyOf) {
      // A changed alias can no longer remain CopyOf, otherwise PMD export would
      // intentionally omit its sheets and discard this edit.
      targetAnimation.copyOf = undefined;
      targetAnimation.sourceAssets = undefined;
      targetAnimation.warnings = [
        ...(targetAnimation.warnings || []),
        "CopyOf convertido em ação independente após edição por IA.",
      ];
    }

    frame.dataUrl = normalizedUrl;
    frame.boundingBox = normalizedBoundingBox;
    const versionId = `ai_${now}`;
    updated.versions.push({
      versionId,
      timestamp: now,
      description: `IA: ${activeAnimation.name}, direção ${targetDirection}, frame ${targetFrameIndex + 1} — ${promptText}`,
      author: "Gemini Nano Banana via SAGA SpriteLab",
    });
    updated.currentVersionId = versionId;
    onVersionApproved(updated);
  };

  const canApprove = Boolean(
    normalizedUrl && validationResult?.isValid && normalizedBoundingBox,
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-3 md:p-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <WandSparkles className="h-5 w-5 text-purple-400" /> Laboratório de IA por frame
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Gera uma única célula, recorta o matte, normaliza para {activeAnimation.frameWidth}×
          {activeAnimation.frameHeight}px e altera somente o frame selecionado.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-600/50 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-4 text-sm font-bold text-white">1. Alvo exato</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs text-slate-400">
                Animação
                <select
                  value={activeAnimation.name}
                  onChange={(event) => setTargetAnimName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {creature.animations.map((animation) => (
                    <option key={animation.id} value={animation.name}>
                      {animation.name}{animation.copyOf ? ` (CopyOf ${animation.copyOf})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Direção
                <select
                  value={targetDirection}
                  onChange={(event) => {
                    setTargetDirection(Number(event.target.value));
                    setTargetFrameIndex(0);
                    setGenerationPlan(null);
                    resetResult();
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {availableDirections.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}: {DIRECTIONS[direction]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Frame
                <select
                  value={targetFrameIndex}
                  onChange={(event) => {
                    setTargetFrameIndex(Number(event.target.value));
                    setGenerationPlan(null);
                    resetResult();
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {targetFrames.map((frame, index) => (
                    <option key={frame.id} value={index}>
                      {index + 1} · {frame.duration} ticks
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeAnimation.copyOf && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-[11px] text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Ao aprovar, esta ação deixará de ser CopyOf e ganhará sheets próprias para que a edição não seja perdida no export.
              </div>
            )}

            <label className="mt-4 block text-xs text-slate-400">
              Alteração desejada
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-purple-500"
              />
            </label>

            <button
              type="button"
              onClick={() => void createPlan()}
              disabled={isPlanning || !promptText.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {isPlanning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Layers className="h-4 w-4" />
              )}
              {isPlanning ? "Planejando…" : "Criar plano técnico"}
            </button>
          </section>

          {generationPlan && (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-bold text-white">2. Contrato de geração</h3>
              <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-slate-500">Operação</dt>
                <dd className="text-slate-200">{generationPlan.operation}</dd>
                <dt className="text-slate-500">Célula lógica</dt>
                <dd className="font-mono text-slate-200">
                  {activeAnimation.frameWidth}×{activeAnimation.frameHeight}px
                </dd>
                <dt className="text-slate-500">Matte</dt>
                <dd className="font-mono text-slate-200">{matteColor}</dd>
                <dt className="text-slate-500">Estilo</dt>
                <dd className="text-slate-200">{generationPlan.styleNotes}</dd>
              </dl>
              <button
                type="button"
                onClick={() => void executeGeneration()}
                disabled={isGenerating}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? "Gerando…" : "Gerar imagem"}
              </button>
            </section>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">3. Recorte de fundo</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">
                Cor matte
                <input
                  type="color"
                  value={matteColor}
                  onChange={(event) => {
                    setMatteColor(event.target.value.toUpperCase());
                    setGenerationPlan((plan) =>
                      plan ? { ...plan, matteColor: event.target.value.toUpperCase() } : plan,
                    );
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 p-1"
                />
              </label>
              <label className="text-xs text-slate-400">
                Tolerância: {tolerance}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tolerance}
                  onChange={(event) => setTolerance(Number(event.target.value))}
                  className="mt-3 w-full"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!rawGeneratedUrl || isProcessing}
              onClick={() =>
                rawGeneratedUrl && void processGeneratedImage(rawGeneratedUrl, matteColor, tolerance)
              }
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"
            >
              {isProcessing ? "Processando…" : "Reprocessar recorte e escala"}
            </button>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Comparação do frame</h3>
                <p className="text-[11px] text-slate-500">
                  O resultado final é normalizado antes de entrar no projeto.
                </p>
              </div>
              {validationResult && (
                <span
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                    validationResult.isValid
                      ? "border-emerald-700 bg-emerald-950/50 text-emerald-200"
                      : "border-rose-700 bg-rose-950/50 text-rose-200"
                  }`}
                >
                  {validationResult.isValid ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {validationResult.isValid ? "Alpha válido" : "Revisão necessária"}
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: "Referência", url: sourceFrame.dataUrl },
                { title: "Saída bruta", url: rawGeneratedUrl },
                { title: "Frame normalizado", url: normalizedUrl },
              ].map((item) => (
                <div key={item.title}>
                  <h4 className="mb-2 text-center text-xs font-semibold text-slate-300">
                    {item.title}
                  </h4>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:18px_18px] p-3">
                    {item.url ? (
                      <img
                        src={item.url}
                        alt={item.title}
                        className="max-h-full max-w-full object-contain"
                        style={{ imageRendering: item.title === "Saída bruta" ? "auto" : "pixelated" }}
                      />
                    ) : (
                      <span className="text-center text-xs text-slate-600">Ainda não disponível</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {validationResult && (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-bold text-white">Validação técnica</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <span className="block text-[10px] uppercase text-slate-500">Transparência</span>
                  <strong className="text-lg text-white">
                    {validationResult.alphaCoveragePercent}%
                  </strong>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <span className="block text-[10px] uppercase text-slate-500">Bounding box fonte</span>
                  <strong className="font-mono text-sm text-white">
                    {validationResult.boundingBox.width}×{validationResult.boundingBox.height}
                  </strong>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <span className="block text-[10px] uppercase text-slate-500">Saída lógica</span>
                  <strong className="font-mono text-sm text-white">
                    {activeAnimation.frameWidth}×{activeAnimation.frameHeight}
                  </strong>
                </div>
              </div>
              {validationResult.issues.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg border border-rose-800/50 bg-rose-950/40 p-3 text-xs text-rose-100">
                  {validationResult.issues.map((issue) => (
                    <li key={issue}>• {issue}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold text-white">4. Aprovação controlada</h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  Altera apenas {activeAnimation.name}, direção {targetDirection}, frame {targetFrameIndex + 1}.
                  {creature.sourceKind === "remote" && " O asset remoto será copiado para um projeto gerado local."}
                </p>
              </div>
              <button
                type="button"
                disabled={!canApprove}
                onClick={approveVersion}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" /> Aprovar este frame
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
