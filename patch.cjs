const fs = require('fs');
let code = fs.readFileSync('src/utils/importer.ts', 'utf8');

const target = `    let framesByDir: Record<number, Frame[]> = {};
    if (imageFile) {
      const base64Img = await imageFile.async("base64");
      const imgDataUrl = \`data:image/png;base64,\${base64Img}\`;

      // Load image into memory to slice
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imgDataUrl;
      });

      framesByDir = await sliceSpriteSheet(
        img,
        animDef.frameWidth,
        animDef.frameHeight,
        animDef.durations,
        animName,
        animId,
        8
      );`;

const replacement = `    const offsetsFile = 
      zip.file(\`\${animName}-Offsets.png\`) ||
      zip.file(new RegExp(\`/\${animName}-Offsets\\\\.png$\`, "i"))[0] ||
      zip.file(new RegExp(\`^\${animName}-Offsets\\\\.png$\`, "i"))[0];

    let framesByDir: Record<number, Frame[]> = {};
    if (imageFile) {
      const base64Img = await imageFile.async("base64");
      const imgDataUrl = \`data:image/png;base64,\${base64Img}\`;

      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imgDataUrl;
      });

      let offImg = undefined;
      if (offsetsFile) {
        const offBase64 = await offsetsFile.async("base64");
        offImg = new Image();
        await new Promise((resolve) => {
          offImg.onload = resolve;
          offImg.src = \`data:image/png;base64,\${offBase64}\`;
        });
      }

      framesByDir = await sliceSpriteSheet(
        img,
        animDef.frameWidth,
        animDef.frameHeight,
        animDef.durations,
        animName,
        animId,
        8,
        offImg
      );`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/importer.ts', code);
