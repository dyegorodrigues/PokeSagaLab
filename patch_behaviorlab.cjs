const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

// Replace the rendering logic to use an image cache
const searchRender = `  // Render NPC & Scenery on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;`;

const replaceRender = `  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  // Render NPC & Scenery on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;`;

code = code.replace(searchRender, replaceRender);

const searchDraw = `    if (frame?.dataUrl) {
      const img = new Image();
      img.src = frame.dataUrl;
      const fw = animObj?.frameWidth || 32;
      const fh = animObj?.frameHeight || 32;
      ctx.drawImage(img, npcState.x - fw, npcState.y - fh, fw * 2, fh * 2);
    } else {`;

const replaceDraw = `    if (frame?.dataUrl) {
      const fw = animObj?.frameWidth || 32;
      const fh = animObj?.frameHeight || 32;
      
      const drawImage = (img: HTMLImageElement) => {
        ctx.save();
        ctx.translate(npcState.x, npcState.y);
        ctx.drawImage(img, -fw, -fh, fw * 2, fh * 2);
        ctx.restore();
      };

      if (imageCacheRef.current[frame.dataUrl]) {
        drawImage(imageCacheRef.current[frame.dataUrl]);
      } else {
        const img = new Image();
        img.onload = () => {
          imageCacheRef.current[frame.dataUrl] = img;
          drawImage(img);
        };
        img.src = frame.dataUrl;
      }
    } else {`;

code = code.replace(searchDraw, replaceDraw);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
