const fs = require('fs');
let code = fs.readFileSync('src/domain/behavior/behaviorEngine.ts', 'utf8');

const search = `export type NPCAction = "idle" | "lookAround" | "walk" | "eat" | "sleep" | "happy" | "attack" | "hurt";`;
const replace = `export type NPCAction = string;`;

code = code.replace(search, replace);

const transitionSwitchSearch = `      case "hurt":
        if (this.state.stateTimer > 2) {
          this.transitionTo("idle", "Recuperou-se do impacto.");
        }
        break;
    }`;

const transitionSwitchReplace = `      case "hurt":
        if (this.state.stateTimer > 2) {
          this.transitionTo("idle", "Recuperou-se do impacto.");
        }
        break;
      default:
        // Generic fallback for custom animations forced via UI
        if (this.state.stateTimer > 3) {
          this.transitionTo("idle", "Ação personalizada finalizada.");
        }
        break;
    }`;
code = code.replace(transitionSwitchSearch, transitionSwitchReplace);
fs.writeFileSync('src/domain/behavior/behaviorEngine.ts', code);
