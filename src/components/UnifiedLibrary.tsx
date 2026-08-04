import React, { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Film,
  FolderPlus,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Creature, SourceKind, SpriteCollabIndexItem } from "../types";

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

type SourceFilter = "all" | SourceKind;
const PAGE_SIZE = 48;

function assetProxyUrl(url: string) {
  return `/api/spritecollab/asset?url=${encodeURIComponent(url)}`;
}

function sourceLabel(source: SourceKind) {
  if (source === "remote") return "Remoto";
  if (source === "local") return "Local";
  if (source === "generated") return "Gerado por IA";
  return "ZIP importado";
}

function sourceClasses(source: SourceKind) {
  if (source === "remote") return "border-blue-700/50 bg-blue-950/50 text-blue-200";
  if (source === "local") return "border-emerald-700/50 bg-emerald-950/50 text-emerald-200";
  if (source === "generated") return "border-purple-700/50 bg-purple-950/50 text-purple-200";
  return "border-amber-700/50 bg-amber-950/50 text-amber-200";
}

function matchesQuery(values: Array<string | undefined>, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("pt-BR");
  return values.some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized));
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
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("Minha criatura");
  const [newNumericId, setNewNumericId] = useState("9001");
  const [newFrameSize, setNewFrameSize] = useState<32 | 48 | 64>(48);
  const [newColor, setNewColor] = useState("#facc15");

  useEffect(() => setPage(1), [query, sourceFilter]);

  const filteredLocal = useMemo(
    () =>
      localCreatures.filter((creature) => {
        const sourceMatches =
          sourceFilter === "all" || creature.sourceKind === sourceFilter;
        return (
          sourceMatches &&
          matchesQuery(
            [creature.displayName, creature.numericId, creature.id, creature.species],
            query,
          )
        );
      }),
    [localCreatures, query, sourceFilter],
  );

  const filteredRemote = useMemo(() => {
    if (sourceFilter !== "all" && sourceFilter !== "remote") return [];
    return remoteIndex.filter((item) =>
      matchesQuery([item.name, item.numericId, item.id, item.path], query),
    );
  }, [query, remoteIndex, sourceFilter]);

  const totalRemotePages = Math.max(1, Math.ceil(filteredRemote.length / PAGE_SIZE));
  const safePage = Math.min(page, totalRemotePages);
  const visibleRemote = filteredRemote.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const loadRemote = async (
    item: SpriteCollabIndexItem,
    mode: "open" | "duplicate",
  ) => {
    setLoadingPath(item.path);
    try {
      const creature = await onLoadRemoteCharacter(item.path);
      if (mode === "duplicate") onDuplicateToLocal(creature);
      else onSelectCreature(creature);
    } finally {
      setLoadingPath(null);
    }
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onCreateFromScratch) return;
    setCreating(true);
    try {
      await onCreateFromScratch({
        name: newName,
        numericId: newNumericId,
        frameWidth: newFrameSize,
        frameHeight: newFrameSize,
        primaryColor: newColor,
      });
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-3 md:p-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <FolderPlus className="h-5 w-5 text-indigo-400" /> Biblioteca de personagens
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {localCreatures.length} projetos locais · {remoteIndex.length} formas remotas indexadas
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Criar projeto vazio
            </button>
            <button
              type="button"
              onClick={onSyncRemote}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Sincronizar catálogo
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar por nome, ID ou caminho da forma…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-indigo-500"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-1">
            {(
              ["all", "remote", "local", "generated", "imported"] as SourceFilter[]
            ).map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                  sourceFilter === filter
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {filter === "all" ? "Todos" : sourceLabel(filter)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {filteredLocal.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              Projetos editáveis
            </h3>
            <span className="text-xs text-slate-500">{filteredLocal.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredLocal.map((creature) => {
              const preview = creature.animations[0]?.framesByDirection[0]?.[0]?.dataUrl;
              const confirmingDelete = deleteConfirmId === creature.id;
              return (
                <article
                  key={creature.id}
                  className="flex min-h-64 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] font-bold text-indigo-400">
                        #{creature.numericId}
                      </span>
                      <h4 className="truncate text-sm font-bold text-white">
                        {creature.displayName}
                      </h4>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${sourceClasses(
                        creature.sourceKind,
                      )}`}
                    >
                      {sourceLabel(creature.sourceKind)}
                    </span>
                  </div>

                  <div className="my-3 flex h-32 items-center justify-center rounded-lg border border-slate-800 bg-[repeating-conic-gradient(#172033_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px] p-3">
                    {preview ? (
                      <img
                        src={preview}
                        alt={creature.displayName}
                        className="max-h-full max-w-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <Sparkles className="h-7 w-7 text-slate-700" />
                    )}
                  </div>

                  <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    <span>{creature.animations.length} ações</span>
                    <span>{creature.animations.reduce((sum, animation) => sum + animation.durations.length, 0)} frames/dir.</span>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectCreature(creature)}
                      className="flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      <Film className="h-3.5 w-3.5" /> Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenNpcTest(creature)}
                      className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-semibold hover:bg-slate-700"
                    >
                      <Bot className="h-3.5 w-3.5 text-emerald-400" /> Testar
                    </button>
                    <button
                      type="button"
                      onClick={() => onExportZip(creature)}
                      className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-semibold hover:bg-slate-700"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-400" /> Exportar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmingDelete) {
                          onDeleteCreature(creature.id);
                          setDeleteConfirmId(null);
                        } else {
                          setDeleteConfirmId(creature.id);
                        }
                      }}
                      onBlur={() => setDeleteConfirmId(null)}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold ${
                        confirmingDelete
                          ? "border-rose-500 bg-rose-600 text-white"
                          : "border-rose-900/70 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmingDelete ? "Confirmar" : "Excluir"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(sourceFilter === "all" || sourceFilter === "remote") && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
                Catálogo oficial PMDCollab
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Apenas a página atual é renderizada para não sobrecarregar o tablet.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {filteredRemote.length} resultados · página {safePage}/{totalRemotePages}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {visibleRemote.map((item) => {
              const loading = loadingPath === item.path;
              return (
                <article
                  key={item.path}
                  className="flex min-h-60 flex-col rounded-xl border border-slate-800 bg-slate-900/80 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] font-bold text-blue-400">
                        #{item.numericId}
                      </span>
                      <h4 className="line-clamp-2 text-sm font-bold text-white">{item.name}</h4>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-slate-600">
                        {item.path}
                      </p>
                    </div>
                    {item.phase && (
                      <span className="shrink-0 rounded border border-blue-800/50 bg-blue-950/50 px-1.5 py-0.5 text-[9px] text-blue-200">
                        {item.phase}
                      </span>
                    )}
                  </div>

                  <div className="my-3 flex h-28 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-2">
                    {item.portraitUrl ? (
                      <img
                        src={assetProxyUrl(item.portraitUrl)}
                        alt={item.name}
                        loading="lazy"
                        className="h-20 w-20 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="font-mono text-xs text-slate-600">
                        #{item.numericId}
                      </span>
                    )}
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1 text-[9px] text-slate-500">
                    {item.canon === false && <span>não canônico</span>}
                    {item.shiny && <span>shiny</span>}
                    {item.female && <span>fêmea</span>}
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void loadRemote(item, "open")}
                      className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      <Film className="h-3.5 w-3.5" />
                      {loading ? "Carregando…" : "Visualizar"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void loadRemote(item, "duplicate")}
                      className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5 text-amber-400" /> Copiar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredRemote.length === 0 && !isLoading && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
              Nenhuma forma remota corresponde aos filtros.
            </div>
          )}

          {filteredRemote.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-700 bg-slate-800 p-2 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-28 text-center text-xs text-slate-400">
                {safePage} de {totalRemotePages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalRemotePages}
                onClick={() => setPage((value) => Math.min(totalRemotePages, value + 1))}
                className="rounded-lg border border-slate-700 bg-slate-800 p-2 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={createProject}
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Novo projeto vazio</h3>
                <p className="text-xs text-slate-400">
                  Cria Idle, Walk e Attack transparentes em oito direções.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-slate-400">
                Nome
                <input
                  required
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                ID local
                <input
                  value={newNumericId}
                  onChange={(event) => setNewNumericId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Tamanho lógico do frame
                <select
                  value={newFrameSize}
                  onChange={(event) =>
                    setNewFrameSize(Number(event.target.value) as 32 | 48 | 64)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value={32}>32×32</option>
                  <option value={48}>48×48</option>
                  <option value={64}>64×64</option>
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Cor de referência da paleta
                <input
                  type="color"
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 p-1"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {creating ? "Criando…" : "Criar estrutura"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
