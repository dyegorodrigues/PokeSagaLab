import { BoundingBox } from "../types";

export interface AlphaCleanOptions {
  matteColor?: string; // e.g. "#FF00FF", "#00FF00", "#FFFFFF"
  tolerance?: number; // 0 to 255 (default 30)
  removeFringe?: boolean;
}

export interface AlphaValidationResult {
  isValid: boolean;
  alphaCoveragePercent: number;
  boundingBox: BoundingBox;
  hasOpaqueCorners: boolean;
  issues: string[];
}

/**
 * Cleans image alpha by flood-filling background from corners/edges
 * and applying matte keying and fringe removal.
 */
export async function cleanImageAlpha(
  imageDataUrl: string,
  options: AlphaCleanOptions = {}
): Promise<{ cleanedDataUrl: string; validation: AlphaValidationResult }> {
  const matteHex = options.matteColor || "#FF00FF";
  const tolerance = options.tolerance ?? 35;
  const removeFringe = options.removeFringe !== false;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const width = img.width;
      const height = img.height;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({
          cleanedDataUrl: imageDataUrl,
          validation: {
            isValid: false,
            alphaCoveragePercent: 0,
            boundingBox: { x: 0, y: 0, width, height },
            hasOpaqueCorners: false,
            issues: ["Contexto 2D indisponível"],
          },
        });
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Parse target matte RGB
      const matteRgb = hexToRgb(matteHex);

      // Flood fill mask starting from perimeter pixels
      const visited = new Uint8Array(width * height);
      const queue: number[] = [];

      // Add all boundary pixels to queue
      for (let x = 0; x < width; x++) {
        queue.push(x, 0); // top
        queue.push(x, height - 1); // bottom
      }
      for (let y = 0; y < height; y++) {
        queue.push(0, y); // left
        queue.push(width - 1, y); // right
      }

      let head = 0;
      while (head < queue.length) {
        const x = queue[head++];
        const y = queue[head++];
        const idx = y * width + x;

        if (visited[idx]) continue;
        visited[idx] = 1;

        const pixelIdx = idx * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        const a = data[pixelIdx + 3];

        // Check if pixel matches background matte or is near transparent/white
        const isMatteMatch =
          colorDistance(r, g, b, matteRgb.r, matteRgb.g, matteRgb.b) <= tolerance;
        const isWhiteOrNearWhite =
          r > 240 && g > 240 && b > 240 && colorDistance(r, g, b, 255, 255, 255) <= tolerance;
        const isAlreadyTransparent = a < 20;

        if (isMatteMatch || isWhiteOrNearWhite || isAlreadyTransparent) {
          // Set pixel to fully transparent
          data[pixelIdx + 3] = 0;

          // Push neighbors
          if (x > 0 && !visited[y * width + (x - 1)]) queue.push(x - 1, y);
          if (x < width - 1 && !visited[y * width + (x + 1)]) queue.push(x + 1, y);
          if (y > 0 && !visited[(y - 1) * width + x]) queue.push(x, y - 1);
          if (y < height - 1 && !visited[(y + 1) * width + x]) queue.push(x, y + 1);
        }
      }

      // Optional fringe removal: soften semi-transparent/matte colored edges
      if (removeFringe) {
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const a = data[idx + 3];
            if (a > 0 && a < 255) {
              // De-fringe
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              if (colorDistance(r, g, b, matteRgb.r, matteRgb.g, matteRgb.b) < tolerance * 1.5) {
                data[idx + 3] = 0;
              }
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Validation metrics
      let transparentPixels = 0;
      let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      let hasOpaqueCorners = false;

      const cornerIndices = [
        0,
        (width - 1) * 4,
        (height - 1) * width * 4,
        ((height - 1) * width + (width - 1)) * 4,
      ];
      for (const ci of cornerIndices) {
        if (data[ci + 3] > 200) hasOpaqueCorners = true;
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const a = data[(y * width + x) * 4 + 3];
          if (a === 0) {
            transparentPixels++;
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const totalPixels = width * height;
      const alphaCoveragePercent = Math.round((transparentPixels / totalPixels) * 100);

      const boundingBox: BoundingBox =
        minX <= maxX && minY <= maxY
          ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
          : { x: 0, y: 0, width: 0, height: 0 };

      const issues: string[] = [];
      if (hasOpaqueCorners) issues.push("Cantos ainda possuem pixels opacos");
      if (alphaCoveragePercent === 0) issues.push("Nenhuma transparência detectada na imagem");
      if (boundingBox.width === 0) issues.push("Imagem totalmente transparente");

      const cleanedDataUrl = canvas.toDataURL("image/png");

      resolve({
        cleanedDataUrl,
        validation: {
          isValid: issues.length === 0,
          alphaCoveragePercent,
          boundingBox,
          hasOpaqueCorners,
          issues,
        },
      });
    };

    img.onerror = () => {
      resolve({
        cleanedDataUrl: imageDataUrl,
        validation: {
          isValid: false,
          alphaCoveragePercent: 0,
          boundingBox: { x: 0, y: 0, width: 32, height: 32 },
          hasOpaqueCorners: false,
          issues: ["Falha ao carregar imagem para limpeza"],
        },
      });
    };

    img.src = imageDataUrl;
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
