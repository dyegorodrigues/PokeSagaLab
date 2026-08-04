const fs = require('fs');
let code = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');

const search = `                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono">
                    Frame <strong className="text-slate-200">{currentFrameIndex + 1}</strong> / {frames.length}
                  </span>`;

const replace = `                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono flex flex-col">
                    <span>Frame <strong className="text-slate-200">{currentFrameIndex + 1}</strong> / {frames.length}</span>
                    {viewMode === "isometric" && currentFrame?.origin && (
                      <span className="text-[10px] text-emerald-400 mt-1 font-semibold">
                        Render Offset: [X: {(activeAnim?.frameWidth || 32)/2 - currentFrame.origin.x}, Y: {(activeAnim?.frameHeight || 32)/2 - currentFrame.origin.y}]
                      </span>
                    )}
                  </span>`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/AnimationStudio.tsx', code);
