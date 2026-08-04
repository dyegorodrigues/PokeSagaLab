const fs = require('fs');

let animStudio = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');
animStudio = animStudio.replace(
    /const directionLabels = \[[\s\S]*?\];/,
    `const directionLabels = [
    "0: Sul (S)",
    "1: Sudeste (SE)",
    "2: Leste (E)",
    "3: Nordeste (NE)",
    "4: Norte (N)",
    "5: Noroeste (NW)",
    "6: Oeste (W)",
    "7: Sudoeste (SW)",
  ];`
);
fs.writeFileSync('src/components/AnimationStudio.tsx', animStudio);
