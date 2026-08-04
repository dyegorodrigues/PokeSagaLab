const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `    if (frame?.dataUrl) {
      const fw = animObj?.frameWidth || 32;
      const fh = animObj?.frameHeight || 32;
      
      const drawImage = (img: HTMLImageElement) => {
        ctx.save();
        ctx.translate(npcState.x, npcState.y);
        ctx.drawImage(img, -fw, -fh, fw * 2, fh * 2);
        ctx.restore();
      };`;

const replace = `    if (frame?.dataUrl) {
      const fw = animObj?.frameWidth || 32;
      const fh = animObj?.frameHeight || 32;
      const originX = frame.origin?.x || (fw / 2);
      const originY = frame.origin?.y || (fh / 2);
      
      const drawImage = (img: HTMLImageElement) => {
        ctx.save();
        ctx.translate(npcState.x, npcState.y);
        // Scale by 2x for visibility, so offset the origin accordingly
        ctx.drawImage(img, -originX * 2, -originY * 2, fw * 2, fh * 2);
        ctx.restore();
      };`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
