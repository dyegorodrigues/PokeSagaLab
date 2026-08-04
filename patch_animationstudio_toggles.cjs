const fs = require('fs');
let code = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');

const search = `                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={showShadow}`;

const replace = `                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={viewMode === "isometric"}
                    onChange={(e) => setViewMode(e.target.checked ? "isometric" : "standard")}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-emerald-400 font-medium">Isométrica</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={showShadow}`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/AnimationStudio.tsx', code);
