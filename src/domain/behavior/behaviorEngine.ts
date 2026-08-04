import { NPCState } from "../../types";

export type NPCAction = string;
export type BehaviorMode =
  | "idle"
  | "walk"
  | "lookAround"
  | "eat"
  | "sleep"
  | "happy"
  | "attack"
  | "hurt"
  | "custom";

export interface BehaviorLogEntry {
  id: number;
  timestamp: string;
  action: NPCAction;
  message: string;
}

const VISUAL_CANDIDATES: Record<Exclude<BehaviorMode, "custom">, string[]> = {
  idle: ["Idle", "Pose", "Sit"],
  walk: ["Walk", "CarefulWalk", "Hop", "Idle"],
  lookAround: ["LookUp", "Nod", "Pose", "Idle"],
  eat: ["Eat", "Bite", "Lick", "Idle"],
  sleep: ["Sleep", "EventSleep", "Laying", "Idle"],
  happy: ["Joyous", "Dance", "Hop", "Appeal", "Idle"],
  attack: ["Attack", "Strike", "Punch", "Kick", "Scratch", "Idle"],
  hurt: ["Hurt", "Pain", "Cringe", "Idle"],
};

export class BehaviorEngine {
  private state: NPCState;
  private mode: BehaviorMode = "idle";
  private customAction?: string;
  private stageWidth: number;
  private stageHeight: number;
  private logs: BehaviorLogEntry[] = [];
  private logSequence = 0;
  private availableActions = new Map<string, string>();

  constructor(stageWidth = 600, stageHeight = 400) {
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.state = {
      currentAction: "idle",
      x: Math.floor(stageWidth / 2),
      y: Math.floor(stageHeight / 2),
      direction: 0,
      energy: 85,
      hunger: 20,
      happiness: 80,
      isMoving: false,
      stateTimer: 0,
      lastInteraction: Date.now(),
    };
    this.addLog("idle", "NPC ativado no laboratório de comportamento.");
  }

  getState(): NPCState {
    return { ...this.state };
  }

  getLogs(): BehaviorLogEntry[] {
    return this.logs.map((entry) => ({ ...entry }));
  }

  setStageBounds(width: number, height: number) {
    if (Number.isFinite(width) && width > 0) this.stageWidth = width;
    if (Number.isFinite(height) && height > 0) this.stageHeight = height;
    this.state.x = Math.min(Math.max(this.state.x, 0), this.stageWidth);
    this.state.y = Math.min(Math.max(this.state.y, 0), this.stageHeight);
  }

  setAvailableActions(actions: string[]) {
    this.availableActions.clear();
    for (const action of actions) {
      const normalized = action.trim().toLowerCase();
      if (normalized && !this.availableActions.has(normalized)) {
        this.availableActions.set(normalized, action.trim());
      }
    }
  }

  resolveVisualAction(): string | undefined {
    if (this.mode === "custom" && this.customAction) {
      return this.availableActions.get(this.customAction.toLowerCase()) || this.resolveCandidates(["Idle"]);
    }
    return this.resolveCandidates(VISUAL_CANDIDATES[this.mode]);
  }

  tick(rawDeltaSeconds: number): NPCState {
    // Prevent a backgrounded browser tab from producing a giant simulation leap.
    const dt = Math.min(Math.max(rawDeltaSeconds, 0), 0.1);
    this.state.stateTimer += dt;

    // Demo rates: visible over minutes, not seconds.
    this.state.energy = Math.max(0, this.state.energy - dt * 0.08);
    this.state.hunger = Math.min(100, this.state.hunger + dt * 0.15);
    this.state.happiness = Math.max(0, this.state.happiness - dt * 0.04);

    switch (this.mode) {
      case "idle":
        if (this.state.hunger > 80 && this.state.energy > 25) {
          this.transition("eat", "Fome alta: iniciou uma rotina de alimentação.");
        } else if (this.state.energy < 15) {
          this.transition("sleep", "Energia baixa: iniciou uma rotina de descanso.");
        } else if (this.state.stateTimer > 3) {
          const random = Math.random();
          if (random < 0.55) {
            this.pickNewTarget();
            this.transition("walk", "Escolheu um novo ponto do cenário.");
          } else if (random < 0.82) {
            this.transition("lookAround", "Observando os arredores.");
          } else {
            const custom = this.pickCustomAction();
            if (custom) this.transitionCustom(custom, `Executando ação disponível: ${custom}.`);
            else this.transition("lookAround", "Observando os arredores.");
          }
        }
        break;

      case "lookAround":
        if (this.state.stateTimer > 2) this.transition("idle", "Terminou de observar.");
        break;

      case "walk": {
        const targetX = this.state.targetX;
        const targetY = this.state.targetY;
        if (targetX === undefined || targetY === undefined) {
          this.transition("idle", "Destino ausente.");
          break;
        }
        const dx = targetX - this.state.x;
        const dy = targetY - this.state.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3 || this.state.stateTimer > 10) {
          this.state.x = targetX;
          this.state.y = targetY;
          this.state.isMoving = false;
          this.transition("idle", "Chegou ao destino.");
          break;
        }
        const speed = 38;
        this.state.x += (dx / distance) * speed * dt;
        this.state.y += (dy / distance) * speed * dt;
        this.state.direction = this.calculateDirection(dx, dy);
        this.state.isMoving = true;
        break;
      }

      case "eat":
        if (this.state.stateTimer > 3.5) {
          this.state.hunger = Math.max(0, this.state.hunger - 50);
          this.state.happiness = Math.min(100, this.state.happiness + 12);
          this.transition("happy", "Refeição concluída.");
        }
        break;

      case "sleep":
        this.state.energy = Math.min(100, this.state.energy + dt * 7);
        if (this.state.energy >= 95 && this.state.stateTimer > 5) {
          this.transition("idle", "Acordou com energia recuperada.");
        }
        break;

      case "happy":
        if (this.state.stateTimer > 2.5) this.transition("idle", "Retornou ao estado neutro.");
        break;

      case "attack":
      case "hurt":
        if (this.state.stateTimer > 2) this.transition("idle", "Ação reativa concluída.");
        break;

      case "custom":
        if (this.state.stateTimer > 3) this.transition("idle", "Ação personalizada concluída.");
        break;
    }

