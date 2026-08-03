import JSZip from "jszip";
import { Creature, Animation, Frame } from "../types";
import { parseAnimDataXml, sliceSpriteSheet } from "../domain/parser/animDataParser";
import { LocalStore } from "../stores/localStore";

export async function importCreatureFromZip(file: File): Promise<Creature> {
  const zip = await JSZip.loadAsync(file);

  // 1. Locate AnimData.xml
  const animDataFile = zip.file("AnimData.xml") || zip.file(/AnimData\.xml$/i)[0];
  if (!animDataFile) {
    throw new Error("Pacote ZIP inválido: 'AnimData.xml' não encontrado no arquivo.");
  }

  const xmlText = await animDataFile.async("string");
  const parsed = parseAnimDataXml(xmlText);

  // 2. Read optional manifest.json
  let manifest: any = {};
  const manifestFile = zip.file("manifest.json");
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async("string"));
    } catch {
      // Ignore invalid manifest
    }
  }

  const creatureId = `imported:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const animations: Animation[] = [];

  // 3. Process each animation listed in AnimData.xml
  for (const animDef of parsed.anims) {
    const animName = animDef.name;
    const animId = `${creatureId}_${animName.toLowerCase()}`;

    // Look for image file (e.g., Walk-Anim.png or Walk.png)
    const imageFile =
      zip.file(`${animName}-Anim.png`) ||
      zip.file(`${animName}.png`) ||
      zip.file(new RegExp(`${animName}.*\\.png$`, "i"))[0];

    let framesByDir: Record<number, Frame[]> = {};

    if (imageFile) {
      const base64Img = await imageFile.async("base64");
      const imgDataUrl = `data:image/png;base64,${base64Img}`;

      // Load image into memory to slice
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imgDataUrl;
      });

      framesByDir = await sliceSpriteSheet(
        img,
        animDef.frameWidth,
        animDef.frameHeight,
        animDef.durations,
        animName,
        animId,
        8
      );
    } else {
      // Fallback empty frames if PNG missing
      framesByDir = createFallbackFrames(animId, animDef.frameWidth, animDef.frameHeight, animDef.durations);
    }

    animations.push({
      id: animId,
      name: animName,
      sourceName: animName,
      index: animDef.index,
      frameWidth: animDef.frameWidth,
      frameHeight: animDef.frameHeight,
      directions: 8,
      durations: animDef.durations,
      loopMode: "loop",
      rushFrame: animDef.rushFrame,
      hitFrame: animDef.hitFrame,
      returnFrame: animDef.returnFrame,
      framesByDirection: framesByDir,
    });
  }

  const displayName = manifest.displayName || file.name.replace(/\.zip$/i, "");
  const numericId = manifest.numericId || "Custom";

  const importedCreature: Creature = {
    id: creatureId,
    sourceKind: "imported",
    numericId,
    displayName: `${displayName} (Importado)`,
    species: displayName,
    shadowSize: parsed.shadowSize,
    animations,
    license: manifest.license || "Importado via ZIP",
    provenance: {
      origin: file.name,
      author: manifest.provenance?.author || "Importado pelo Usuário",
      createdAt: now,
      updatedAt: now,
    },
    versions: [
      {
        versionId: `v1_${now}`,
        timestamp: now,
        description: "Importação via pacote ZIP",
        author: "Usuário",
      },
    ],
    currentVersionId: `v1_${now}`,
  };

  // Save to LocalStore IndexedDB so it appears instantly in library
  await LocalStore.saveCreature(importedCreature);

  return importedCreature;
}

function createFallbackFrames(
  animId: string,
  width: number,
  height: number,
  durations: number[]
): Record<number, Frame[]> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(4, 4, width - 8, height - 8);
  }
  const fallbackUrl = canvas.toDataURL("image/png");

  const framesByDir: Record<number, Frame[]> = {};
  for (let d = 0; d < 8; d++) {
    framesByDir[d] = durations.map((dur, f) => ({
      id: `${animId}_d${d}_f${f}`,
      animationId: animId,
      direction: d,
      frameIndex: f,
      dataUrl: fallbackUrl,
      duration: dur,
      origin: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    }));
  }
  return framesByDir;
}
