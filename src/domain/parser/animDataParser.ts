import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Frame, Point } from "../../types";

export interface ParsedAnimationDefinition {
  name: string;
  index: number;
  copyOf?: string;
  frameWidth: number;
  frameHeight: number;
  durations: number[];
  rushFrame?: number;
  hitFrame?: number;
  returnFrame?: number;
  extra?: Record<string, unknown>;
}

export interface ParsedAnimData {
  shadowSize: number;
  anims: ParsedAnimationDefinition[];
  warnings: string[];
}

export interface SliceSpriteSheetOptions {
  offsetsSource?: CanvasImageSource;
  shadowsSource?: CanvasImageSource;
}

export interface SlicedSpriteSheet {
  framesByDirection: Record<number, Frame[]>;
  directions: number;
  frameCount: number;
  warnings: string[];
}

export type SpriteSheetLayer = "sprite" | "offsets" | "shadow";

export class AnimDataParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnimDataParseError";
  }
}

const KNOWN_ANIM_FIELDS = new Set([
  "Name",
  "Index",
  "CopyOf",
  "FrameWidth",
  "FrameHeight",
  "Durations",
  "RushFrame",
  "HitFrame",
  "ReturnFrame",
]);

function positiveInteger(value: unknown, field: string, animationName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AnimDataParseError(
      `A animação '${animationName}' possui ${field} inválido: ${String(value)}.`,
    );
  }
  return parsed;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDurations(raw: unknown, animationName: string): number[] {
  const durationValue = (raw as { Duration?: unknown } | undefined)?.Duration;
  const values = Array.isArray(durationValue)
    ? durationValue
    : durationValue === undefined
      ? []
      : [durationValue];
  if (!values.length) {
    throw new AnimDataParseError(
      `A animação '${animationName}' não possui uma lista de Durations válida.`,
    );
  }
  return values.map((value) => positiveInteger(value, "Duration", animationName));
}

/** Parses and validates the official PMD AnimData.xml format. */
export function parseAnimDataXml(xmlString: string): ParsedAnimData {
  if (!xmlString.trim()) {
    throw new AnimDataParseError("AnimData.xml está vazio.");
  }

  const validation = XMLValidator.validate(xmlString, {
    allowBooleanAttributes: false,
  });
  if (validation !== true) {
    throw new AnimDataParseError(
      `AnimData.xml inválido: ${validation.err.msg} (linha ${validation.err.line}).`,
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    trimValues: true,
    processEntities: false,
  });
  const parsedObject = parser.parse(xmlString) as Record<string, unknown>;
  const root = (parsedObject.AnimData || parsedObject) as Record<string, any>;
  if (!root || typeof root !== "object") {
    throw new AnimDataParseError("Elemento raiz <AnimData> não encontrado.");
  }

  const shadowSize = Number(root.ShadowSize ?? 1);
  if (!Number.isFinite(shadowSize) || shadowSize < 0) {
    throw new AnimDataParseError(`ShadowSize inválido: ${String(root.ShadowSize)}.`);
  }

  const rawAnimations = root.Anims?.Anim;
  const animationList = Array.isArray(rawAnimations)
    ? rawAnimations
    : rawAnimations
      ? [rawAnimations]
      : [];
  if (!animationList.length) {
    throw new AnimDataParseError("AnimData.xml não contém nenhuma animação.");
  }

  const warnings: string[] = [];
  const unresolved = animationList.map((rawAnimation: Record<string, any>) => {
    const name = String(rawAnimation.Name || "").trim();
    if (!name) throw new AnimDataParseError("Uma animação não possui <Name>.");

    const copyOf = rawAnimation.CopyOf
      ? String(rawAnimation.CopyOf).trim()
      : undefined;
    const extra = Object.fromEntries(
      Object.entries(rawAnimation).filter(([key]) => !KNOWN_ANIM_FIELDS.has(key)),
    );

    if (copyOf) {
      return {
        name,
        index: optionalInteger(rawAnimation.Index) ?? -1,
        copyOf,
        frameWidth: 0,
        frameHeight: 0,
        durations: [] as number[],
        rushFrame: optionalInteger(rawAnimation.RushFrame),
        hitFrame: optionalInteger(rawAnimation.HitFrame),
        returnFrame: optionalInteger(rawAnimation.ReturnFrame),
        extra,
      };
    }

    const frameWidth = positiveInteger(rawAnimation.FrameWidth, "FrameWidth", name);
    const frameHeight = positiveInteger(rawAnimation.FrameHeight, "FrameHeight", name);
    if (frameWidth % 2 !== 0 || frameHeight % 2 !== 0) {
      warnings.push(
        `A animação '${name}' usa célula ${frameWidth}x${frameHeight}; o formato PMD recomenda dimensões pares.`,
      );
    }

    return {
      name,
      index: optionalInteger(rawAnimation.Index) ?? -1,
      frameWidth,
      frameHeight,
      durations: parseDurations(rawAnimation.Durations, name),
      rushFrame: optionalInteger(rawAnimation.RushFrame),
      hitFrame: optionalInteger(rawAnimation.HitFrame),
      returnFrame: optionalInteger(rawAnimation.ReturnFrame),
      extra,
    };
  });

  const byName = new Map<string, (typeof unresolved)[number]>();
  for (const animation of unresolved) {
    if (byName.has(animation.name)) {
      throw new AnimDataParseError(`Nome de animação duplicado: '${animation.name}'.`);
    }
    byName.set(animation.name, animation);
  }

  const resolving = new Set<string>();
  const resolved = new Map<string, ParsedAnimationDefinition>();
  const resolveAnimation = (name: string): ParsedAnimationDefinition => {
    const cached = resolved.get(name);
    if (cached) return cached;
    const animation = byName.get(name);
    if (!animation) {
      throw new AnimDataParseError(`CopyOf referencia animação inexistente: '${name}'.`);
    }
    if (resolving.has(name)) {
      throw new AnimDataParseError(`Ciclo de CopyOf detectado em '${name}'.`);
    }
    resolving.add(name);

    let result: ParsedAnimationDefinition;
    if (animation.copyOf) {
      const source = resolveAnimation(animation.copyOf);
      result = {
        ...source,
        name: animation.name,
        index: animation.index >= 0 ? animation.index : source.index,
        copyOf: animation.copyOf,
        durations: [...source.durations],
        rushFrame: animation.rushFrame ?? source.rushFrame,
        hitFrame: animation.hitFrame ?? source.hitFrame,
        returnFrame: animation.returnFrame ?? source.returnFrame,
        extra: animation.extra,
      };
    } else {
      result = {
        ...animation,
        durations: [...animation.durations],
      };
    }

    resolving.delete(name);
    resolved.set(name, result);
    return result;
  };

  const anims = unresolved.map((animation) => resolveAnimation(animation.name));
  const usedIndices = new Map<number, string>();
  for (const animation of anims) {
    if (animation.index < 0) continue;
    const existing = usedIndices.get(animation.index);
    if (existing) {
      warnings.push(
        `As animações '${existing}' e '${animation.name}' compartilham o índice ${animation.index}.`,
      );
    } else {
      usedIndices.set(animation.index, animation.name);
    }
  }

  return { shadowSize, anims, warnings };
}

