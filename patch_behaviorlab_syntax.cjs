const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

code = code.replace('className={\\`px-2', 'className={`px-2');
code = code.replace('}\\`}', '}`}');
code = code.replace('title={\\`Testar', 'title={`Testar');
code = code.replace('name}\\`}', 'name}`}');
code = code.replace('style={{ width: \\`\\${npcState.energy}%\\` }}', 'style={{ width: `${npcState.energy}%` }}');
code = code.replace('style={{ width: \\`\\${npcState.hunger}%\\` }}', 'style={{ width: `${npcState.hunger}%` }}');
code = code.replace('style={{ width: \\`\\${npcState.happiness}%\\` }}', 'style={{ width: `${npcState.happiness}%` }}');

fs.writeFileSync('src/components/BehaviorLab.tsx', code);
