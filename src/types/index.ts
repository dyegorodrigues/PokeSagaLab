/**
 * SAGA SpriteLab AI - Core Domain Types
 */

export type SourceKind = "remote" | "local" | "generated" | "imported";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Frame {
  id: string;
  animationId: string;
  direction: number; // 0 to 7 (South, SW, West, NW, North, NE, East, SE)
  frameIndex: number;
  dataUrl: string; // Base64 or Data URL of the individual frame canvas
  duration: number; // Duration in ticks/frames
  origin: Point;
  boundingBox?: BoundingBox;
}

export interface Animation {
  id: string;
  name: string; // e.g., "Walk", "Attack", "Idle", "Eat", "Sleep"
  sourceName: string;
  index: number;
  frameWidth: number;
  frameHeight: number;
  directions: number; // Typically 8
  durations: number[]; // Duration for each frame in sequence
  loopMode: "loop" | "once" | "pingpong";
  rushFrame?: number;
  hitFrame?: number;
  returnFrame?: number;
  framesByDirection: Record<number, Frame[]>; // direction index -> Frame[]
  shadowSize?: number;
  extraXmlData?: Record<string, any>;
}

export interface StyleDNA {
  silhouette: string;
  primaryColors: string[];
  outlineColor: string;
  eyeStyle: string;
  headProportion: number;
  features: string[];
}

export interface NPCState {
  currentAction: string; // e.g. "idle", "walk", "eat", "sleep", "attack", "happy"
  x: number;
  y: number;
  direction: number; // 0 to 7
  energy: number; // 0 - 100
  hunger: number; // 0 - 100
  happiness: number; // 0 - 100
  targetX?: number;
  targetY?: number;
  isMoving: boolean;
  stateTimer: number;
  lastInteraction: number;
}

export interface CreatureVersion {
  versionId: string;
  timestamp: number;
  description: string;
  author: string;
}

export interface Creature {
  id: string; // "spritecollab:0025", "local:uuid", "generated:uuid", "imported:uuid"
  sourceKind: SourceKind;
  sourceRef?: string;
  numericId: string; // e.g. "0025"
  displayName: string; // e.g. "Pikachu (0025)"
  species: string;
  form?: string;
  gender?: string;
  shiny?: boolean;
  shadowSize: number;
  animations: Animation[];
  styleDNA?: StyleDNA;
  behaviorState?: NPCState;
  license: string;
  provenance: {
    origin: string;
    author: string;
    commitHash?: string;
    createdAt: number;
    updatedAt: number;
    parentCreatureId?: string;
    promptUsed?: string;
  };
  versions: CreatureVersion[];
  currentVersionId: string;
}

export interface GenerationPlan {
  id: string;
  targetCreatureId: string;
  targetAnimationName: string;
  targetDirection: number;
  operation: "recolor" | "edit_frame" | "create_pose" | "new_animation" | "new_creature";
  prompt: string;
  styleNotes: string;
  matteColor: string; // e.g. "#FF00FF" (Magenta) or "#00FF00" (Lime)
  expectedFrameCount: number;
  frameWidth: number;
  frameHeight: number;
}

export interface GenerationResult {
  id: string;
  planId: string;
  rawImageUrl: string;
  cleanedImageUrl: string;
  alphaMaskUrl?: string;
  qualityMetrics: {
    alphaCoverage: number;
    fringePixelsRemoved: number;
    boundingBox: BoundingBox;
    isValidAlpha: boolean;
  };
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface SpriteCollabIndexItem {
  id: string;
  numericId: string;
  name: string;
  path: string;
  hasAnimData: boolean;
  hasPortraits: boolean;
  lastUpdated?: string;
}
