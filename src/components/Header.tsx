import React from "react";
import { Sparkles, Library, Film, Edit3, Bot, Play, Download, Activity, Undo2, Redo2 } from "lucide-react";

export type TabType =
  | "library"
  | "studio"
  | "pixel_editor"
  | "ai_lab"
  | "behavior_lab"
  | "playground"
  | "export_import"
  | "diagnostics";

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  activeCreatureName?: string;
  sourceKind?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeCreatureName,
  sourceKind,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const tabs = [
    { id: "library", label: "Biblioteca Unificada", icon: Library },
    { id: "studio", label: "Estúdio & Animação", icon: Film },
    { id: "pixel_editor", label: "Editor Pixel Art", icon: Edit3 },
    { id: "ai_lab", label: "IA Nano Banana", icon: Sparkles },
    { id: "behavior_lab", label: "NPC & Comportamento", icon: Bot },
    { id: "playground", label: "Playground", icon: Play },
    { id: "export_import", label: "Importar/Exportar", icon: Download },
    { id: "diagnostics", label: "Grafos & Diagnóstico", icon: Activity },
  ];

  const getSourceBadge = (kind?: string) => {
    switch (kind) {
      case "remote":
        return <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-500/30">Remoto</span>;
      case "local":
        return <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded border border-emerald-500/30">Local</span>;
      case "generated":
        return <span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded border border-purple-500/30">Gerado IA</span>;
      case "imported":
        return <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded border border-amber-500/30">Importado</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-md shadow-indigo-950">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-slate-100">SAGA SpriteLab AI</h1>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                v1.0
              </span>
            </div>
            {activeCreatureName && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Ativo: <strong className="text-slate-200">{activeCreatureName}</strong></span>
                {getSourceBadge(sourceKind)}
                
                {/* Global Undo/Redo */}
                {(onUndo || onRedo) && (
                  <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-700">
                    <button
                      onClick={onUndo}
                      disabled={!canUndo}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Desfazer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onRedo}
                      disabled={!canRedo}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Refazer"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 md:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/50"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
