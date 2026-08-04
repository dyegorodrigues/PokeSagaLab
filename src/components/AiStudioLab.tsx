import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ImagePlus,
  Layers,
  RefreshCw,
  Sparkles,
  Upload,
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

interface Capabilities {
  gemini: boolean;
  mode: "full" | "offline-editor";
  message: string;
}

interface Candidate {
  id: string;
  rawUrl: string;
  cleanedUrl: string;
  normalizedUrl?: string;
  validation: AlphaValidationResult;
  normalizedBoundingBox?: { x: number; y: number; width: number; height: number };
  createdAt: number;
}

const DIRECTIONS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];

function cloneCreature(creature: Creature): Creature {
  if (typeof structuredClone === "function") return structuredClone(creature);
  return JSON.parse(JSON.stringify(creature)) as Creature;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function loadFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler a referência."));
    reader.readAsDataURL(file);
  });
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
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [promptText, setPromptText] = useState(
    "Crie uma variação coerente do frame, preservando exatamente a identidade, silhueta, proporções, paleta, olhos e peso do contorno do personagem.",
  );
  const [targetAnimName, setTargetAnimName] = useState(
    initialAnimationName || creature.animations[0]?.name || "",
  );
  const [targetDirection, setTargetDirection] = useState(initialDirection ?? 0);
  const [targetFrameIndex, setTargetFrameIndex] = useState(0);
  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(null);
  const [matteColor, setMatteColor] = useState("#FF00FF");
  const [tolerance, setTolerance] = useState(35);
  const [uploadedReference, setUploadedReference] = useState<string | null>(null);
  const [useUploadedReference, setUseUploadedReference] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const activeAnimation = useMemo(
    () =>
      creature.animations.find((animation) => animation.name === targetAnimName) ||
      creature.animations[0],
    [creature.animations, targetAnimName],
  );
  const availableDirections =
    activeAnimation?.directions === 1 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const targetFrames = activeAnimation?.framesByDirection[targetDirection] || [];
  const sourceFrame = targetFrames[targetFrameIndex] || targetFrames[0];
  const effectiveReference =
    useUploadedReference && uploadedReference ? uploadedReference : sourceFrame?.dataUrl;
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0],
    [candidates, selectedCandidateId],
  );

  useEffect(() => {
    void fetch("/api/capabilities", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as Capabilities;
      })
      .then(setCapabilities)
      .catch(() =>
        setCapabilities({
          gemini: false,
          mode: "offline-editor",
          message:
            "Não foi possível verificar a IA. O editor, importação e exportação continuam disponíveis.",
        }),
      );
  }, []);

  const resetGeneration = () => {
    setGenerationPlan(null);
    setCandidates([]);
    setSelectedCandidateId(null);
    setError(null);
  };

  useEffect(() => {
    if (!activeAnimation) return;
    if (activeAnimation.directions === 1 && targetDirection !== 0) setTargetDirection(0);
    setTargetFrameIndex(0);
    resetGeneration();
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

  const createPlan = async () => {
    if (!capabilities?.gemini) return;
    setIsPlanning(true);
    setError(null);
    setCandidates([]);
    setSelectedCandidateId(null);
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

  const processRawCandidate = async (rawUrl: string): Promise<Candidate> => {
    const cleaned = await cleanImageAlpha(rawUrl, {
      matteColor,
      tolerance,
      removeFringe: true,
    });
    if (!cleaned.validation.isValid) {
      return {
        id: `candidate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        rawUrl,
        cleanedUrl: cleaned.cleanedDataUrl,
        validation: cleaned.validation,
        createdAt: Date.now(),
      };
    }

    const normalized = await normalizeFrameImage(
      cleaned.cleanedDataUrl,
      cleaned.validation.boundingBox,
      activeAnimation.frameWidth,
      activeAnimation.frameHeight,
      1,
    );
    return {
      id: `candidate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      rawUrl,
      cleanedUrl: cleaned.cleanedDataUrl,
      normalizedUrl: normalized.dataUrl,
      validation: cleaned.validation,
      normalizedBoundingBox: normalized.boundingBox,
      createdAt: Date.now(),
    };
  };

  const generateCandidate = async () => {
    if (!generationPlan || !capabilities?.gemini || !effectiveReference) return;
    setIsGenerating(true);
    setError(null);
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
          referenceImage: effectiveReference,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.rawImageUrl) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setIsProcessing(true);
      const candidate = await processRawCandidate(payload.rawImageUrl);
      setCandidates((previous) => [candidate, ...previous]);
      setSelectedCandidateId(candidate.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsProcessing(false);
      setIsGenerating(false);
    }
  };

  const reprocessCandidate = async () => {
    if (!selectedCandidate) return;
    setIsProcessing(true);
    setError(null);
    try {
      const replacement = await processRawCandidate(selectedCandidate.rawUrl);
      replacement.id = selectedCandidate.id;
      replacement.createdAt = selectedCandidate.createdAt;
      setCandidates((previous) =>
        previous.map((candidate) =>
          candidate.id === selectedCandidate.id ? replacement : candidate,
        ),
      );
    } catch (caught) {
      setError(`Falha no recorte/normalização: ${errorMessage(caught)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const approveCandidate = () => {
    if (
      !selectedCandidate?.normalizedUrl ||
      !selectedCandidate.validation.isValid ||
      !selectedCandidate.normalizedBoundingBox
    ) {
      return;
    }

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
      targetAnimation.copyOf = undefined;
      targetAnimation.sourceAssets = undefined;
      targetAnimation.warnings = [
        ...(targetAnimation.warnings || []),
        "CopyOf convertido em ação independente após edição por IA.",
      ];
    }

    frame.dataUrl = selectedCandidate.normalizedUrl;
    frame.boundingBox = selectedCandidate.normalizedBoundingBox;
    const versionId = `ai_${now}`;
    updated.versions.push({
      versionId,
      timestamp: now,
      description: `IA: ${activeAnimation.name}, direção ${targetDirection}, frame ${
        targetFrameIndex + 1
      } — ${promptText}`,
      author: "Gemini Nano Banana via SAGA SpriteLab",
    });
    updated.currentVersionId = versionId;
    onVersionApproved(updated);
  };

  const uploadReference = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await loadFileAsDataUrl(file);
      setUploadedReference(dataUrl);
      setUseUploadedReference(true);
      resetGeneration();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const canApprove = Boolean(
    selectedCandidate?.normalizedUrl &&
      selectedCandidate.validation.isValid &&
      selectedCandidate.normalizedBoundingBox,
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-3 md:p-6">
      <input
        ref={referenceInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(event) => void uploadReference(event)}
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <WandSparkles className="h-5 w-5 text-purple-400" /> Laboratório de variações por IA
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Trava a referência e o contrato do frame, mantém todas as tentativas organizadas e
          só altera o candidato que você aprovar.
        </p>
      </section>

      {capabilities && !capabilities.gemini && (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/50 p-4 text-sm text-amber-100">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Modo editor sem IA.</strong>
              <p className="mt-1 text-xs text-amber-100/80">{capabilities.message}</p>
              <p className="mt-1 text-xs text-amber-100/70">
                O catálogo, editor, upload, importação, animações e exportação continuam funcionando.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-600/50 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-4 text-sm font-bold text-white">1. Alvo e referência travada</h3>
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
                      {animation.name}
                      {animation.copyOf ? ` (CopyOf ${animation.copyOf})` : ""}
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
                    resetGeneration();
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
                    resetGeneration();
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {targetFrames.map((target, index) => (
                    <option key={target.id} value={index}>
                      {index + 1} · {target.duration} ticks
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setUseUploadedReference(false);
                  resetGeneration();
                }}
                className={`rounded-lg border p-2 text-xs font-semibold ${
                  !useUploadedReference
                    ? "border-indigo-400 bg-indigo-950 text-indigo-100"
                    : "border-slate-700 bg-slate-950 text-slate-400"
                }`}
              >
                Usar frame atual
              </button>
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                className={`flex items-center justify-center gap-1 rounded-lg border p-2 text-xs font-semibold ${
                  useUploadedReference
                    ? "border-indigo-400 bg-indigo-950 text-indigo-100"
                    : "border-slate-700 bg-slate-950 text-slate-400"
                }`}
              >
                <Upload className="h-4 w-4" /> Enviar referência
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1 block text-[10px] uppercase text-slate-500">
                  Frame do projeto
                </span>
                <div className="flex aspect-square items-center justify-center rounded-lg border border-slate-700 bg-slate-950 p-2">
                  <img
                    src={sourceFrame.dataUrl}
                    alt="Frame do projeto"
                    className="max-h-full max-w-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase text-slate-500">
                  Referência ativa
                </span>
                <div className="flex aspect-square items-center justify-center rounded-lg border border-indigo-700 bg-slate-950 p-2">
                  {effectiveReference ? (
                    <img
                      src={effectiveReference}
                      alt="Referência ativa"
                      className="max-h-full max-w-full object-contain"
                      style={{ imageRendering: useUploadedReference ? "auto" : "pixelated" }}
                    />
                  ) : (
                    <span className="text-xs text-slate-600">Sem referência</span>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-2 rounded border border-blue-800/50 bg-blue-950/40 p-2 text-[10px] text-blue-200">
              “Referência travada” mantém a mesma imagem em todas as regenerações. Não é uma seed
              determinística: cada tentativa pode variar, por isso todas ficam guardadas abaixo.
            </p>

            {activeAnimation.copyOf && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-[11px] text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Ao aprovar, esta ação deixará de ser CopyOf e ganhará sheets próprias.
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
              disabled={isPlanning || !promptText.trim() || !capabilities?.gemini}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {isPlanning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Layers className="h-4 w-4" />
              )}
              {isPlanning ? "Planejando…" : "Travar plano e referência"}
            </button>
          </section>

          {generationPlan && (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-bold text-white">2. Gerar variações</h3>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-slate-500">Operação</dt>
                <dd>{generationPlan.operation}</dd>
                <dt className="text-slate-500">Célula</dt>
                <dd className="font-mono">
                  {activeAnimation.frameWidth}×{activeAnimation.frameHeight}px
                </dd>
                <dt className="text-slate-500">Matte</dt>
                <dd className="font-mono">{matteColor}</dd>
                <dt className="text-slate-500">Tentativas</dt>
                <dd>{candidates.length}</dd>
              </dl>
              <button
                type="button"
                onClick={() => void generateCandidate()}
                disabled={isGenerating || !capabilities?.gemini}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : candidates.length ? (
                  <Copy className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating
                  ? "Gerando e processando…"
                  : candidates.length
                    ? "Gerar outra variação"
                    : "Gerar primeira variação"}
              </button>
            </section>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">3. Recorte técnico</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">
                Cor matte
                <input
                  type="color"
                  value={matteColor}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setMatteColor(value);
                    setGenerationPlan((plan) => (plan ? { ...plan, matteColor: value } : plan));
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
              disabled={!selectedCandidate || isProcessing}
              onClick={() => void reprocessCandidate()}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              {isProcessing ? "Processando…" : "Reprocessar candidato selecionado"}
            </button>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Galeria de tentativas</h3>
                <p className="text-[11px] text-slate-500">
                  Regenerar adiciona uma nova opção; não apaga as anteriores.
                </p>
              </div>
              <span className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400">
                {candidates.length} candidato(s)
              </span>
            </div>

            {candidates.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {candidates.map((candidate, index) => (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    className={`rounded-xl border-2 p-2 text-left ${
                      selectedCandidate?.id === candidate.id
                        ? "border-indigo-400 bg-indigo-950/40"
                        : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:18px_18px] p-2">
                      <img
                        src={candidate.normalizedUrl || candidate.cleanedUrl || candidate.rawUrl}
                        alt={`Candidato ${candidates.length - index}`}
                        className="max-h-full max-w-full object-contain"
                        style={{ imageRendering: candidate.normalizedUrl ? "pixelated" : "auto" }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-300">
                        Tentativa {candidates.length - index}
                      </span>
                      <span
                        className={
                          candidate.validation.isValid ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {candidate.validation.isValid ? "válida" : "revisar"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center">
                <ImagePlus className="h-9 w-9 text-slate-600" />
                <p className="mt-2 text-sm text-slate-400">
                  Trave o plano e gere a primeira variação.
                </p>
              </div>
            )}
          </section>

          {selectedCandidate && (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Candidato selecionado</h3>
                  <p className="text-[11px] text-slate-500">
                    Compare a referência, saída bruta e célula final.
                  </p>
                </div>
                <span
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                    selectedCandidate.validation.isValid
                      ? "border-emerald-700 bg-emerald-950/50 text-emerald-200"
                      : "border-rose-700 bg-rose-950/50 text-rose-200"
                  }`}
                >
                  {selectedCandidate.validation.isValid ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {selectedCandidate.validation.isValid ? "Alpha válido" : "Revisão necessária"}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { title: "Referência travada", url: effectiveReference, pixelated: !useUploadedReference },
                  { title: "Saída bruta", url: selectedCandidate.rawUrl, pixelated: false },
                  {
                    title: "Frame normalizado",
                    url: selectedCandidate.normalizedUrl,
                    pixelated: true,
                  },
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
                          style={{ imageRendering: item.pixelated ? "pixelated" : "auto" }}
                        />
                      ) : (
                        <span className="text-xs text-slate-600">Não disponível</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {selectedCandidate.validation.issues.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-lg border border-rose-800/50 bg-rose-950/40 p-3 text-xs text-rose-100">
                  {selectedCandidate.validation.issues.map((issue) => (
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
                  {creature.sourceKind === "remote" &&
                    " O original remoto será preservado em uma cópia local."}
                </p>
              </div>
              <button
                type="button"
                disabled={!canApprove}
                onClick={approveCandidate}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" /> Aprovar candidato escolhido
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
