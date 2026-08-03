import React, { useState, useEffect } from "react";
import { Activity, CheckCircle2, Server, Database, Code, FileText, Cpu } from "lucide-react";

export const DiagnosticsPanel: React.FC = () => {
  const [requirementsGraph, setRequirementsGraph] = useState<any[]>([]);
  const [verificationGraph, setVerificationGraph] = useState<any[]>([]);
  const [serverStatus, setServerStatus] = useState<any>(null);

  useEffect(() => {
    // Load verification & requirements graphs
    fetch("/docs/graphs/requirements.graph.json")
      .then((r) => r.json())
      .then((d) => setRequirementsGraph(d))
      .catch(() => {});

    fetch("/docs/graphs/verification.graph.json")
      .then((r) => r.json())
      .then((d) => setVerificationGraph(d))
      .catch(() => {});

    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setServerStatus(d))
      .catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 shadow-xl">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          Painel de Diagnóstico & Engenharia de Grafos
        </h2>
        <p className="text-xs text-slate-400">
          Rastreabilidade ponta a ponta dos grafos de requisitos, artefatos, domínio e verificação técnica.
        </p>
      </div>

      {/* System Health Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
            <Server className="w-3.5 h-3.5 text-emerald-400" /> Servidor Express Full-Stack
          </span>
          <div className="text-sm font-bold text-slate-100">
            {serverStatus ? serverStatus.status.toUpperCase() : "VERIFICANDO..."}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Porta 3000 / Host 0.0.0.0</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
            <Database className="w-3.5 h-3.5 text-indigo-400" /> Armazenamento Local
          </span>
          <div className="text-sm font-bold text-slate-100">IndexedDB LocalStore</div>
          <span className="text-[10px] text-slate-500 font-mono">Persistência Local Autônoma</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
            <Cpu className="w-3.5 h-3.5 text-purple-400" /> Orquestração Gemini IA
          </span>
          <div className="text-sm font-bold text-slate-100">Nano Banana + Flash</div>
          <span className="text-[10px] text-slate-500 font-mono">ModelRegistry Server-Side</span>
        </div>
      </div>

      {/* Verification Graph Cards */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-xl">
        <h3 className="text-sm font-bold text-slate-200">Grafo de Verificação Técnica & Fluxo Vertical</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {verificationGraph.map((item, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-indigo-400">{item.requirementId}</span>
                {item.verified ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> VERIFICADO
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                    EM TESTE
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-300">
                Artefatos: <span className="font-mono text-slate-400">{item.implementationArtifacts.join(", ")}</span>
              </div>

              <div className="text-[11px] text-slate-400 italic bg-slate-900/60 p-2 rounded border border-slate-800/80">
                "{item.evidence?.[0] || "Evidência registrada"}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
