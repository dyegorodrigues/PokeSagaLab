import React, { useState } from "react";
import { Creature, SourceKind, SpriteCollabIndexItem } from "../types";
import { Search, RefreshCw, Copy, Film, Bot, Download, Sparkles, FolderPlus, PlusCircle, X, Trash2 } from "lucide-react";

interface UnifiedLibraryProps {
  remoteIndex: SpriteCollabIndexItem[];
  localCreatures: Creature[];
  onSelectCreature: (creature: Creature) => void;
  onDuplicateToLocal: (creature: Creature) => void;
  onOpenNpcTest: (creature: Creature) => void;
  onExportZip: (creature: Creature) => void;
  onDeleteCreature: (id: string) => void;
  onSyncRemote: () => void;
  onLoadRemoteCharacter: (id: string) => Promise<Creature>;
  onCreateFromScratch?: (params: {
    name: string;
    numericId: string;
    frameWidth: number;
    frameHeight: number;
    primaryColor: string;
  }) => Promise<Creature>;
  isLoading: boolean;
}

export const UnifiedLibrary: React.FC<UnifiedLibraryProps> = ({
  remoteIndex,
  localCreatures,
  onSelectCreature,
  onDuplicateToLocal,
  onOpenNpcTest,
  onExportZip,
  onDeleteCreature,
  onSyncRemote,
  onLoadRemoteCharacter,
  onCreateFromScratch,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<"all" | SourceKind>("all");
  const [loadingCharId, setLoadingCharId] = useState<string | null>(null);

  // Modal "Criar do Zero"
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("Meu Pokémon Original");
  const [newNumId, setNewNumId] = useState("9001");
  const [newGridSize, setNewGridSize] = useState<32 | 48 | 64>(32);
  const [newColor, setNewColor] = useState("#facc15");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateFromScratch) return;
    setIsCreating(true);
    try {
      await onCreateFromScratch({
        name: newName,
        numericId: newNumId,
        frameWidth: newGridSize,
        frameHeight: newGridSize,
        primaryColor: newColor,
      });
      setShowCreateModal(false);
    } catch (err) {
      console.error("Error creating from scratch:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // Combine local and remote items
  const filteredLocal = localCreatures.filter((c) => {
    const matchesSearch =
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.numericId.includes(searchQuery) ||
      c.id.includes(searchQuery);
    const matchesSource =
      selectedSourceFilter === "all" || c.sourceKind === selectedSourceFilter;
    return matchesSearch && matchesSource;
  });

  const filteredRemoteIndex = remoteIndex.filter((item) => {
    if (selectedSourceFilter !== "all" && selectedSourceFilter !== "remote") return false;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.numericId.includes(searchQuery) ||
      item.id.includes(searchQuery);
    // Hide if already locally stored under same id
    const isAlreadyLocal = localCreatures.some((lc) => lc.numericId === item.numericId && lc.sourceKind === "local");
    return matchesSearch && !isAlreadyLocal;
  });

  const handleOpenRemoteItem = async (item: SpriteCollabIndexItem) => {
    setLoadingCharId(item.id);
    try {
      const creature = await onLoadRemoteCharacter(item.id);
      onSelectCreature(creature);
    } catch (err) {
      console.error("Failed to load remote character:", err);
    } finally {
      setLoadingCharId(null);
    }
  };

  const handleDuplicateRemote = async (item: SpriteCollabIndexItem) => {
    setLoadingCharId(item.id);
    try {
      const creature = await onLoadRemoteCharacter(item.id);
      onDuplicateToLocal(creature);
    } catch (err) {
      console.error("Failed to duplicate remote character:", err);
    } finally {
      setLoadingCharId(null);
    }
  };

  const getSourceBadge = (kind: SourceKind) => {
    switch (kind) {
      case "remote":
        return <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-500/30 font-medium">Remoto</span>;
      case "local":
        return <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded border border-emerald-500/30 font-medium">Local</span>;
      case "generated":
        return <span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded border border-purple-500/30 font-medium">IA Nano Banana</span>;
      case "imported":
        return <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded border border-amber-500/30 font-medium font-mono">ZIP Importado</span>;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Search & Action Bar */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-800 p-4 rounded-xl space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              Biblioteca Unificada de Personagens
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Navegue, pesquise e edite personagens do SpriteCollab, cópias locais, gerações com IA e pacotes ZIP importados.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Criar do Zero</span>
            </button>

            <button
              onClick={onSyncRemote}
              disabled={isLoading}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Sincronizar SpriteCollab</span>
            </button>
          </div>
        </div>

        {/* Search Input & Source Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por número (ex: 0025) ou nome (ex: Pikachu)..."
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500 transition placeholder:text-slate-600"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
            {(["all", "remote", "local", "generated", "imported"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedSourceFilter(filter)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition cursor-pointer capitalize whitespace-nowrap ${
                  selectedSourceFilter === filter
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                {filter === "all" ? "Todos" : filter === "remote" ? "Remoto" : filter === "local" ? "Local" : filter === "generated" ? "Gerado IA" : "Importado"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Characters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Local, Generated, Imported Items */}
        {filteredLocal.map((creature) => {
          const animCount = creature.animations.length;
          const firstAnim = creature.animations[0];
          const firstFrameUrl = firstAnim?.framesByDirection?.[0]?.[0]?.dataUrl;

          return (
            <div
              key={creature.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition shadow-lg group relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-indigo-400 block font-semibold">
                    ID #{creature.numericId}
                  </span>
                  <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition">
                    {creature.displayName}
                  </h3>
                </div>
                {getSourceBadge(creature.sourceKind)}
              </div>

              {/* Preview Thumbnail Canvas */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg h-28 flex items-center justify-center p-2 relative overflow-hidden group-hover:border-indigo-900/50 transition">
                {firstFrameUrl ? (
                  <img
                    src={firstFrameUrl}
                    alt={creature.displayName}
                    className="max-h-20 max-w-full object-contain image-pixelated drop-shadow-md"
                  />
                ) : (
                  <div className="text-slate-600 text-xs flex flex-col items-center gap-1">
                    <Sparkles className="w-5 h-5 text-slate-700" />
                    <span>Sem preview</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 right-2 text-[10px] bg-slate-900/90 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  {animCount} animações
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => onSelectCreature(creature)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer min-w-[100px]"
                >
                  <Film className="w-3 h-3" />
                  <span>Abrir</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenNpcTest(creature);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer min-w-[100px]"
                >
                  <Bot className="w-3 h-3 text-emerald-400" />
                  <span>Testar</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateToLocal(creature);
                  }}
                  title="Duplicar"
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-amber-400" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportZip(creature);
                  }}
                  title="Exportar ZIP"
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  <Download className="w-3 h-3 text-blue-400" />
                </button>

                {creature.sourceKind !== "remote" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (deleteConfirmId === creature.id) {
                        onDeleteCreature(creature.id);
                        setDeleteConfirmId(null);
                      } else {
                        setDeleteConfirmId(creature.id);
                        setTimeout(() => setDeleteConfirmId(null), 3000);
                      }
                    }}
                    title="Deletar"
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      deleteConfirmId === creature.id
                        ? "bg-rose-600 text-white border-rose-500"
                        : "bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border-rose-900/50"
                    }`}
                  >
                    {deleteConfirmId === creature.id ? "Confirma?" : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Remote SpriteCollab Index Items */}
        {filteredRemoteIndex.map((item) => {
          const isLoadingThis = loadingCharId === item.id;

          return (
            <div
              key={item.id}
              className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition shadow-md group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-blue-400 block font-semibold">
                    REMOTO #{item.numericId}
                  </span>
                  <h3 className="text-sm font-bold text-slate-200">{item.name}</h3>
                </div>
                {getSourceBadge("remote")}
              </div>

              <div className="bg-slate-950 border border-slate-800/60 rounded-lg h-28 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden group-hover:border-blue-900/50 transition">
                <img
                  src={`https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/${item.id}/Normal.png`}
                  alt={item.name}
                  className="w-12 h-12 object-contain image-pixelated drop-shadow-lg mb-1"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <div className="hidden w-10 h-10 rounded-full bg-blue-950/50 border border-blue-900/40 flex items-center justify-center text-blue-400 font-bold text-xs mb-1">
                  #{item.numericId}
                </div>
                <span className="text-[11px] text-slate-400 font-medium z-10">Repositório PMDCollab</span>
                <span className="text-[10px] text-slate-600 font-mono mt-0.5 z-10">{item.path}</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => handleOpenRemoteItem(item)}
                  disabled={isLoadingThis}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  <Film className="w-3 h-3" />
                  <span>{isLoadingThis ? "Carregando..." : "Abrir"}</span>
                </button>

                <button
                  onClick={() => handleDuplicateRemote(item)}
                  disabled={isLoadingThis}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <Copy className="w-3 h-3 text-emerald-400" />
                  <span>Duplicar Local</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredLocal.length === 0 && filteredRemoteIndex.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-400">Nenhum personagem encontrado para a busca "{searchQuery}".</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedSourceFilter("all");
            }}
            className="text-xs text-indigo-400 hover:underline cursor-pointer"
          >
            Limpar filtros de busca
          </button>
        </div>
      )}

      {/* Modal Criar Personagem do Zero */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                Criar Personagem do Zero
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Nome do Personagem / Pokémon</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: Dragao Flamejante"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">ID Numérico / Código</label>
                  <input
                    type="text"
                    required
                    value={newNumId}
                    onChange={(e) => setNewNumId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="9001"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Dimensão da Grade</label>
                  <select
                    value={newGridSize}
                    onChange={(e) => setNewGridSize(Number(e.target.value) as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <option value={32}>32 x 32 px (Padrão PMD)</option>
                    <option value={48}>48 x 48 px (Médio)</option>
                    <option value={64}>64 x 64 px (Grande)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Cor Primária do Sprite Inicial</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer p-0"
                  />
                  <span className="font-mono text-slate-300">{newColor}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  <span>Criar do Zero</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
