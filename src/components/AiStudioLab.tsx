import React, { useState } from "react";
import { Creature, GenerationPlan } from "../types";
import { cleanImageAlpha, AlphaValidationResult } from "../services/alphaCleaner";
import { LocalStore } from "../stores/localStore";
import { Sparkles, CheckCircle2, XCircle, Sliders, ArrowRight, Layers, RefreshCw } from "lucide-react";

interface AiStudioLabProps {
  creature: Creature;
  initialAnimationName?: string;
  initialDirection?: number;
  onVersionApproved: (updatedCreature: Creature) => void;
}

export const AiStudioLab: React.FC<AiStudioLabProps> = ({
  creature,
  initialAnimationName,
  initialDirection,
  onVersionApproved,
}) => {
  const [promptText, setPromptText] = useState(
    "Variação especial de sprite com chapéu de mago e brilho elétrico em Pixel Art"
  );
  const [targetAnimName, setTargetAnimName] = useState(initialAnimationName || creature.animations[0]?.name || "Walk");
  const [targetDirection, setTargetDirection] = useState(initialDirection ?? 0);

  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(null);
  const [rawGeneratedUrl, setRawGeneratedUrl] = useState<string | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<AlphaValidationResult | null>(null);

  const [matteColor, setMatteColor] = useState("#FF00FF"); // Magenta default
  const [tolerance, setTolerance] = useState(35);

  const [isPlanning, setIsPlanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeAnim = creature.animations.find((a) => a.name === targetAnimName) || creature.animations[0];
  const sourceFrameUrl = activeAnim?.framesByDirection?.[targetDirection]?.[0]?.dataUrl;

  const handleCreatePlan = async () => {
    setIsPlanning(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/gemini/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          targetCreatureId: creature.id,
          targetAnimationName: targetAnimName,
          targetDirection,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha ao gerar o plano");
      setGenerationPlan(data.plan);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleExecuteGeneration = async () => {
    if (!generationPlan) return;
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: generationPlan,
          referenceImage: sourceFrameUrl,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha na geração de imagem com Nano Banana");

      setRawGeneratedUrl(data.rawImageUrl);

      // Run immediate Alpha Cleaner pass
      await runAlphaCleanPass(data.rawImageUrl, matteColor, tolerance);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const runAlphaCleanPass = async (rawUrl: string, mColor: string, tol: number) => {
    setIsCleaning(true);
    try {
      const { cleanedDataUrl, validation } = await cleanImageAlpha(rawUrl, {
        matteColor: mColor,
        tolerance: tol,
        removeFringe: true,
      });
      setCleanedUrl(cleanedDataUrl);
      setValidationResult(validation);
    } catch (err: any) {
      console.error("Alpha cleaning error:", err);
    } finally {
      setIsCleaning(false);
    }
  };

  const [applyToAllDirections, setApplyToAllDirections] = useState(true);

  const handleApproveVersion = async () => {
    if (!cleanedUrl) return;

    // Deep clone creature and append generated frame as new version
    const updatedCreature: Creature = JSON.parse(JSON.stringify(creature));

    if (updatedCreature.sourceKind === "remote") {
      updatedCreature.sourceKind = "generated";
      updatedCreature.id = `generated:${Date.now()}`;
      updatedCreature.displayName += " (Gerado IA)";
    }

    const targetAnimObj = updatedCreature.animations.find((a) => a.name === targetAnimName);
    if (targetAnimObj) {
      if (applyToAllDirections) {
        for (let d = 0; d < 8; d++) {
          if (targetAnimObj.framesByDirection[d]?.[0]) {
            targetAnimObj.framesByDirection[d][0].dataUrl = cleanedUrl;
          }
        }
      } else if (targetAnimObj.framesByDirection[targetDirection]?.[0]) {
        targetAnimObj.framesByDirection[targetDirection][0].dataUrl = cleanedUrl;
      }
    }

    const newVersionId = `vIA_${Date.now()}`;
    updatedCreature.versions.push({
      versionId: newVersionId,
      timestamp: Date.now(),
      description: `Geração Gemini Nano Banana: "${promptText}" (${applyToAllDirections ? "8 Direções Simultâneas" : `Direção ${targetDirection}`})`,
      author: "Gemini Nano Banana",
    });
    updatedCreature.currentVersionId = newVersionId;

    await LocalStore.saveCreature(updatedCreature);
    onVersionApproved(updatedCreature);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 shadow-xl">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Laboratório de Geração e Edição de IA com Nano Banana
        </h2>
        <p className="text-xs text-slate-400">
          Orquestração multimodal de imagens em Pixel Art com controle rigoroso de plano JSON, paleta e limpeza determinística de fundo.
        </p>
      </div>

      {errorMessage && (
        <div className="bg-rose-900/40 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-xl text-xs">
          <strong>Erro na IA:</strong> {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Prompting & Plan Config */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">1. Instrução & Alvo</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Animação</label>
                <select
                  value={targetAnimName}
                  onChange={(e) => setTargetAnimName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5"
                >
                  {creature.animations.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Direção</label>
                <select
                  value={targetDirection}
                  onChange={(e) => setTargetDirection(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      Direção {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-medium block mb-1">
                Prompt de Alteração Visual / Pixel Art
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500"
                placeholder="Descreva a alteração ou pose em pixel art..."
              />
            </div>

            <button
              onClick={handleCreatePlan}
              disabled={isPlanning}
              className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isPlanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              <span>{isPlanning ? "Planejando via Gemini..." : "Gerar Plano de Geração (GenerationPlan)"}</span>
            </button>
          </div>

          {/* Structured Plan JSON Display */}
          {generationPlan && (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-lg">
              <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between">
                <span>2. GenerationPlan Estruturado</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 font-mono">
                  JSON Válido
                </span>
              </h3>

              <pre className="bg-slate-950 p-3 rounded-lg text-[10px] font-mono text-purple-300 overflow-x-auto border border-slate-800">
                {JSON.stringify(generationPlan, null, 2)}
              </pre>

              <button
                onClick={handleExecuteGeneration}
                disabled={isGenerating}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isGenerating ? "Gerando Imagem..." : "Executar Geração com Nano Banana"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Comparison & Alpha Cleaning */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200">3. Comparação & Limpeza Determinística de Alpha</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Original Frame */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block text-center">Original Ref</span>
                <div className="bg-slate-950 border border-slate-800 rounded-lg h-32 flex items-center justify-center p-2">
                  {sourceFrameUrl ? (
                    <img src={sourceFrameUrl} alt="Original" className="max-h-24 max-w-full object-contain image-pixelated" />
                  ) : (
                    <span className="text-slate-600 text-xs">Sem Ref</span>
                  )}
                </div>
              </div>

              {/* Raw Result */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold block text-center">Bruto da IA</span>
                <div className="bg-slate-950 border border-slate-800 rounded-lg h-32 flex items-center justify-center p-2">
                  {rawGeneratedUrl ? (
                    <img src={rawGeneratedUrl} alt="Raw AI" className="max-h-24 max-w-full object-contain image-pixelated" />
                  ) : (
                    <span className="text-slate-600 text-xs">Aguardando geração...</span>
                  )}
                </div>
              </div>

              {/* Cleaned Alpha Result */}
              <div className="space-y-1">
                <span className="text-[10px] text-purple-400 font-semibold block text-center">Alpha Limpo</span>
                <div className="bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px] bg-slate-950 border border-purple-500/40 rounded-lg h-32 flex items-center justify-center p-2 relative">
                  {cleanedUrl ? (
                    <img src={cleanedUrl} alt="Cleaned Alpha" className="max-h-24 max-w-full object-contain image-pixelated drop-shadow-md" />
                  ) : (
                    <span className="text-slate-600 text-xs">Aguardando limpeza...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Alpha Cleaner Settings */}
            {rawGeneratedUrl && (
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    Controles de Inundação de Matte
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Cor de Matte Target</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={matteColor}
                        onChange={(e) => {
                          setMatteColor(e.target.value);
                          if (rawGeneratedUrl) runAlphaCleanPass(rawGeneratedUrl, e.target.value, tolerance);
                        }}
                        className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <span className="font-mono text-slate-300">{matteColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Tolerância ({tolerance})</label>
                    <input
                      type="range"
                      min={5}
                      max={120}
                      value={tolerance}
                      onChange={(e) => {
                        const newTol = Number(e.target.value);
                        setTolerance(newTol);
                        if (rawGeneratedUrl) runAlphaCleanPass(rawGeneratedUrl, matteColor, newTol);
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

                {/* Validation Quality Metrics */}
                {validationResult && (
                  <div className="pt-2 border-t border-slate-800/80 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Validação Técnica de Alpha:</span>
                      {validationResult.isValid ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Alertas Detectados
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400">
                      Transparência: <strong className="text-slate-200">{validationResult.alphaCoveragePercent}%</strong> | Bounding Box:{" "}
                      <strong className="text-slate-200">
                        {validationResult.boundingBox.width}x{validationResult.boundingBox.height}px
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Final Decision Buttons */}
            {cleanedUrl && (
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllDirections}
                    onChange={(e) => setApplyToAllDirections(e.target.checked)}
                    className="accent-indigo-500 rounded cursor-pointer"
                  />
                  <span>Aplicar novo design em <strong>todas as 8 direções</strong> simultaneamente</span>
                </label>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleApproveVersion}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar e Salvar na Biblioteca Local</span>
                  </button>

                  <button
                    onClick={() => {
                      setCleanedUrl(null);
                      setRawGeneratedUrl(null);
                    }}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition cursor-pointer"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
