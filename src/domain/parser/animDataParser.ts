import { XMLParser } from "fast-xml-parser";
import { Animation, Frame } from "../../types";

export interface ParsedAnimData {
  shadowSize: number;
  anims: Array<{
    name: string;
    index: number;
    frameWidth: number;
    frameHeight: number;
    durations: number[];
    rushFrame?: number;
    hitFrame?: number;
    returnFrame?: number;
    extra?: Record<string, any>;
  }>;
}

/**
 * Parses AnimData.xml string into structured data.
 */
export function parseAnimDataXml(xmlString: string): ParsedAnimData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    trimValues: true,
  });

  try {
    const parsedObj = parser.parse(xmlString);
    const root = parsedObj.AnimData || parsedObj;

    const shadowSize = Number(root.ShadowSize ?? 1);
    let animListRaw = root.Anims?.Anim;

    if (!animListRaw) {
      animListRaw = [];
    } else if (!Array.isArray(animListRaw)) {
      animListRaw = [animListRaw];
    }

    const anims = animListRaw.map((anim: any) => {
      const name = String(anim.Name || "Unnamed");
      const index = Number(anim.Index ?? 0);
      const frameWidth = Number(anim.FrameWidth ?? 32);
      const frameHeight = Number(anim.FrameHeight ?? 32);

      let durations: number[] = [];
      if (anim.Durations?.Duration !== undefined) {
        const rawDur = anim.Durations.Duration;
        if (Array.isArray(rawDur)) {
          durations = rawDur.map((d: any) => Number(d));
        } else {
          durations = [Number(rawDur)];
        }
      }

      if (durations.length === 0) {
        durations = [6, 6, 6]; // Default fallback frame durations
      }

      return {
        name,
        index,
        frameWidth,
        frameHeight,
        durations,
        rushFrame: anim.RushFrame !== undefined ? Number(anim.RushFrame) : undefined,
        hitFrame: anim.HitFrame !== undefined ? Number(anim.HitFrame) : undefined,
        returnFrame: anim.ReturnFrame !== undefined ? Number(anim.ReturnFrame) : undefined,
      };
    });

    return { shadowSize, anims };
  } catch (err) {
    console.warn("Failed to parse AnimData.xml, using fallback defaults:", err);
    return {
      shadowSize: 1,
      anims: [
        { name: "Idle", index: 0, frameWidth: 32, frameHeight: 32, durations: [8, 8] },
        { name: "Walk", index: 1, frameWidth: 32, frameHeight: 32, durations: [6, 6, 6] },
        { name: "Attack", index: 2, frameWidth: 32, frameHeight: 32, durations: [4, 4, 4] },
      ],
    };
  }
}

/**
 * Cuts a spritesheet image into frame Data URLs by direction.
 * SpriteCollab convention:
 * 8 directions (Rows 0 to 7: S, SW, W, NW, N, NE, E, SE).
 * Columns 0 to N-1: Animation frame sequence.
 */