function getSourceDimensions(source: CanvasImageSource) {
  const candidate = source as CanvasImageSource & {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  const width = candidate.naturalWidth || candidate.videoWidth || candidate.width || 0;
  const height = candidate.naturalHeight || candidate.videoHeight || candidate.height || 0;
  if (!width || !height) throw new Error("A imagem do spritesheet não possui dimensões válidas.");
  return { width, height };
}

function readSourcePixels(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível criar o contexto Canvas 2D.");
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function sliceCell(
  source: CanvasImageSource,
  startX: number,
  startY: number,
  frameWidth: number,
  frameHeight: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o contexto Canvas 2D.");
  context.drawImage(
    source,
    startX,
    startY,
    frameWidth,
    frameHeight,
    0,
    0,
    frameWidth,
    frameHeight,
  );
  return canvas.toDataURL("image/png");
}

function findMarker(
  imageData: ImageData | undefined,
  imageWidth: number,
  startX: number,
  startY: number,
  frameWidth: number,
  frameHeight: number,
  predicate: (r: number, g: number, b: number, a: number) => boolean,
): Point | undefined {
  if (!imageData) return undefined;
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const index = ((startY + y) * imageWidth + startX + x) * 4;
      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      const a = imageData.data[index + 3];
      if (predicate(r, g, b, a)) return { x, y };
    }
  }
  return undefined;
}

/**
 * Splits a PMD multi-sheet action into frame cells without repeating rows or columns.
 * Official sheets contain either one row or eight rows and one duration per column.
 */
