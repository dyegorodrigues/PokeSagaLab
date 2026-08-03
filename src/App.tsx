import React, { useState, useEffect } from "react";
import { Header, TabType } from "./components/Header";
import { UnifiedLibrary } from "./components/UnifiedLibrary";
import { AnimationStudio } from "./components/AnimationStudio";
import { PixelEditor } from "./components/PixelEditor";
import { AiStudioLab } from "./components/AiStudioLab";
import { BehaviorLab } from "./components/BehaviorLab";
import { ImportExportModal } from "./components/ImportExportModal";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";

import { Creature, SpriteCollabIndexItem } from "./types";
import { parseAnimDataXml, sliceSpriteSheet } from "./domain/parser/animDataParser";
import { LocalStore } from "./stores/localStore";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("library");
  const [remoteIndex, setRemoteIndex] = useState<SpriteCollabIndexItem[]>([]);
  const [localCreatures, setLocalCreatures] = useState<Creature[]>([]);
  const [activeCreature, setActiveCreature] = useState<Creature | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  // Editor Target Parameters
  const [editorParams, setEditorParams] = useState<{
    animationId: string;
    frameIndex: number;
    direction: number;
  }>({ animationId: "", frameIndex: 0, direction: 0 });

  // Initial Sync & Load Local Database
  useEffect(() => {
    loadLocalDatabase();
    syncRemoteIndex();
  }, []);

  const loadLocalDatabase = async () => {
    try {
      const stored = await LocalStore.getAllLocalCreatures();
      setLocalCreatures(stored);

      // Default active creature if none selected
      if (!activeCreature && stored.length > 0) {
        setActiveCreature(stored[0]);
      }
    } catch (err) {
      console.error("Failed to load local DB:", err);
    }
  };

  const syncRemoteIndex = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/spritecollab/index");
      const data = await res.json();
      if (data.items) {
        setRemoteIndex(data.items);
      }
    } catch (err) {
      console.error("Failed to sync remote index:", err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetches remote character details (AnimData.xml + PNG sheets),
   * parses XML, slices frames, and converts into Creature model.
   */
  const loadRemoteCharacter = async (id: string): Promise<Creature> => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/spritecollab/character/${id}`);
      const data = await res.json();

      const parsedXml = parseAnimDataXml(data.animDataXml);

      // Helper to load image async
      const loadImage = (src: string): Promise<HTMLImageElement | null> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });
      };

      const animations = await Promise.all(
        parsedXml.anims.map(async (animDef) => {
          const animId = `remote_${id}_${animDef.name.toLowerCase()}`;
          const sheetUrl = `/api/spritecollab/raw/sprite/${id}/${animDef.name}-Anim.png`;
          const offsetUrl = `/api/spritecollab/raw/sprite/${id}/${animDef.name}-Offsets.png`;
          
          const [loadedImg, loadedOffsets] = await Promise.all([
            loadImage(sheetUrl),
            loadImage(offsetUrl)
          ]);

          let framesByDir: Record<number, any[]> = {};

          if (loadedImg && loadedImg.naturalWidth > 0 && loadedImg.naturalHeight > 0) {
            try {
              framesByDir = await sliceSpriteSheet(
                loadedImg,
                animDef.frameWidth,
                animDef.frameHeight,
                animDef.durations,
                animDef.name,
                animId,
                8,
                loadedOffsets || undefined
              );
            } catch (err) {
              console.warn(`Error slicing sheet for ${animDef.name}:`, err);
            }
          }

          // Fallback if sheet not available or slice empty
          if (!framesByDir[0] || framesByDir[0].length === 0) {
            const primaryColor = id === "0025" ? "#facc15" : id === "0004" ? "#f97316" : id === "0007" ? "#3b82f6" : "#10b981";
            for (let d = 0; d < 8; d++) {
              framesByDir[d] = animDef.durations.map((dur, f) => {
                const canvas = document.createElement("canvas");
                canvas.width = animDef.frameWidth;
                canvas.height = animDef.frameHeight;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  // Organic Pixel Art Body
                  const cx = animDef.frameWidth / 2;
                  const cy = animDef.frameHeight / 2;
                  const r = Math.min(animDef.frameWidth, animDef.frameHeight) / 3;

                  ctx.fillStyle = primaryColor;
                  ctx.beginPath();
                  ctx.arc(cx + (f % 2 === 0 ? -1 : 1), cy + (d % 2 === 0 ? -1 : 1), r, 0, Math.PI * 2);
                  ctx.fill();

                  ctx.strokeStyle = "#000000";
                  ctx.lineWidth = 1;
                  ctx.stroke();

                  // Eyes
                  ctx.fillStyle = "#000000";
                  ctx.fillRect(cx - 4, cy - 3, 2, 3);
                  ctx.fillRect(cx + 2, cy - 3, 2, 3);

                  // Highlight
                  ctx.fillStyle = "#ffffff";
                  ctx.fillRect(cx - 4, cy - 3, 1, 1);
                  ctx.fillRect(cx + 2, cy - 3, 1, 1);

                  if (id === "0025") {
                    ctx.fillStyle = "#ef4444";
                    ctx.fillRect(cx - 6, cy + 1, 2, 2);
                    ctx.fillRect(cx + 4, cy + 1, 2, 2);
                  }
                }

                return {
                  id: `${animId}_d${d}_f${f}`,
                  animationId: animId,
                  direction: d,
                  frameIndex: f,
                  dataUrl: canvas.toDataURL("image/png"),
                  duration: dur,
                  origin: { x: Math.floor(animDef.frameWidth / 2), y: Math.floor(animDef.frameHeight / 2) },
                };
              });
            }
          }

          return {
            id: animId,
            name: animDef.name,
            sourceName: animDef.name,
            index: animDef.index,
            frameWidth: animDef.frameWidth,
            frameHeight: animDef.frameHeight,
            directions: 8,
            durations: animDef.durations,
            loopMode: "loop" as const,
            rushFrame: animDef.rushFrame,
            hitFrame: animDef.hitFrame,
            returnFrame: animDef.returnFrame,
            framesByDirection: framesByDir,
          };
        })
      );

      const creature: Creature = {
        id: `spritecollab:${id}`,
        sourceKind: "remote",
        numericId: id,
        displayName: data.displayName,
        species: data.displayName,
        shadowSize: parsedXml.shadowSize,
        animations,
        license: data.license,
        provenance: {
          origin: "PMDCollab/SpriteCollab",
          author: "Contribuinte SpriteCollab",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        versions: [
          {
            versionId: `v1_remote`,
            timestamp: Date.now(),
            description: "Remoto original SpriteCollab",
            author: "SpriteCollab",
          },
        ],
        currentVersionId: `v1_remote`,
      };

      return creature;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Creates an original creature/sprite from scratch ("Criar do Zero")
   */
  const handleCreateFromScratch = async (params: {
    name: string;
    numericId: string;
    frameWidth: number;
    frameHeight: number;
    primaryColor: string;
  }): Promise<Creature> => {
    const newId = `local_custom_${Date.now()}`;
    const animNames = ["Idle", "Walk", "Attack"];

    const animations = animNames.map((animName, animIdx) => {
      const animId = `${newId}_${animName.toLowerCase()}`;
      const durations = animName === "Walk" ? [6, 6, 6] : animName === "Attack" ? [4, 4, 6] : [10, 10];
      const framesByDir: Record<number, any[]> = {};

      for (let d = 0; d < 8; d++) {
        framesByDir[d] = durations.map((dur, f) => {
          const canvas = document.createElement("canvas");
          canvas.width = params.frameWidth;
          canvas.height = params.frameHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            const cx = params.frameWidth / 2;
            const cy = params.frameHeight / 2;
            const r = Math.min(params.frameWidth, params.frameHeight) / 3;

            // Pixel Art Body shape
            ctx.fillStyle = params.primaryColor;
            ctx.beginPath();
            ctx.arc(cx + (f % 2 === 0 ? -1 : 1), cy + (d % 2 === 0 ? -1 : 1), r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Face details
            ctx.fillStyle = "#000000";
            ctx.fillRect(cx - 3, cy - 2, 2, 2);
            ctx.fillRect(cx + 1, cy - 2, 2, 2);
          }

          return {
            id: `${animId}_d${d}_f${f}`,
            animationId: animId,
            direction: d,
            frameIndex: f,
            dataUrl: canvas.toDataURL("image/png"),
            duration: dur,
            origin: { x: Math.floor(params.frameWidth / 2), y: Math.floor(params.frameHeight / 2) },
          };
        });
      }

      return {
        id: animId,
        name: animName,
        sourceName: animName,
        index: animIdx,
        frameWidth: params.frameWidth,
        frameHeight: params.frameHeight,
        directions: 8,
        durations,
        loopMode: "loop" as const,
        framesByDirection: framesByDir,
      };
    });

    const newCreature: Creature = {
      id: newId,
      sourceKind: "local",
      numericId: params.numericId || "9000",
      displayName: params.name || "Criatura Customizada",
      species: params.name || "Custom",
      shadowSize: 1,
      animations,
      license: "Custom User License",
      provenance: {
        origin: "Criado do Zero (Local)",
        author: "Usuário",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      versions: [
        {
          versionId: "v1_scratch",
          timestamp: Date.now(),
          description: "Criado do zero pelo usuário",
          author: "Usuário",
        },
      ],
      currentVersionId: "v1_scratch",
    };

    await LocalStore.saveCreature(newCreature);
    await loadLocalDatabase();
    setActiveCreature(newCreature);
    setActiveTab("studio");
    return newCreature;
  };

  const handleDuplicateToLocal = async (creature: Creature) => {
    const localCopy = await LocalStore.duplicateToLocal(creature);
    await loadLocalDatabase();
    setActiveCreature(localCopy);
    setActiveTab("studio");
  };

  const handleOpenPixelEditor = (
    creature: Creature,
    animationId: string,
    frameIndex: number,
    direction: number
  ) => {
    setActiveCreature(creature);
    setEditorParams({ animationId, frameIndex, direction });
    setActiveTab("pixel_editor");
  };

  const handleOpenAiLab = (creature: Creature, animationName: string, direction: number) => {
    setActiveCreature(creature);
    setActiveTab("ai_lab");
  };

  const handleOpenNpcTest = (creature: Creature) => {
    setActiveCreature(creature);
    setActiveTab("behavior_lab");
  };

  const handleSavedCreature = async (updated: Creature) => {
    if (updated.sourceKind === "local") {
      await LocalStore.saveCreature(updated);
      await loadLocalDatabase();
    }
    setActiveCreature(updated);
  };

  const handleDeleteCreature = async (id: string) => {
    await LocalStore.deleteCreature(id);
    if (activeCreature?.id === id) {
      setActiveCreature(null);
      setActiveTab("library");
    }
    await loadLocalDatabase();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white pb-12">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCreatureName={activeCreature?.displayName}
        sourceKind={activeCreature?.sourceKind}
      />

      <main className="transition-all">
        {activeTab === "library" && (
          <UnifiedLibrary
            remoteIndex={remoteIndex}
            localCreatures={localCreatures}
            onSelectCreature={(c) => {
              setActiveCreature(c);
              setActiveTab("studio");
            }}
            onDuplicateToLocal={handleDuplicateToLocal}
            onOpenNpcTest={handleOpenNpcTest}
            onExportZip={(c) => {
              setActiveCreature(c);
              setActiveTab("export_import");
            }}
            onDeleteCreature={handleDeleteCreature}
            onSyncRemote={syncRemoteIndex}
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
            onExportZip={(c) => {
              setActiveCreature(c);
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
              handleSavedCreature(updated);
              setActiveTab("studio");
            }}
          />
        )}

        {activeTab === "behavior_lab" && activeCreature && <BehaviorLab creature={activeCreature} />}

        {activeTab === "playground" && activeCreature && <BehaviorLab creature={activeCreature} />}

        {activeTab === "export_import" && activeCreature && (
          <ImportExportModal
            activeCreature={activeCreature}
            onImported={(newCreature) => {
              handleSavedCreature(newCreature);
              setActiveTab("studio");
            }}
          />
        )}

        {activeTab === "diagnostics" && <DiagnosticsPanel />}
      </main>
    </div>
  );
}
