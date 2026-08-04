const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `    // Find animation frame matching NPC action and direction
    let animName = "Walk";
    if (npcState.currentAction === "idle" || npcState.currentAction === "lookAround") animName = "Idle";
    if (npcState.currentAction === "eat") animName = "Eat";
    if (npcState.currentAction === "sleep") animName = "Sleep";
    if (npcState.currentAction === "happy") animName = "Idle";
    if (npcState.currentAction === "attack") animName = "Attack";
    if (npcState.currentAction === "hurt") animName = "Hurt";

    const animObj =
      creature.animations.find((a) => a.name.toLowerCase() === animName.toLowerCase()) ||
      creature.animations[0];`;

const replace = `    // Find animation frame matching NPC action and direction
    let animName = npcState.currentAction;
    // Map abstract behaviors to common animation names if they exist
    if (npcState.currentAction === "idle" || npcState.currentAction === "lookAround") animName = "Idle";
    if (npcState.currentAction === "happy") animName = "Idle";
    
    let animObj = creature.animations.find((a) => a.name.toLowerCase() === animName.toLowerCase());
    
    // Fallbacks if mapped animation is missing
    if (!animObj) {
        if (npcState.currentAction === "walk") animObj = creature.animations.find((a) => a.name.toLowerCase() === "walk");
        if (!animObj) animObj = creature.animations.find((a) => a.name.toLowerCase() === "idle");
        if (!animObj) animObj = creature.animations[0];
    }`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
