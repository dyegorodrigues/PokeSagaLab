const fs = require('fs');
const { PNG } = require('pngjs');
const offsetsData = PNG.sync.read(fs.readFileSync('Walk-Offsets.png'));
const imgW = offsetsData.width;
const imgH = offsetsData.height;
const frameWidth = 32;
const frameHeight = 40;
const actualCols = Math.floor(imgW / frameWidth);
const actualRows = Math.floor(imgH / frameHeight);

for (let dir = 0; dir < actualRows; dir++) {
  for (let f = 0; f < actualCols; f++) {
    const startX = f * frameWidth;
    const startY = dir * frameHeight;
    let originX = -1, originY = -1;
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const idx = ((startY + y) * imgW + (startX + x)) * 4;
        const r = offsetsData.data[idx];
        const g = offsetsData.data[idx + 1];
        const b = offsetsData.data[idx + 2];
        const a = offsetsData.data[idx + 3];
        if (a > 0 && g > 200 && r < 50 && b < 50) {
          originX = x;
          originY = y;
          break;
        }
      }
      if (originX !== -1) break;
    }
    if (originX === -1) {
      console.log(`dir=${dir} f=${f} MISSING GREEN PIXEL`);
    }
  }
}
