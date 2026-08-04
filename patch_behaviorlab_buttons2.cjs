const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = /{.*Interactive Control Palette.*}/s;
const endSearch = /<\/div>\s*<\/div>\s*<\/div>\s*{\/\* Right Side/;

const match = code.match(search);
const endMatch = code.match(endSearch);

if (match && endMatch) {
  const startIndex = match.index;
  const endIndex = endMatch.index;
  
  const replaceStr = `            {/* Interactive Control Palette */}
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
                  title={\`Testar animação \${anim.name}\`}
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate max-w-[80px]">{anim.name}</span>
                </button>
              ))}
            </div>`;
  
  code = code.substring(0, startIndex) + replaceStr + code.substring(endIndex);
  fs.writeFileSync('src/components/BehaviorLab.tsx', code);
}
