import JSZip from "jszip";
import { Creature } from "../types";
import { assembleSpriteSheet } from "../domain/parser/animDataParser";

export async function exportCreatureToZip(creature: Creature): Promise<Blob> {
  const zip = new JSZip();

  // 1. Generate AnimData.xml
  let xmlContent = `<?xml version="1.0" encoding="utf-8"?>\n<AnimData>\n`;
  xmlContent += `  <ShadowSize>${creature.shadowSize ?? 1}</ShadowSize>\n`;
  xmlContent += `  <Anims>\n`;

  for (const anim of creature.animations) {
    xmlContent += `    <Anim>\n`;
    xmlContent += `      <Name>${anim.name}</Name>\n`;
    xmlContent += `      <Index>${anim.index}</Index>\n`;
    xmlContent += `      <FrameWidth>${anim.frameWidth}</FrameWidth>\n`;
    xmlContent += `      <FrameHeight>${anim.frameHeight}</FrameHeight>\n`;
    xmlContent += `      <Durations>\n`;
    for (const d of anim.durations) {
      xmlContent += `        <Duration>${d}</Duration>\n`;
    }
    xmlContent += `      </Durations>\n`;
    if (anim.rushFrame !== undefined) xmlContent += `      <RushFrame>${anim.rushFrame}</RushFrame>\n`;
    if (anim.hitFrame !== undefined) xmlContent += `      <HitFrame>${anim.hitFrame}</HitFrame>\n`;
    if (anim.returnFrame !== undefined) xmlContent += `      <ReturnFrame>${anim.returnFrame}</ReturnFrame>\n`;
    xmlContent += `    </Anim>\n`;
  }

  xmlContent += `  </Anims>\n</AnimData>`;

  zip.file("AnimData.xml", xmlContent);

  // 2. Generate PNG Spritesheets for each animation
  for (const anim of creature.animations) {
    const sheetDataUrl = await assembleSpriteSheet(
      anim.framesByDirection,
      anim.frameWidth,
      anim.frameHeight,
      anim.directions || 8
    );

    if (sheetDataUrl) {
      const base64Data = sheetDataUrl.replace(/^data:image\/png;base64,/, "");
      zip.file(`${anim.name}-Anim.png`, base64Data, { base64: true });
    }
  }

  // 3. Add manifest.json and License
  const manifest = {
    id: creature.id,
    displayName: creature.displayName,
    numericId: creature.numericId,
    sourceKind: creature.sourceKind,
    shadowSize: creature.shadowSize,
    license: creature.license,
    provenance: creature.provenance,
    exportedAt: new Date().toISOString(),
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "CREDITS_LICENSE.txt",
    `SAGA SpriteLab AI Export Package\n` +
      `Personagem: ${creature.displayName}\n` +
      `ID numérico: ${creature.numericId}\n` +
      `Origem: ${creature.provenance.origin}\n` +
      `Autor: ${creature.provenance.author}\n` +
      `Licença: ${creature.license}\n` +
      `Data de Exportação: ${new Date().toLocaleString("pt-BR")}\n`
  );

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// PMDSpriteManager inspired Firmware Exporter
export async function exportFirmwareOverworld(creature: Creature): Promise<Blob | null> {
  const walkAnim = creature.animations.find(a => a.name.toLowerCase() === "walk");
  const idleAnim = creature.animations.find(a => a.name.toLowerCase() === "idle");
  const sleepAnim = creature.animations.find(a => a.name.toLowerCase() === "sleep");

  if (!walkAnim && !idleAnim && !sleepAnim) {
    throw new Error("Pelo menos uma animação (Walk, Idle ou Sleep) é necessária para exportar firmware.");
  }

  const walkN = walkAnim ? walkAnim.durations.length : 0;
  const idleN = idleAnim ? idleAnim.durations.length : 0;
  const sleepN = sleepAnim ? sleepAnim.durations.length : 0;
  const N = Math.max(walkN, idleN, sleepN, 1);

  let maxWidth = 0;
  let maxHeight = 0;
  for (const anim of [walkAnim, idleAnim, sleepAnim]) {
    if (anim) {
      if (anim.frameWidth > maxWidth) maxWidth = anim.frameWidth;
      if (anim.frameHeight > maxHeight) maxHeight = anim.frameHeight;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = maxWidth * N;
  canvas.height = maxHeight * 9;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const SC_TO_FW_DIRS = [0, 2, 6, 4]; // S(0), W(2), E(6), N(4)

  const drawRow = async (anim: Animation | undefined, fwRowStart: number, frameCount: number, directions: number[]) => {
    if (!anim) return;
    for (let i = 0; i < directions.length; i++) {
      const fwRow = fwRowStart + i;
      const scDir = directions[i];
      const frames = anim.framesByDirection[scDir] || anim.framesByDirection[0] || [];
      
      for (let f = 0; f < frameCount; f++) {
        const frameIndex = f < frames.length ? f : f % frames.length;
        const frame = frames[frameIndex];
        if (frame && frame.dataUrl) {
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = frame.dataUrl;
          });
          const dx = (maxWidth - anim.frameWidth) / 2;
          const dy = (maxHeight - anim.frameHeight) / 2;
          ctx.drawImage(img, f * maxWidth + dx, fwRow * maxHeight + dy);
        }
      }
    }
  };

  // Walk: rows 0-3
  await drawRow(walkAnim, 0, walkN, SC_TO_FW_DIRS);
  // Idle: rows 4-7
  await drawRow(idleAnim, 4, idleN, SC_TO_FW_DIRS);
  // Sleep: row 8
  await drawRow(sleepAnim, 8, sleepN, [0]);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, "image/png");
  });
}
