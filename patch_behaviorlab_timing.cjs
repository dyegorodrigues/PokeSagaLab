const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `    const currentFrameIndex = Math.floor(npcState.stateTimer * 6) % Math.max(1, frames.length);
    const frame = frames[currentFrameIndex] || frames[0];`;

const replace = `    // Calculate exact frame based on durations
    let currentFrameIndex = 0;
    if (frames.length > 0) {
      // stateTimer is in seconds.
      const timerMs = npcState.stateTimer * 1000;
      let totalAnimTimeMs = 0;
      
      // Calculate total duration for a full loop
      for (const f of frames) {
        totalAnimTimeMs += (f.duration || 6) * 33.3;
      }
      
      if (totalAnimTimeMs > 0) {
        let currentLoopMs = timerMs % totalAnimTimeMs;
        for (let i = 0; i < frames.length; i++) {
          const fDurationMs = (frames[i].duration || 6) * 33.3;
          if (currentLoopMs < fDurationMs) {
            currentFrameIndex = i;
            break;
          }
          currentLoopMs -= fDurationMs;
        }
      }
    }
    const frame = frames[currentFrameIndex] || frames[0];`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
