const fs = require('fs');
let code = fs.readFileSync('src/domain/behavior/behaviorEngine.ts', 'utf8');

const search = `  public tick(dt: number): NPCState {`;
const replace = `  private availableActions: string[] = ["idle", "walk", "sleep", "eat"];

  public setAvailableActions(actions: string[]) {
    this.availableActions = actions;
  }

  public tick(dt: number): NPCState {`;

code = code.replace(search, replace);

const searchRandom = `          // Choose randomly between walking or looking around
          if (Math.random() < 0.6) {
            this.pickNewTarget();
            this.transitionTo("walk", "Vadiando pelo mapa.");
          } else {
            this.transitionTo("lookAround", "Observando os arredores.");
          }`;

const replaceRandom = `          // Choose randomly between walking, looking around, or a random custom action
          const rand = Math.random();
          if (rand < 0.5) {
            this.pickNewTarget();
            this.transitionTo("walk", "Vadiando pelo mapa.");
          } else if (rand < 0.8) {
            this.transitionTo("lookAround", "Observando os arredores.");
          } else {
            const customActions = this.availableActions.filter(a => !["idle", "walk", "sleep", "eat", "lookaround", "hurt", "attack"].includes(a.toLowerCase()));
            if (customActions.length > 0) {
              const randAction = customActions[Math.floor(Math.random() * customActions.length)];
              this.transitionTo(randAction, \`Executando ação variada: \${randAction}\`);
            } else {
              this.transitionTo("lookAround", "Observando os arredores.");
            }
          }`;

code = code.replace(searchRandom, replaceRandom);
fs.writeFileSync('src/domain/behavior/behaviorEngine.ts', code);
