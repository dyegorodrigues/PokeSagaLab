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
  direction: number;
  frameIndex: number;
  dataUrl: string;
  duration: number;
  /** Green body-center marker from <Action>-Offsets.png. */
  origin: Point;
  /** White floor/shadow anchor from <Action>-Shadow.png. */
  shadowOrigin?: Point;
  /** Exact per-cell PMD metadata layers, preserved for lossless round-trip. */
  offsetsDataUrl?: string;
  shadowDataUrl?: string;
  boundingBox?: BoundingBox;
}

export interface AnimationSourceAssets {
  animUrl?: string;
  offsetsUrl?: string;
  shadowsUrl?: string;
}

export interface Animation {
  id: string;
  name: string;
  sourceName: string;
  index: number;
  frameWidth: number;
  frameHeight: number;
  /** PMD supports either one direction or all eight directions. */
  directions: number;
  durations: number[];
  loopMode: "loop" | "once" | "pingpong";
  /** PMD alias action. Copy actions do not own PNG sheets. */
  copyOf?: string;
  locked?: boolean;
  rushFrame?: number;
  hitFrame?: number;
  returnFrame?: number;
  framesByDirection: Record<number, Frame[]>;
  shadowSize?: number;
  sourceAssets?: AnimationSourceAssets;
  warnings?: string[];
  extraXmlData?: Record<string, unknown>;
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
  currentAction: string;
  x: number;
  y: number;
  direction: number;
  energy: number;
  hunger: number;
  happiness: number;
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
  id: string;
  sourceKind: SourceKind;
  sourceRef?: string;
  numericId: string;
  displayName: string;
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
  matteColor: string;
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
  formPath?: string;
  hasAnimData: boolean;
  hasPortraits: boolean;
  portraitUrl?: string;
  animDataUrl?: string;
  zipUrl?: string;
  phase?: string;
  phaseRaw?: number;
  canon?: boolean;
  shiny?: boolean;
  female?: boolean;
  lastUpdated?: string;
}

export interface SpriteCollabActionAsset {
  kind: "sprite" | "copy";
  action: string;
  locked: boolean;
  copyOf?: string;
  animUrl?: string;
  offsetsUrl?: string;
  shadowsUrl?: string;
}
