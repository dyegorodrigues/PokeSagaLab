const fs = require('fs');

let code = fs.readFileSync('src/components/PixelEditor.tsx', 'utf8');

const oldBucketCode = `    } else if (tool === "bucket") {
      ctx.fillStyle = selectedColor;
      ctx.fillRect(0, 0, width, height); // Fill frame canvas
    }
  };`;

const newBucketCode = `    } else if (tool === "bucket") {
      // Implement true Flood Fill
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      
      const targetIdx = (y * width + x) * 4;
      const targetR = data[targetIdx];
      const targetG = data[targetIdx+1];
      const targetB = data[targetIdx+2];
      const targetA = data[targetIdx+3];
      
      // Parse selected color hex to RGB
      const fillHex = selectedColor.replace('#', '');
      const fillR = parseInt(fillHex.substring(0,2), 16);
      const fillG = parseInt(fillHex.substring(2,4), 16);
      const fillB = parseInt(fillHex.substring(4,6), 16);
      const fillA = 255;
      
      if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
        return; // Already same color
      }
      
      const pixelsToCheck = [[x, y]];
      
      while(pixelsToCheck.length > 0) {
        const [cx, cy] = pixelsToCheck.pop();
        const idx = (cy * width + cx) * 4;
        
        if (data[idx] === targetR && data[idx+1] === targetG && data[idx+2] === targetB && data[idx+3] === targetA) {
          data[idx] = fillR;
          data[idx+1] = fillG;
          data[idx+2] = fillB;
          data[idx+3] = fillA;
          
          if (cx > 0) pixelsToCheck.push([cx - 1, cy]);
          if (cx < width - 1) pixelsToCheck.push([cx + 1, cy]);
          if (cy > 0) pixelsToCheck.push([cx, cy - 1]);
          if (cy < height - 1) pixelsToCheck.push([cx, cy + 1]);
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
    }
  };`;

code = code.replace(oldBucketCode, newBucketCode);
fs.writeFileSync('src/components/PixelEditor.tsx', code);
