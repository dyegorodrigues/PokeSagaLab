const fs = require('fs');
let code = fs.readFileSync('src/domain/behavior/behaviorEngine.ts', 'utf8');

const search = `  private calculateDirection(dx: number, dy: number): number {
    const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
    // Standard 8 directions
    if (angle >= 67.5 && angle < 112.5) return 0; // South
    if (angle >= 112.5 && angle < 157.5) return 1; // South-West
    if (angle >= 157.5 || angle < -157.5) return 2; // West
    if (angle >= -157.5 && angle < -112.5) return 3; // North-West
    if (angle >= -112.5 && angle < -67.5) return 4; // North
    if (angle >= -67.5 && angle < -22.5) return 5; // North-East
    if (angle >= -22.5 && angle < 22.5) return 6; // East
    if (angle >= 22.5 && angle < 67.5) return 7; // South-East
    return 0;
  }`;

const replace = `  private calculateDirection(dx: number, dy: number): number {
    const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
    // PMD SpriteCollab Standard 8 directions: S(0), SE(1), E(2), NE(3), N(4), NW(5), W(6), SW(7)
    if (angle >= 67.5 && angle < 112.5) return 0; // South
    if (angle >= 22.5 && angle < 67.5) return 1; // South-East
    if (angle >= -22.5 && angle < 22.5) return 2; // East
    if (angle >= -67.5 && angle < -22.5) return 3; // North-East
    if (angle >= -112.5 && angle < -67.5) return 4; // North
    if (angle >= -157.5 && angle < -112.5) return 5; // North-West
    if (angle >= 157.5 || angle < -157.5) return 6; // West
    if (angle >= 112.5 && angle < 157.5) return 7; // South-West
    return 0;
  }`;

code = code.replace(search, replace);
fs.writeFileSync('src/domain/behavior/behaviorEngine.ts', code);

let animStudio = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');
animStudio = animStudio.replace(
    '["S", "SW", "W", "NW", "N", "NE", "E", "SE"]',
    '["S", "SE", "E", "NE", "N", "NW", "W", "SW"]'
);
fs.writeFileSync('src/components/AnimationStudio.tsx', animStudio);
