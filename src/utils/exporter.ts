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