    return this.getState();
  }

  interactPet() {
    this.state.happiness = Math.min(100, this.state.happiness + 25);
    this.state.lastInteraction = Date.now();
    this.transition("happy", "Recebeu carinho do usuário.");
  }

  interactFeed() {
    this.state.hunger = Math.max(0, this.state.hunger - 35);
    this.state.happiness = Math.min(100, this.state.happiness + 12);
    this.state.lastInteraction = Date.now();
    this.transition("eat", "Foi alimentado pelo usuário.");
  }

  interactAttack() {
    this.state.lastInteraction = Date.now();
    this.transition("attack", "Ataque acionado manualmente.");
  }

  interactHurt() {
    this.state.happiness = Math.max(0, this.state.happiness - 15);
    this.state.lastInteraction = Date.now();
    this.transition("hurt", "Reação a impacto acionada.");
  }

  forceState(action: NPCAction) {
    const exact = this.availableActions.get(action.toLowerCase());
    if (exact) {
      this.transitionCustom(exact, `Animação '${exact}' acionada manualmente.`);
    } else {
      this.addLog(action, `A animação '${action}' não está disponível neste personagem.`);
    }
  }

  private resolveCandidates(candidates: string[]) {
    for (const candidate of candidates) {
      const action = this.availableActions.get(candidate.toLowerCase());
      if (action) return action;
    }
    return this.availableActions.values().next().value as string | undefined;
  }

  private pickCustomAction() {
    const reserved = new Set(
      Object.values(VISUAL_CANDIDATES)
        .flat()
        .map((action) => action.toLowerCase()),
    );
    const choices = [...this.availableActions.values()].filter(
      (action) => !reserved.has(action.toLowerCase()),
    );
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : undefined;
  }

  private pickNewTarget() {
    const margin = Math.min(50, this.stageWidth / 4, this.stageHeight / 4);
    this.state.targetX = margin + Math.random() * Math.max(1, this.stageWidth - margin * 2);
    this.state.targetY = margin + Math.random() * Math.max(1, this.stageHeight - margin * 2);
  }

  private transition(mode: Exclude<BehaviorMode, "custom">, message: string) {
    this.mode = mode;
    this.customAction = undefined;
    this.state.currentAction = mode;
    this.state.stateTimer = 0;
    this.state.isMoving = mode === "walk";
    this.addLog(mode, message);
  }

  private transitionCustom(action: string, message: string) {
    this.mode = "custom";
    this.customAction = action;
    this.state.currentAction = action;
    this.state.stateTimer = 0;
    this.state.isMoving = false;
    this.addLog(action, message);
  }

  private addLog(action: NPCAction, message: string) {
    const timestamp = new Date().toLocaleTimeString("pt-BR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    this.logs.unshift({
      id: ++this.logSequence,
      timestamp,
      action,
      message,
    });
    if (this.logs.length > 40) this.logs.length = 40;
  }

  /** PMD row order: S, SE, E, NE, N, NW, W, SW. */
  private calculateDirection(dx: number, dy: number): number {
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle >= 67.5 && angle < 112.5) return 0;
    if (angle >= 22.5 && angle < 67.5) return 1;
    if (angle >= -22.5 && angle < 22.5) return 2;
    if (angle >= -67.5 && angle < -22.5) return 3;
    if (angle >= -112.5 && angle < -67.5) return 4;
    if (angle >= -157.5 && angle < -112.5) return 5;
    if (angle >= 157.5 || angle < -157.5) return 6;
    return 7;
  }
}