export async function sliceSpriteSheet(
  imageSource: HTMLImageElement | ImageBitmap | CanvasImageSource,
  frameWidth: number,
  frameHeight: number,
  durations: number[],
  animName: string,
  animId: string,
  directionsCount: number = 8,
  offsetsSource?: HTMLImageElement | ImageBitmap | CanvasImageSource
): Promise<Record<number, Frame[]>> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas 2D context");
  canvas.width = frameWidth;
  canvas.height = frameHeight;

  const imgW = (imageSource as any).naturalWidth || (imageSource as any).width || frameWidth;
  const imgH = (imageSource as any).naturalHeight || (imageSource as any).height || frameHeight;

  const sourceFrameWidth = durations.length > 0 ? Math.floor(imgW / durations.length) : Math.floor(imgW);
  const sourceFrameHeight = Math.floor(imgH / directionsCount);

  const actualCols = durations.length > 0 ? durations.length : 1;
  const actualRows = directionsCount;

  const totalFrames = durations.length;
  const finalDurations = durations;

  const framesByDirection: Record<number, Frame[]> = {};

  let offsetsData: ImageData | null = null;
  if (offsetsSource) {
    const offCanvas = document.createElement("canvas");
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
    if (offCtx) {
      offCanvas.width = imgW;
      offCanvas.height = imgH;
      offCtx.drawImage(offsetsSource, 0, 0, imgW, imgH);
      offsetsData = offCtx.getImageData(0, 0, imgW, imgH);
    }
  }

  for (let dir = 0; dir < directionsCount; dir++) {
    framesByDirection[dir] = [];
    const sourceRow = dir < actualRows ? dir : dir % actualRows;

    for (let f = 0; f < totalFrames; f++) {
      const sourceCol = f < actualCols ? f : f % actualCols;
      
      const startX = sourceCol * sourceFrameWidth;
      const startY = sourceRow * sourceFrameHeight;

      let originX = Math.floor(sourceFrameWidth / 2);
      let originY = Math.floor(sourceFrameHeight / 2);

      if (offsetsData) {
        let foundOrigin = false;
        // Search for the green pixel (0, 255, 0)
        for (let y = 0; y < sourceFrameHeight; y++) {
          for (let x = 0; x < sourceFrameWidth; x++) {
            const idx = ((startY + y) * imgW + (startX + x)) * 4;
            const r = offsetsData.data[idx];
            const g = offsetsData.data[idx + 1];
            const b = offsetsData.data[idx + 2];
            const a = offsetsData.data[idx + 3];
            
            if (a > 0 && g > 200 && r < 50 && b < 50) {
              originX = x;
              originY = y;
              foundOrigin = true;
              break;
            }
          }
          if (foundOrigin) break;
        }
      }

      ctx.clearRect(0, 0, frameWidth, frameHeight);

      // Target center of canvas
      const targetCenterX = Math.floor(frameWidth / 2);
      const targetCenterY = Math.floor(frameHeight / 2);

      // We want originX, originY of the source frame to land at targetCenterX, targetCenterY
      const dx = targetCenterX - originX;
      const dy = targetCenterY - originY;

      ctx.drawImage(
        imageSource,
        startX,
        startY,
        sourceFrameWidth,
        sourceFrameHeight,
        dx,
        dy,
        sourceFrameWidth,
        sourceFrameHeight
      );

      const frameDataUrl = canvas.toDataURL("image/png");

      framesByDirection[dir].push({
        id: `${animId}_d${dir}_f${f}`,
        animationId: animId,
        direction: dir,
        frameIndex: f,
        dataUrl: frameDataUrl,
        duration: finalDurations[f] || 6,
        origin: { x: targetCenterX, y: targetCenterY },
      });
    }
  }

  return framesByDirection;
}

/**
 * Re-assembles individual frames into a single unified Spritesheet Canvas/DataURL.
 * Properly awaits async image loading for every frame before exporting.
 */
export async function assembleSpriteSheet(
  framesByDirection: Record<number, Frame[]>,
  frameWidth: number,
  frameHeight: number,
  directionsCount: number = 8
): Promise<string> {
  const firstDirFrames = framesByDirection[0] || [];
  const frameCount = firstDirFrames.length || 1;

  const canvas = document.createElement("canvas");
  canvas.width = frameWidth * frameCount;
  canvas.height = frameHeight * directionsCount;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const loadImage = (dataUrl: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  // Render frames by row (direction) and col (frameIndex)
  for (let dir = 0; dir < directionsCount; dir++) {
    const dirFrames = framesByDirection[dir] || [];
    for (let f = 0; f < frameCount; f++) {
      const frame = dirFrames[f];
      if (frame && frame.dataUrl) {
        const img = await loadImage(frame.dataUrl);
        if (img) {
          ctx.drawImage(img, f * frameWidth, dir * frameHeight, frameWidth, frameHeight);
        }
      }
    }
  }

  return canvas.toDataURL("image/png");
}
