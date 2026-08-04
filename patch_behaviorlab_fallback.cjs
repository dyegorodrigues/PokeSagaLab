const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `    } else {
      ctx.fillStyle = "#facc15";
      ctx.fillRect(npcState.x - 12, npcState.y - 12, 24, 24);
    }`;

const replace = `    } else {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(npcState.x - 8, npcState.y - 8, 16, 16);
      ctx.fillStyle = "white";
      ctx.font = "bold 12px Arial";
      ctx.fillText("?", npcState.x, npcState.y + 4);
    }`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
