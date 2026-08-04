const fs = require('fs');
let code = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');

const search = `                    {/* Pixel Grid Overlay */}
                    {showGrid && (
                      <div
                        className="absolute border border-indigo-500/30 pointer-events-none z-20"`;

const replace = `                    {/* Isometric Grid Overlay */}
                    {viewMode === "isometric" && (
                      <div className="absolute pointer-events-none z-0" style={{ width: 0, height: 0 }}>
                        <svg className="overflow-visible" width="0" height="0" style={{ position: 'absolute', top: 0, left: 0 }}>
                          <g transform="scale(1, 0.5) rotate(45)">
                            <rect x="-100" y="-100" width="200" height="200" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
                            <rect x="-50" y="-50" width="100" height="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
                            <line x1="-200" y1="0" x2="200" y2="0" stroke="rgba(100,200,255,0.3)" strokeWidth="2" />
                            <line x1="0" y1="-200" x2="0" y2="200" stroke="rgba(100,200,255,0.3)" strokeWidth="2" />
                          </g>
                        </svg>
                        {/* Center Anchor Point (Red Cross) */}
                        <div className="absolute w-2 h-2 -ml-1 -mt-1 bg-red-500 rounded-full shadow-lg border border-white" />
                      </div>
                    )}

                    {/* Pixel Grid Overlay */}
                    {showGrid && viewMode === "standard" && (
                      <div
                        className="absolute border border-indigo-500/30 pointer-events-none z-20"`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/AnimationStudio.tsx', code);
