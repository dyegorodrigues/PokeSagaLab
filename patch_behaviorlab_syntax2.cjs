const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

code = code.replace(/\\\${/g, '${');

fs.writeFileSync('src/components/BehaviorLab.tsx', code);
