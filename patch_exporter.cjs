const fs = require('fs');
let code = fs.readFileSync('src/utils/exporter.ts', 'utf8');

const newCode = `

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
`;

code += newCode;
fs.writeFileSync('src/utils/exporter.ts', code);
