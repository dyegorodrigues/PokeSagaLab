import JSZip, { JSZipObject } from "jszip";
import { Animation, Creature, Frame } from "../types";
import {
  ParsedAnimationDefinition,
  parseAnimDataXml,
  sliceSpriteSheet,
} from "../domain/parser/animDataParser";
import { LocalStore } from "../stores/localStore";

interface ImportManifest {
  displayName?: string;
  numericId?: string;
  license?: string;
  provenance?: {
    author?: string;
  };
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

function findFileByBasename(zip: JSZip, expectedName: string): JSZipObject | null {
  const expected = expectedName.toLowerCase();
  return (
    Object.values(zip.files).find(
      (entry) => !entry.dir && basename(entry.name).toLowerCase() === expected,
    ) || null
  );
}

async function loadZipPng(file: JSZipObject, label: string): Promise<HTMLImageElement> {
  const base64 = await file.async("base64");
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Não foi possível decodificar ${label}.`));
    image.src = `data:image/png;base64,${base64}`;
  });
  return image;
}

function cloneFramesForAlias(
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

function createAnimationShell(
  creatureId: string,
  definition: ParsedAnimationDefinition,
): Omit<Animation, "framesByDirection" | "directions"> {
  return {
    id: `${creatureId}_${definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
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

export async function importCreatureFromZip(file: File): Promise<Creature> {
  const zip = await JSZip.loadAsync(file, {
    createFolders: false,
    checkCRC32: true,
  });

  const animDataFile = findFileByBasename(zip, "AnimData.xml");
  if (!animDataFile) {
    throw new Error("Pacote PMD inválido: 'AnimData.xml' não foi encontrado.");
  }

  const xmlText = await animDataFile.async("string");
  const parsed = parseAnimDataXml(xmlText);

  let manifest: ImportManifest = {};
  const manifestFile = findFileByBasename(zip, "manifest.json");
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async("string")) as ImportManifest;
    } catch (error) {
      throw new Error(
        `manifest.json inválido: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const creatureId = `imported:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const animationsByName = new Map<string, Animation>();

  // Real actions own three aligned sheets: Anim, Offsets and Shadow.
  for (const definition of parsed.anims.filter((animation) => !animation.copyOf)) {
    const shell = createAnimationShell(creatureId, definition);
    const animFile = findFileByBasename(zip, `${definition.name}-Anim.png`);
    if (!animFile) {
      throw new Error(
        `Pacote incompleto: '${definition.name}-Anim.png' não foi encontrado para a animação '${definition.name}'.`,
      );
    }

    const offsetsFile = findFileByBasename(zip, `${definition.name}-Offsets.png`);
    const shadowFile =
      findFileByBasename(zip, `${definition.name}-Shadow.png`) ||
      findFileByBasename(zip, `${definition.name}-Shadows.png`);

    const [animImage, offsetsImage, shadowImage] = await Promise.all([
      loadZipPng(animFile, `${definition.name}-Anim.png`),
      offsetsFile
        ? loadZipPng(offsetsFile, `${definition.name}-Offsets.png`)
        : Promise.resolve(undefined),
      shadowFile
        ? loadZipPng(shadowFile, `${definition.name}-Shadow.png`)
        : Promise.resolve(undefined),
    ]);

    const sliced = await sliceSpriteSheet(
      animImage,
      definition.frameWidth,
      definition.frameHeight,
      definition.durations,
      definition.name,
      shell.id,
      {
        offsetsSource: offsetsImage,
        shadowsSource: shadowImage,
      },
    );

    animationsByName.set(definition.name, {
      ...shell,
      directions: sliced.directions,
      framesByDirection: sliced.framesByDirection,
      warnings: [...parsed.warnings, ...sliced.warnings],
    });
  }

  // CopyOf actions reuse another action's cells but retain their own PMD identity.
  for (const definition of parsed.anims.filter((animation) => animation.copyOf)) {
    const shell = createAnimationShell(creatureId, definition);
    const source = animationsByName.get(definition.copyOf!);
    if (!source) {
      throw new Error(
        `A animação '${definition.name}' referencia CopyOf '${definition.copyOf}', mas a origem não foi carregada.`,
      );
    }
    animationsByName.set(definition.name, {
      ...shell,
      frameWidth: source.frameWidth,
      frameHeight: source.frameHeight,
      durations: [...source.durations],
      directions: source.directions,
      framesByDirection: cloneFramesForAlias(source.framesByDirection, shell.id),
      warnings: [`Ação PMD reutilizada de '${definition.copyOf}' via CopyOf.`],
    });
  }

  const animations = parsed.anims.map((definition) => {
    const animation = animationsByName.get(definition.name);
    if (!animation) {
      throw new Error(`Falha interna ao materializar a animação '${definition.name}'.`);
    }
    return animation;
  });

  const rawDisplayName = manifest.displayName || file.name.replace(/\.zip$/i, "");
  const displayName = rawDisplayName.trim() || "Criatura importada";
  const numericId = manifest.numericId?.trim() || "Custom";
  const versionId = `v1_${now}`;

  const importedCreature: Creature = {
    id: creatureId,
    sourceKind: "imported",
    sourceRef: file.name,
    numericId,
    displayName: `${displayName} (Importado)`,
    species: displayName,
    shadowSize: parsed.shadowSize,
    animations,
    license: manifest.license || "Licença não informada no pacote importado",
    provenance: {
      origin: file.name,
      author: manifest.provenance?.author || "Importado pelo usuário",
      createdAt: now,
      updatedAt: now,
    },
    versions: [
      {
        versionId,
        timestamp: now,
        description: "Importação PMD preservando Anim, Offsets, Shadow e CopyOf",
        author: "Usuário",
      },
    ],
    currentVersionId: versionId,
  };

  await LocalStore.saveCreature(importedCreature);
  return importedCreature;
}
