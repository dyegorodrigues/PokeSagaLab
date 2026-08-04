import { BoundingBox } from "../types";

export interface AlphaCleanOptions {
  matteColor?: string;
  tolerance?: number;
  removeFringe?: boolean;
}

export interface AlphaValidationResult {
  isValid: boolean;
  /** Percentage of fully transparent pixels in the output image. */
  alphaCoveragePercent: number;
  boundingBox: BoundingBox;
  hasOpaqueCorners: boolean;
  issues: string[];
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface NormalizedFrameResult {
  dataUrl: string;
  boundingBox: BoundingBox;
  width: number;
  height: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao decodificar a imagem."));
    image.src = source;
  });
}

function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) throw new Error(`Cor matte inválida: '${hex}'.`);
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function isNearMatte(
  data: Uint8ClampedArray,
  byteIndex: number,
  matte: Rgb,
  tolerance: number,
) {
  return (
    colorDistance(
      data[byteIndex],
      data[byteIndex + 1],
      data[byteIndex + 2],
      matte.r,
      matte.g,
      matte.b,
    ) <= tolerance
  );
}

function computeValidation(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): AlphaValidationResult {
  let transparentPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        transparentPixels += 1;
      } else {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const corners = [
    3,
    (width - 1) * 4 + 3,
    (height - 1) * width * 4 + 3,
    ((height - 1) * width + width - 1) * 4 + 3,
  ];
  const hasOpaqueCorners = corners.some((index) => data[index] > 20);
  const boundingBox: BoundingBox =
    maxX >= minX && maxY >= minY
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : { x: 0, y: 0, width: 0, height: 0 };
  const alphaCoveragePercent = Math.round(
    (transparentPixels / Math.max(1, width * height)) * 100,
  );
  const issues: string[] = [];
  if (hasOpaqueCorners) issues.push("Cantos ainda possuem pixels opacos.");
  if (alphaCoveragePercent === 0) issues.push("Nenhuma transparência foi detectada.");
  if (boundingBox.width === 0 || boundingBox.height === 0) {
    issues.push("A imagem ficou totalmente transparente.");
  }
  if (
    boundingBox.width === width &&
    boundingBox.height === height &&
    alphaCoveragePercent < 5
  ) {
    issues.push("O fundo não foi separado do personagem.");
  }

  return {
    isValid: issues.length === 0,
    alphaCoveragePercent,
    boundingBox,
    hasOpaqueCorners,
    issues,
    sourceWidth: width,
    sourceHeight: height,
  };
}

/**
 * Removes only the matte-connected exterior. Character whites and other colors are
 * preserved unless the selected matte itself is white.
 */
export async function cleanImageAlpha(
  imageDataUrl: string,
  options: AlphaCleanOptions = {},
): Promise<{ cleanedDataUrl: string; validation: AlphaValidationResult }> {
  const matte = hexToRgb(options.matteColor || "#FF00FF");
  const tolerance = clamp(Math.round(options.tolerance ?? 35), 0, 255);
  const removeFringe = options.removeFringe !== false;
  const image = await loadImage(imageDataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("A imagem não possui dimensões válidas.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Contexto Canvas 2D indisponível.");
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const enqueue = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) queue.push(y * width + x);
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const pixelIndex = queue[head++];
    if (visited[pixelIndex]) continue;
    visited[pixelIndex] = 1;
    const byteIndex = pixelIndex * 4;
    const alpha = data[byteIndex + 3];
    if (alpha > 20 && !isNearMatte(data, byteIndex, matte, tolerance)) continue;

    data[byteIndex] = 0;
    data[byteIndex + 1] = 0;
    data[byteIndex + 2] = 0;
    data[byteIndex + 3] = 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  if (removeFringe) {
    const originalAlpha = new Uint8ClampedArray(width * height);
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      originalAlpha[pixelIndex] = data[pixelIndex * 4 + 3];
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const byteIndex = pixelIndex * 4;
        if (data[byteIndex + 3] === 0) continue;
        if (!isNearMatte(data, byteIndex, matte, tolerance * 1.35)) continue;

        const hasTransparentNeighbor =
          (x > 0 && originalAlpha[pixelIndex - 1] === 0) ||
          (x < width - 1 && originalAlpha[pixelIndex + 1] === 0) ||
          (y > 0 && originalAlpha[pixelIndex - width] === 0) ||
          (y < height - 1 && originalAlpha[pixelIndex + width] === 0);
        if (hasTransparentNeighbor) {
          data[byteIndex] = 0;
          data[byteIndex + 1] = 0;
          data[byteIndex + 2] = 0;
          data[byteIndex + 3] = 0;
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return {
    cleanedDataUrl: canvas.toDataURL("image/png"),
    validation: computeValidation(data, width, height),
  };
}

/** Crops transparent margins and resamples into the exact logical PMD cell. */
export async function normalizeFrameImage(
  cleanedDataUrl: string,
  boundingBox: BoundingBox,
  targetWidth: number,
  targetHeight: number,
  padding = 1,
): Promise<NormalizedFrameResult> {
  if (!Number.isInteger(targetWidth) || targetWidth <= 0) {
    throw new Error(`Largura alvo inválida: ${targetWidth}.`);
  }
  if (!Number.isInteger(targetHeight) || targetHeight <= 0) {
    throw new Error(`Altura alvo inválida: ${targetHeight}.`);
  }
  if (boundingBox.width <= 0 || boundingBox.height <= 0) {
    throw new Error("Não existe conteúdo opaco para normalizar.");
  }

  const image = await loadImage(cleanedDataUrl);
  const safePadding = clamp(Math.round(padding), 0, Math.floor(Math.min(targetWidth, targetHeight) / 3));
  const availableWidth = Math.max(1, targetWidth - safePadding * 2);
  const availableHeight = Math.max(1, targetHeight - safePadding * 2);
  const scale = Math.min(
    availableWidth / boundingBox.width,
    availableHeight / boundingBox.height,
  );
  const outputWidth = Math.max(1, Math.round(boundingBox.width * scale));
  const outputHeight = Math.max(1, Math.round(boundingBox.height * scale));
  const outputX = Math.floor((targetWidth - outputWidth) / 2);
  const outputY = Math.max(safePadding, targetHeight - safePadding - outputHeight);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contexto Canvas 2D indisponível.");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    image,
    boundingBox.x,
    boundingBox.y,
    boundingBox.width,
    boundingBox.height,
    outputX,
    outputY,
    outputWidth,
    outputHeight,
  );

  return {
    dataUrl: canvas.toDataURL("image/png"),
    boundingBox: {
      x: outputX,
      y: outputY,
      width: outputWidth,
      height: outputHeight,
    },
    width: targetWidth,
    height: targetHeight,
  };
}
