import JSZip from "jszip";
import { Animation, Creature } from "../types";
import {
  SpriteSheetLayer,
  assembleSpriteSheet,
} from "../domain/parser/animDataParser";

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function appendOptionalNumber(lines: string[], tag: string, value?: number) {
  if (value !== undefined && Number.isFinite(value)) {
    lines.push(`      <${tag}>${value}</${tag}>`);
  }
}

function buildAnimDataXml(creature: Creature): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<AnimData>",
    `  <ShadowSize>${Number.isFinite(creature.shadowSize) ? creature.shadowSize : 1}</ShadowSize>`,
    "  <Anims>",
  ];

  for (const animation of creature.animations) {
    lines.push("    <Anim>");
    lines.push(`      <Name>${escapeXml(animation.name)}</Name>`);
    if (Number.isFinite(animation.index) && animation.index >= 0) {
      lines.push(`      <Index>${animation.index}</Index>`);
    }

    if (animation.copyOf) {
      lines.push(`      <CopyOf>${escapeXml(animation.copyOf)}</CopyOf>`);
    } else {
      if (!animation.durations.length) {
        throw new Error(`A animação '${animation.name}' não possui durações.`);
      }
      lines.push(`      <FrameWidth>${animation.frameWidth}</FrameWidth>`);
      lines.push(`      <FrameHeight>${animation.frameHeight}</FrameHeight>`);
      appendOptionalNumber(lines, "RushFrame", animation.rushFrame);
      appendOptionalNumber(lines, "HitFrame", animation.hitFrame);
      appendOptionalNumber(lines, "ReturnFrame", animation.returnFrame);
      lines.push("      <Durations>");
      for (const duration of animation.durations) {
        if (!Number.isInteger(duration) || duration <= 0) {
          throw new Error(
            `A animação '${animation.name}' possui duração inválida: ${duration}.`,
          );
        }
        lines.push(`        <Duration>${duration}</Duration>`);
      }
      lines.push("      </Durations>");
    }
    lines.push("    </Anim>");
  }

  lines.push("  </Anims>", "</AnimData>", "");
  return lines.join("\n");
}

function pngBase64(dataUrl: string, label: string): string {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error(`${label} não foi gerado como PNG base64 válido.`);
  return match[1];
}

async function addAnimationLayer(
  zip: JSZip,
  animation: Animation,
  layer: SpriteSheetLayer,
  filename: string,
) {
  const dataUrl = await assembleSpriteSheet(
    animation.framesByDirection,
    animation.frameWidth,
    animation.frameHeight,
    animation.directions,
    layer,
  );
  zip.file(filename, pngBase64(dataUrl, filename), { base64: true });
}

/** Exports a PMD/SpriteBot-compatible, round-trip-safe ZIP package. */
export async function exportCreatureToZip(creature: Creature): Promise<Blob> {
  if (!creature.animations.length) {
    throw new Error("O personagem não possui animações para exportar.");
  }

  const zip = new JSZip();
  zip.file("AnimData.xml", buildAnimDataXml(creature));

  for (const animation of creature.animations) {
    // CopyOf actions must not own duplicated sheets in the PMD format.
    if (animation.copyOf) continue;
    if (animation.directions !== 1 && animation.directions !== 8) {
      throw new Error(
        `A animação '${animation.name}' possui ${animation.directions} direções; esperado 1 ou 8.`,
      );
    }

    await Promise.all([
      addAnimationLayer(
        zip,
        animation,
        "sprite",
        `${animation.name}-Anim.png`,
      ),
      addAnimationLayer(
        zip,
        animation,
        "offsets",
        `${animation.name}-Offsets.png`,
      ),
      addAnimationLayer(
        zip,
        animation,
        "shadow",
        `${animation.name}-Shadow.png`,
      ),
    ]);
  }

  const manifest = {
    schemaVersion: 2,
    format: "PMD-SpriteBot",
    id: creature.id,
    displayName: creature.displayName,
    numericId: creature.numericId,
    sourceKind: creature.sourceKind,
    shadowSize: creature.shadowSize,
    license: creature.license,
    provenance: creature.provenance,
    animations: creature.animations.map((animation) => ({
      name: animation.name,
      index: animation.index,
      copyOf: animation.copyOf,
      directions: animation.directions,
      frameWidth: animation.frameWidth,
      frameHeight: animation.frameHeight,
      frameCount: animation.durations.length,
    })),
    exportedAt: new Date().toISOString(),
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "CREDITS_LICENSE.txt",
    [
      "SAGA SpriteLab AI — PMD Export Package",
      `Personagem: ${creature.displayName}`,
      `ID numérico: ${creature.numericId}`,
      `Origem: ${creature.provenance.origin}`,
      `Autor/créditos: ${creature.provenance.author}`,
      `Licença informada: ${creature.license}`,
      `Data de exportação: ${new Date().toISOString()}`,
      "",
      "Os direitos sobre personagens e contribuições permanecem com seus respectivos titulares.",
    ].join("\n"),
  );

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar um frame do firmware."));
    image.src = dataUrl;
  });
}

// Compact four-direction atlas used by the SAGA overworld prototype.
export async function exportFirmwareOverworld(creature: Creature): Promise<Blob> {
  const findAction = (name: string) =>
    creature.animations.find(
      (animation) => animation.name.toLowerCase() === name.toLowerCase(),
    );
  const walkAnimation = findAction("Walk");
  const idleAnimation = findAction("Idle");
  const sleepAnimation = findAction("Sleep");
  const available = [walkAnimation, idleAnimation, sleepAnimation].filter(
    (animation): animation is Animation => Boolean(animation),
  );

  if (!available.length) {
    throw new Error(
      "Pelo menos uma animação Walk, Idle ou Sleep é necessária para o firmware.",
    );
  }

  const outputFrameCount = Math.max(
    ...available.map((animation) => animation.durations.length),
  );
  const maxWidth = Math.max(...available.map((animation) => animation.frameWidth));
  const maxHeight = Math.max(...available.map((animation) => animation.frameHeight));
  const canvas = document.createElement("canvas");
  canvas.width = maxWidth * outputFrameCount;
  canvas.height = maxHeight * 9;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o canvas do firmware.");

  // Official row order used by this app: S, SE, E, NE, N, NW, W, SW.
  const fourDirections = [0, 6, 2, 4]; // S, W, E, N.

  const drawRows = async (
    animation: Animation | undefined,
    outputRowStart: number,
    directions: number[],
  ) => {
    if (!animation) return;
    for (let rowOffset = 0; rowOffset < directions.length; rowOffset += 1) {
      const requestedDirection = animation.directions === 1 ? 0 : directions[rowOffset];
      const frames = animation.framesByDirection[requestedDirection];
      if (!frames?.length) {
        throw new Error(
          `A animação '${animation.name}' não possui frames na direção ${requestedDirection}.`,
        );
      }
      for (let outputFrame = 0; outputFrame < outputFrameCount; outputFrame += 1) {
        const frame = frames[outputFrame % frames.length];
        const image = await loadImage(frame.dataUrl);
        const x = outputFrame * maxWidth + (maxWidth - animation.frameWidth) / 2;
        const y =
          (outputRowStart + rowOffset) * maxHeight +
          (maxHeight - animation.frameHeight) / 2;
        context.drawImage(image, x, y, animation.frameWidth, animation.frameHeight);
      }
    }
  };

  await drawRows(walkAnimation, 0, fourDirections);
  await drawRows(idleAnimation, 4, fourDirections);
  await drawRows(sleepAnimation, 8, [0]);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Falha ao codificar o atlas do firmware em PNG."));
    }, "image/png");
  });
}