export async function sliceSpriteSheet(
  imageSource: CanvasImageSource,
  frameWidth: number,
  frameHeight: number,
  durations: number[],
  animName: string,
  animId: string,
  options: SliceSpriteSheetOptions = {},
): Promise<SlicedSpriteSheet> {
  if (!Number.isInteger(frameWidth) || frameWidth <= 0 || !Number.isInteger(frameHeight) || frameHeight <= 0) {
    throw new Error(`Dimensões inválidas para '${animName}': ${frameWidth}x${frameHeight}.`);
  }

  const { width: imageWidth, height: imageHeight } = getSourceDimensions(imageSource);
  if (imageWidth % frameWidth !== 0 || imageHeight % frameHeight !== 0) {
    throw new Error(
      `Spritesheet '${animName}' (${imageWidth}x${imageHeight}) não é divisível pela célula ${frameWidth}x${frameHeight}.`,
    );
  }

  const frameCount = imageWidth / frameWidth;
  const directions = imageHeight / frameHeight;
  if (directions !== 1 && directions !== 8) {
    throw new Error(
      `Spritesheet '${animName}' possui ${directions} linhas; o formato PMD aceita 1 ou 8 direções.`,
    );
  }
  if (frameCount !== durations.length) {
    throw new Error(
      `Spritesheet '${animName}' possui ${frameCount} colunas, mas AnimData.xml declara ${durations.length} durações.`,
    );
  }

  const warnings: string[] = [];
  const validateMetadataLayer = (source: CanvasImageSource | undefined, label: string) => {
    if (!source) {
      warnings.push(`Camada ${label} ausente em '${animName}'.`);
      return undefined;
    }
    const dimensions = getSourceDimensions(source);
    if (dimensions.width !== imageWidth || dimensions.height !== imageHeight) {
      throw new Error(
        `Camada ${label} de '${animName}' mede ${dimensions.width}x${dimensions.height}; esperado ${imageWidth}x${imageHeight}.`,
      );
    }
    return readSourcePixels(source, imageWidth, imageHeight);
  };

  const offsetsPixels = validateMetadataLayer(options.offsetsSource, "Offsets");
  const shadowsPixels = validateMetadataLayer(options.shadowsSource, "Shadow");
  const framesByDirection: Record<number, Frame[]> = {};

  for (let direction = 0; direction < directions; direction += 1) {
    framesByDirection[direction] = [];
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const startX = frameIndex * frameWidth;
      const startY = direction * frameHeight;
      const origin =
        findMarker(
          offsetsPixels,
          imageWidth,
          startX,
          startY,
          frameWidth,
          frameHeight,
          (_r, g, _b, a) => a > 0 && g > 200,
        ) || { x: Math.floor(frameWidth / 2), y: Math.floor(frameHeight / 2) };
      const shadowOrigin = findMarker(
        shadowsPixels,
        imageWidth,
        startX,
        startY,
        frameWidth,
        frameHeight,
        (r, g, b, a) => a > 0 && r > 200 && g > 200 && b > 200,
      );

      framesByDirection[direction].push({
        id: `${animId}_d${direction}_f${frameIndex}`,
        animationId: animId,
        direction,
        frameIndex,
        dataUrl: sliceCell(imageSource, startX, startY, frameWidth, frameHeight),
        offsetsDataUrl: options.offsetsSource
          ? sliceCell(options.offsetsSource, startX, startY, frameWidth, frameHeight)
          : undefined,
        shadowDataUrl: options.shadowsSource
          ? sliceCell(options.shadowsSource, startX, startY, frameWidth, frameHeight)
          : undefined,
        duration: durations[frameIndex],
        origin,
        shadowOrigin,
      });
    }
  }

  return { framesByDirection, directions, frameCount, warnings };
}

function clampCoordinate(value: number, max: number) {
  return Math.min(Math.max(Math.round(value), 0), Math.max(max - 1, 0));
}

function generatedMetadataCell(
  frame: Frame,
  frameWidth: number,
  frameHeight: number,
  layer: Exclude<SpriteSheetLayer, "sprite">,
) {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o contexto Canvas 2D.");

  const point = layer === "offsets" ? frame.origin : frame.shadowOrigin || frame.origin;
  context.fillStyle = layer === "offsets" ? "#00ff00" : "#ffffff";
  context.fillRect(
    clampCoordinate(point.x, frameWidth),
    clampCoordinate(point.y, frameHeight),
    1,
    1,
  );
  return canvas.toDataURL("image/png");
}

function layerDataUrl(
  frame: Frame,
  frameWidth: number,
  frameHeight: number,
  layer: SpriteSheetLayer,
) {
  if (layer === "sprite") return frame.dataUrl;
  if (layer === "offsets") {
    return frame.offsetsDataUrl || generatedMetadataCell(frame, frameWidth, frameHeight, layer);
  }
  return frame.shadowDataUrl || generatedMetadataCell(frame, frameWidth, frameHeight, layer);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma célula do spritesheet."));
    image.src = dataUrl;
  });
}

/** Reassembles sprite, offsets, or shadow cells into a PMD-compatible sheet. */
export async function assembleSpriteSheet(
  framesByDirection: Record<number, Frame[]>,
  frameWidth: number,
  frameHeight: number,
  directionsCount = 8,
  layer: SpriteSheetLayer = "sprite",
): Promise<string> {
  if (directionsCount !== 1 && directionsCount !== 8) {
    throw new Error(`Quantidade de direções inválida: ${directionsCount}.`);
  }
  const firstDirection = framesByDirection[0];
  if (!firstDirection?.length) throw new Error("A animação não possui frames na direção 0.");
  const frameCount = firstDirection.length;

  for (let direction = 0; direction < directionsCount; direction += 1) {
    const frames = framesByDirection[direction];
    if (!frames || frames.length !== frameCount) {
      throw new Error(
        `A direção ${direction} possui ${frames?.length || 0} frames; esperado ${frameCount}.`,
      );
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = frameWidth * frameCount;
  canvas.height = frameHeight * directionsCount;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o contexto Canvas 2D.");

  for (let direction = 0; direction < directionsCount; direction += 1) {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const frame = framesByDirection[direction][frameIndex];
      const image = await loadImage(layerDataUrl(frame, frameWidth, frameHeight, layer));
      context.drawImage(
        image,
        frameIndex * frameWidth,
        direction * frameHeight,
        frameWidth,
        frameHeight,
      );
    }
  }

  return canvas.toDataURL("image/png");
}
