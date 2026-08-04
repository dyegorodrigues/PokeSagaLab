import React, { useEffect, useState } from "react";
import { Header, TabType } from "./components/Header";
import { UnifiedLibrary } from "./components/UnifiedLibrary";
import { AnimationStudio } from "./components/AnimationStudio";
import { PixelEditor } from "./components/PixelEditor";
import { AiStudioLab } from "./components/AiStudioLab";
import { BehaviorLab } from "./components/BehaviorLab";
import { ImportExportModal } from "./components/ImportExportModal";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import {
  Animation,
  Creature,
  Frame,
  SpriteCollabActionAsset,
  SpriteCollabIndexItem,
} from "./types";
import {
  ParsedAnimationDefinition,
  parseAnimDataXml,
  sliceSpriteSheet,
} from "./domain/parser/animDataParser";
import { LocalStore } from "./stores/localStore";

interface RemoteCharacterPayload {
  id: string;
  numericId: string;
  displayName: string;
  path: string;
  formPath: string;
  animDataXml: string;
  animDataUrl: string;
  zipUrl?: string;
  portraitUrl?: string;
  phase: string;
  phaseRaw: number;
  actions: SpriteCollabActionAsset[];
  credits: Array<{ id: string; name?: string; contact?: string }>;
  license: string;
  sourceCommit?: string;
  sourceUpdatedAt?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assetProxyUrl(url: string): string {
  return `/api/spritecollab/asset?url=${encodeURIComponent(url)}`;
}

function loadAssetImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar ${label}.`));
    image.src = assetProxyUrl(url);
  });
}

function cloneAliasFrames(
  framesByDirection: Record<number, Frame[]>,
  animationId: string,
): Record<number, Frame[]> {
  return Object.fromEntries(
    Object.entries(framesByDirection).map(([direction, frames]) => [
      Number(direction),
      frames.map((frame, frameIndex) => ({
        ...frame,
        id: `${animationId}_d${direction}_f${frameIndex}`,
        animationId,
        direction: Number(direction),
        frameIndex,
        origin: { ...frame.origin },
        shadowOrigin: frame.shadowOrigin ? { ...frame.shadowOrigin } : undefined,
        boundingBox: frame.boundingBox ? { ...frame.boundingBox } : undefined,
      })),
    ]),
  );
}

function animationId(creaturePath: string, animationName: string): string {
  return `remote_${creaturePath.replace(/\//g, "_")}_${animationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

function animationBase(
  creaturePath: string,
  definition: ParsedAnimationDefinition,
): Omit<Animation, "directions" | "framesByDirection"> {
  return {
    id: animationId(creaturePath, definition.name),
    name: definition.name,
    sourceName: definition.name,
    index: definition.index,
    frameWidth: definition.frameWidth,
    frameHeight: definition.frameHeight,
    durations: [...definition.durations],
    loopMode: "loop",
    copyOf: definition.copyOf,
    rushFrame: definition.rushFrame,
    hitFrame: definition.hitFrame,
    returnFrame: definition.returnFrame,
    extraXmlData: definition.extra,
  };
}

function blankFrameDataUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.toDataURL("image/png");
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("library");
  const [remoteIndex, setRemoteIndex] = useState<SpriteCollabIndexItem[]>([]);
  const [localCreatures, setLocalCreatures] = useState<Creature[]>([]);
  const [activeCreature, setActiveCreature] = useState<Creature | null>(null);
  const [history, setHistory] = useState<Creature[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  const [editorParams, setEditorParams] = useState<{
    animationId: string;
    frameIndex: number;
    direction: number;
  }>({ animationId: "", frameIndex: 0, direction: 0 });

  useEffect(() => {
    void loadLocalDatabase();
    void syncRemoteIndex();
    // Initial bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetActiveCreature = (creature: Creature | null) => {
    if (activeCreature?.id === creature?.id) {
      setActiveCreature(creature);
      return;
    }
    setActiveCreature(creature);
    if (creature) {
      setHistory([creature]);
      setHistoryIndex(0);
    } else {
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const loadLocalDatabase = async (preventAutoSelect = false) => {
    try {
      const stored = await LocalStore.getAllLocalCreatures();
      setLocalCreatures(stored);
      if (!preventAutoSelect && stored.length > 0) {
        const stillExists = activeCreature
          ? stored.some((creature) => creature.id === activeCreature.id)
          : false;
        if (!activeCreature || !stillExists) handleSetActiveCreature(stored[0]);
      }
    } catch (error) {
      const message = `Falha ao abrir o banco local: ${errorMessage(error)}`;
      console.error(message);
      setAppError(message);
    }
  };

  const syncRemoteIndex = async (forceRefresh = false) => {
    setIsLoading(true);
    setAppError(null);
    try {
      const response = await fetch(
        `/api/spritecollab/index${forceRefresh ? "?refresh=1" : ""}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || `HTTP ${response.status}`);
      }
      if (!Array.isArray(payload.items)) {
        throw new Error("O servidor retornou um índice SpriteCollab inválido.");
      }
      setRemoteIndex(payload.items as SpriteCollabIndexItem[]);
    } catch (error) {
      const message = `Sincronização SpriteCollab falhou: ${errorMessage(error)}`;
      console.error(message);
      setAppError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRemoteCharacter = async (path: string): Promise<Creature> => {
    setIsLoading(true);
    setAppError(null);
    try {
      const response = await fetch(
        `/api/spritecollab/character?path=${encodeURIComponent(path)}`,
      );
      const payload = (await response.json()) as RemoteCharacterPayload & {
        error?: string;
        details?: string;
      };
      if (!response.ok) {
        throw new Error(payload.details || payload.error || `HTTP ${response.status}`);
      }

      const parsed = parseAnimDataXml(payload.animDataXml);
      const assetsByAction = new Map(
        payload.actions.map((asset) => [asset.action, asset] as const),
      );
      const animationsByName = new Map<string, Animation>();

      for (const definition of parsed.anims.filter((animation) => !animation.copyOf)) {
        const asset = assetsByAction.get(definition.name);
        if (!asset || asset.kind !== "sprite" || !asset.animUrl) {
          throw new Error(
            `A API oficial não forneceu a sheet da ação '${definition.name}'.`,
          );
        }

        const [spriteImage, offsetsImage, shadowImage] = await Promise.all([
          loadAssetImage(asset.animUrl, `${definition.name}-Anim.png`),
          asset.offsetsUrl
            ? loadAssetImage(asset.offsetsUrl, `${definition.name}-Offsets.png`)
            : Promise.resolve(undefined),
          asset.shadowsUrl
            ? loadAssetImage(asset.shadowsUrl, `${definition.name}-Shadow.png`)
            : Promise.resolve(undefined),
        ]);

        const base = animationBase(payload.path, definition);
        const sliced = await sliceSpriteSheet(
          spriteImage,
          definition.frameWidth,
          definition.frameHeight,
          definition.durations,
          definition.name,
          base.id,
          {
            offsetsSource: offsetsImage,
            shadowsSource: shadowImage,
          },
        );

        animationsByName.set(definition.name, {
          ...base,
          directions: sliced.directions,
          framesByDirection: sliced.framesByDirection,
          locked: asset.locked,
          sourceAssets: {
            animUrl: asset.animUrl,
            offsetsUrl: asset.offsetsUrl,
            shadowsUrl: asset.shadowsUrl,
          },
          warnings: [...parsed.warnings, ...sliced.warnings],
        });
      }

      for (const definition of parsed.anims.filter((animation) => animation.copyOf)) {
        const source = animationsByName.get(definition.copyOf!);
        if (!source) {
          throw new Error(
            `CopyOf '${definition.name}' referencia '${definition.copyOf}', que não foi carregada.`,
          );
        }
        const base = animationBase(payload.path, definition);
        const apiAsset = assetsByAction.get(definition.name);
        animationsByName.set(definition.name, {
          ...base,
          frameWidth: source.frameWidth,
          frameHeight: source.frameHeight,
          durations: [...source.durations],
          directions: source.directions,
          framesByDirection: cloneAliasFrames(source.framesByDirection, base.id),
          locked: apiAsset?.locked,
          warnings: [`Ação reutilizada de '${definition.copyOf}' via CopyOf.`],
        });
      }

      const animations = parsed.anims.map((definition) => {
        const animation = animationsByName.get(definition.name);
        if (!animation) {
          throw new Error(`A animação '${definition.name}' não foi materializada.`);
        }
        return animation;
      });

      const now = Date.now();
      const creditNames = payload.credits
        .map((credit) => credit.name || credit.id)
        .filter(Boolean)
        .join(", ");
      const creature: Creature = {
        id: `spritecollab:${payload.path}`,
        sourceKind: "remote",
        sourceRef: payload.path,
        numericId: payload.numericId,
        displayName: payload.displayName,
        species: payload.displayName,
        form: payload.formPath || undefined,
        shadowSize: parsed.shadowSize,
        animations,
        license: payload.license,
        provenance: {
          origin: "PMDCollab/SpriteCollab — API oficial",
          author: creditNames || "Créditos disponíveis no PMDCollab",
          commitHash: payload.sourceCommit,
          createdAt: now,
          updatedAt: payload.sourceUpdatedAt
            ? Date.parse(payload.sourceUpdatedAt) || now
            : now,
        },
        versions: [
          {
            versionId: `remote_${payload.sourceCommit || now}`,
            timestamp: now,
            description: "Asset remoto carregado da API oficial do SpriteCollab",
            author: "PMDCollab",
          },
        ],
        currentVersionId: `remote_${payload.sourceCommit || now}`,
      };
      return creature;
    } catch (error) {
      const message = `Falha ao carregar '${path}': ${errorMessage(error)}`;
      setAppError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFromScratch = async (params: {
    name: string;
    numericId: string;
    frameWidth: number;
    frameHeight: number;
    primaryColor: string;
  }): Promise<Creature> => {
    const newId = `local:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const actionDefinitions = [
      { name: "Idle", durations: [12, 12] },
      { name: "Walk", durations: [6, 6, 6, 6] },
      { name: "Attack", durations: [4, 4, 6] },
    ];
    const transparentCell = blankFrameDataUrl(params.frameWidth, params.frameHeight);

    const animations: Animation[] = actionDefinitions.map((definition, index) => {
      const id = `${newId}_${definition.name.toLowerCase()}`;
      const framesByDirection: Record<number, Frame[]> = {};
      for (let direction = 0; direction < 8; direction += 1) {
        framesByDirection[direction] = definition.durations.map((duration, frameIndex) => ({
          id: `${id}_d${direction}_f${frameIndex}`,
          animationId: id,
          direction,
          frameIndex,
          dataUrl: transparentCell,
          duration,
          origin: {
            x: Math.floor(params.frameWidth / 2),
            y: Math.floor(params.frameHeight / 2),
          },
        }));
      }
      return {
        id,
        name: definition.name,
        sourceName: definition.name,
        index,
        frameWidth: params.frameWidth,
        frameHeight: params.frameHeight,
        directions: 8,
        durations: [...definition.durations],
        loopMode: "loop",
        framesByDirection,
        warnings: [
          `Projeto vazio criado com a cor de referência ${params.primaryColor}; desenhe os frames no editor.`,
        ],
      };
    });

    const now = Date.now();
    const versionId = `v1_${now}`;
    const creature: Creature = {
      id: newId,
      sourceKind: "local",
      numericId: params.numericId.trim() || "9000",
      displayName: params.name.trim() || "Criatura customizada",
      species: params.name.trim() || "Custom",
      shadowSize: 1,
      animations,
      license: "Criação original do usuário",
      provenance: {
        origin: "Projeto PMD vazio criado no SAGA SpriteLab",
        author: "Usuário",
        createdAt: now,
        updatedAt: now,
      },
      versions: [
        {
          versionId,
          timestamp: now,
          description: "Estrutura inicial vazia",
          author: "Usuário",
        },
      ],
      currentVersionId: versionId,
    };

    await LocalStore.saveCreature(creature);
    await loadLocalDatabase(true);
    handleSetActiveCreature(creature);
    setActiveTab("studio");
    return creature;
  };

  const handleDuplicateToLocal = async (creature: Creature) => {
    const localCopy = await LocalStore.duplicateToLocal(creature);
    await loadLocalDatabase(true);
    handleSetActiveCreature(localCopy);
    setActiveTab("studio");
  };

  const handleOpenPixelEditor = (
    creature: Creature,
    animationIdValue: string,
    frameIndex: number,
    direction: number,
  ) => {
    handleSetActiveCreature(creature);
    setEditorParams({ animationId: animationIdValue, frameIndex, direction });
    setActiveTab("pixel_editor");
  };

  const handleOpenAiLab = (creature: Creature) => {
    handleSetActiveCreature(creature);
    setActiveTab("ai_lab");
  };

  const handleOpenNpcTest = (creature: Creature) => {
    handleSetActiveCreature(creature);
    setActiveTab("behavior_lab");
  };

  const handleSavedCreature = async (updated: Creature) => {
    if (updated.sourceKind !== "remote") {
      await LocalStore.saveCreature(updated);
      await loadLocalDatabase(true);
    }

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(updated);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setActiveCreature(updated);
  };

  const handleUndo = async () => {
    if (historyIndex <= 0) return;
    const previous = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setActiveCreature(previous);
    if (previous.sourceKind !== "remote") {
      await LocalStore.saveCreature(previous);
      await loadLocalDatabase(true);
    }
  };

  const handleRedo = async () => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setActiveCreature(next);
    if (next.sourceKind !== "remote") {
      await LocalStore.saveCreature(next);
      await loadLocalDatabase(true);
    }
  };

  const handleDeleteCreature = async (id: string) => {
    await LocalStore.deleteCreature(id);
    const deletingActive = activeCreature?.id === id;
    if (deletingActive) {
      handleSetActiveCreature(null);
      setActiveTab("library");
    }
    await loadLocalDatabase(deletingActive);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white pb-12">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCreatureName={activeCreature?.displayName}
        sourceKind={activeCreature?.sourceKind}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {appError && (
        <div className="mx-auto mt-4 max-w-7xl px-4 md:px-6">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-rose-700/60 bg-rose-950/70 px-4 py-3 text-sm text-rose-100">
            <span>{appError}</span>
            <button
              type="button"
              onClick={() => setAppError(null)}
              className="shrink-0 text-xs font-semibold text-rose-300 hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <main className="transition-all">
        {activeTab === "library" && (
          <UnifiedLibrary
            remoteIndex={remoteIndex}
            localCreatures={localCreatures}
            onSelectCreature={(creature) => {
              handleSetActiveCreature(creature);
              setActiveTab("studio");
            }}
            onDuplicateToLocal={handleDuplicateToLocal}
            onOpenNpcTest={handleOpenNpcTest}
            onExportZip={(creature) => {
              handleSetActiveCreature(creature);
              setActiveTab("export_import");
            }}
            onDeleteCreature={handleDeleteCreature}
            onSyncRemote={() => syncRemoteIndex(true)}
            onLoadRemoteCharacter={loadRemoteCharacter}
            onCreateFromScratch={handleCreateFromScratch}
            isLoading={isLoading}
          />
        )}

        {activeTab === "studio" && activeCreature && (
          <AnimationStudio
            creature={activeCreature}
            onDuplicateToLocal={handleDuplicateToLocal}
            onOpenPixelEditor={handleOpenPixelEditor}
            onOpenAiLab={handleOpenAiLab}
            onOpenNpcTest={handleOpenNpcTest}
            onExportZip={(creature) => {
              handleSetActiveCreature(creature);
              setActiveTab("export_import");
            }}
            onUpdateCreature={handleSavedCreature}
          />
        )}

        {activeTab === "pixel_editor" && activeCreature && (
          <PixelEditor
            creature={activeCreature}
            animationId={editorParams.animationId}
            frameIndex={editorParams.frameIndex}
            direction={editorParams.direction}
            onSaved={handleSavedCreature}
            onBackToStudio={() => setActiveTab("studio")}
          />
        )}

        {activeTab === "ai_lab" && activeCreature && (
          <AiStudioLab
            creature={activeCreature}
            onVersionApproved={(updated) => {
              void handleSavedCreature(updated);
              setActiveTab("studio");
            }}
          />
        )}

        {activeTab === "behavior_lab" && activeCreature && (
          <BehaviorLab creature={activeCreature} />
        )}
        {activeTab === "playground" && activeCreature && (
          <BehaviorLab creature={activeCreature} />
        )}

        {activeTab === "export_import" && activeCreature && (
          <ImportExportModal
            activeCreature={activeCreature}
            onImported={(newCreature) => {
              void handleSavedCreature(newCreature);
              setActiveTab("studio");
            }}
          />
        )}

        {activeTab === "diagnostics" && <DiagnosticsPanel />}
      </main>
    </div>
  );
}
