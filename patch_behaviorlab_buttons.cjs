const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `            {/* Interactive Control Palette */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <button
                onClick={() => engine.interactFeed()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <Apple className="w-3.5 h-3.5 text-rose-400" />
                <span>Alimentar</span>
              </button>
              <button
                onClick={() => engine.interactPet()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span>Carinho</span>
              </button>
              <button
                onClick={() => engine.interactAttack()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Atacar</span>
              </button>
              <button
                onClick={() => engine.forceState("sleep")}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dormir</span>
              </button>
              <button
                onClick={() => engine.interactHurt()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Reagir</span>
              </button>
            </div>`;

const replace = `            {/* Interactive Control Palette */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
              <button
                onClick={() => engine.interactFeed()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                title="Aumenta Fome e Felicidade"
              >
                <Apple className="w-3.5 h-3.5 text-rose-400" />
                <span>Alimentar</span>
              </button>
              <button
                onClick={() => engine.interactPet()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                title="Aumenta Felicidade"
              >
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span>Carinho</span>
              </button>
              
              {/* Dynamically list available animations to test */}
              {creature.animations.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => engine.forceState(anim.name.toLowerCase())}
                  className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate max-w-[80px]">{anim.name}</span>
                </button>
              ))}
            </div>`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
