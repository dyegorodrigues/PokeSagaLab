import { NPCState } from "../../types";

export type NPCAction = string;

export interface BehaviorLogEntry {
  timestamp: string;
  action: NPCAction;
  message: string;
}

export class BehaviorEngine {
  private state: NPCState;
  private stageWidth: number;
  private stageHeight: number;
  private logs: BehaviorLogEntry[] = [];

  constructor(stageWidth = 600, stageHeight = 400) {
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;

    this.state = {
      currentAction: "idle",
      x: Math.floor(stageWidth / 2),
      y: Math.floor(stageHeight / 2),
      direction: 0, // South
      energy: 85,
      hunger: 20,
      happiness: 80,
      isMoving: false,
      stateTimer: 0,
      lastInteraction: Date.now(),
    };

    this.addLog("idle", "NPC ativado no laboratório de comportamento.");
  }

  public getState(): NPCState {
    return { ...this.state };
  }

  public getLogs(): BehaviorLogEntry[] {
    return [...this.logs];
  }

  public setStageBounds(width: number, height: number) {
    this.stageWidth = width;
    this.stageHeight = height;
  }

  /**
   * Advances simulation by deltaTime in seconds
   */
  private availableActions: string[] = ["idle", "walk", "sleep", "eat"];

  public setAvailableActions(actions: string[]) {
    this.availableActions = actions;
  }

  public tick(dt: number): NPCState {
    this.state.stateTimer += dt;

    // Decay stats over time
    this.state.energy = Math.max(0, this.state.energy - dt * 0.5);
    this.state.hunger = Math.min(100, this.state.hunger + dt * 0.8);
    this.state.happiness = Math.max(0, this.state.happiness - dt * 0.3);

    // State Machine Transitions
    switch (this.state.currentAction) {
      case "idle":
        if (this.state.hunger > 80 && this.state.energy > 30) {
          this.transitionTo("eat", "Iniciando busca por comida devido à fome.");
        } else if (this.state.energy < 15) {
          this.transitionTo("sleep", "Exausto! Adormecendo para recuperar energia.");
        } else if (this.state.stateTimer > 3) {
          // Choose randomly between walking, looking around, or a random custom action
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
              this.transitionTo(randAction, `Executando ação variada: ${randAction}`);
            } else {
              this.transitionTo("lookAround", "Observando os arredores.");
            }
          }
        }
        break;

      case "lookAround":
        if (this.state.stateTimer > 2) {
          this.transitionTo("idle", "Parou de observar.");
        }
        break;

      case "walk":
        if (this.state.targetX !== undefined && this.state.targetY !== undefined) {
          const dx = this.state.targetX - this.state.x;
          const dy = this.state.targetY - this.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 5 || this.state.stateTimer > 8) {
            this.state.isMoving = false;
            this.transitionTo("idle", "Chegou ao destino planejado.");
          } else {
            const speed = 40; // pixels per second
            const vx = (dx / dist) * speed * dt;
            const vy = (dy / dist) * speed * dt;

            this.state.x += vx;
            this.state.y += vy;
            this.state.isMoving = true;

            // Calculate direction angle (0 to 7)
            this.state.direction = this.calculateDirection(dx, dy);
          }
        } else {
          this.transitionTo("idle", "Sem destino válido.");
        }
        break;

      case "eat":
        if (this.state.stateTimer > 4) {
          this.state.hunger = Math.max(0, this.state.hunger - 50);
          this.state.happiness = Math.min(100, this.state.happiness + 20);
          this.transitionTo("happy", "Refeição concluída com sucesso!");
        }
        break;

      case "sleep":
        this.state.energy = Math.min(100, this.state.energy + dt * 10);
        if (this.state.energy >= 95 && this.state.stateTimer > 5) {
          this.transitionTo("idle", "Acordou revigorado!");
        }
        break;

      case "happy":
        if (this.state.stateTimer > 2.5) {
          this.transitionTo("idle", "Retornou ao estado normal.");
        }
        break;

      case "attack":
        if (this.state.stateTimer > 2) {
          this.transitionTo("idle", "Finalizou o ataque de teste.");
        }
        break;

      case "hurt":
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
    }

    return { ...this.state };
  }

  // Interactive Controls
  public interactPet() {
    this.state.happiness = Math.min(100, this.state.happiness + 25);
    this.state.lastInteraction = Date.now();
    this.transitionTo("happy", "Recebeu carinho do usuário!");
  }

  public interactFeed() {
    this.state.hunger = Math.max(0, this.state.hunger - 40);
    this.state.happiness = Math.min(100, this.state.happiness + 15);
    this.state.lastInteraction = Date.now();
    this.transitionTo("eat", "Alimentado pelo usuário.");
  }

  public interactAttack() {
    this.state.lastInteraction = Date.now();
    this.transitionTo("attack", "Ataque acionado manualmente.");
  }

  public interactHurt() {
    this.state.happiness = Math.max(0, this.state.happiness - 15);
    this.state.lastInteraction = Date.now();
    this.transitionTo("hurt", "Reagiu a um impacto.");
  }

  public forceState(action: NPCAction) {
    this.transitionTo(action, `Estado forçado manualmente para '${action}'.`);
  }

  private pickNewTarget() {
    const margin = 50;
    this.state.targetX = margin + Math.random() * (this.stageWidth - margin * 2);
    this.state.targetY = margin + Math.random() * (this.stageHeight - margin * 2);
  }

  private transitionTo(action: NPCAction, message: string) {
    this.state.currentAction = action;
    this.state.stateTimer = 0;
    this.addLog(action, message);
  }

  private addLog(action: NPCAction, message: string) {
    const timeStr = new Date().toLocaleTimeString("pt-BR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    this.logs.unshift({ timestamp: timeStr, action, message });
    if (this.logs.length > 30) this.logs.pop();
  }

  /**
   * Calculates 8-direction index (0 to 7) from dx, dy vector
   * 0: South, 1: South-West, 2: West, 3: North-West, 4: North, 5: North-East, 6: East, 7: South-East
   */
  private calculateDirection(dx: number, dy: number): number {
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
  }
}
