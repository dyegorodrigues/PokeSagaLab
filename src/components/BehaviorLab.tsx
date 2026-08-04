import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Apple,
  Bot,
  Heart,
  Pause,
  Play,
  ShieldAlert,
  Swords,
} from "lucide-react";
import { Creature } from "../types";
import { BehaviorEngine } from "../domain/behavior/behaviorEngine";

interface BehaviorLabProps {
  creature: Creature;
}

type SceneTheme = "grass" | "dungeon" | "town";

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: SceneTheme,
) {
  context.clearRect(0, 0, width, height);
  if (theme === "grass") {
    context.fillStyle = "#174b35";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#1d5d3f";
    for (let y = 0; y < height; y += 24) {
      for (let x = 0; x < width; x += 24) {
        context.fillRect(x + ((y / 24) % 2) * 8, y + 4, 2, 5);
      }
    }
    context.fillStyle = "#235f43";
    context.fillRect(0, height - 54, width, 54);
  } else if (theme === "dungeon") {
    context.fillStyle = "#111827";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#263449";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      for (let y = 0; y < height; y += 32) {
        context.strokeRect(x, y, 32, 32);
      }
    }
  } else {
    context.fillStyle = "#643c25";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#8a5a36";
    for (let y = 0; y < height; y += 28) {
      context.fillRect(0, y, width, 2);
    }
    context.fillStyle = "#9a6a40";
    context.fillRect(0, height - 58, width, 58);
  }
}

export const BehaviorLab: React.FC<BehaviorLabProps> = ({ creature }) => {
  const engine = useMemo(() => {
    const instance = new BehaviorEngine(640, 360);
    instance.setAvailableActions(creature.animations.map((animation) => animation.name));
    return instance;
  }, [creature.id]);
  const [npcState, setNpcState] = useState(() => engine.getState());
  const [logs, setLogs] = useState(() => engine.getLogs());
  const [isSimulating, setIsSimulating] = useState(true);
  const [sceneTheme, setSceneTheme] = useState<SceneTheme>("grass");
  const [forcedAction, setForcedAction] = useState(creature.animations[0]?.name || "");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    engine.setAvailableActions(creature.animations.map((animation) => animation.name));
    setForcedAction(creature.animations[0]?.name || "");
  }, [creature.animations, engine]);

  const publishEngineState = () => {
    setNpcState(engine.getState());
    setLogs(engine.getLogs());
  };

  useEffect(() => {
    if (!isSimulating) return;
    let animationFrame = 0;
    let previous = performance.now();
    let lastPublish = previous;

    const loop = (now: number) => {
      const deltaSeconds = (now - previous) / 1000;
      previous = now;
      engine.tick(deltaSeconds);
      // Keep simulation smooth but limit React work to 20 updates/second.
      if (now - lastPublish >= 50) {
        publishEngineState();
        lastPublish = now;
      }
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [engine, isSimulating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    drawScene(context, canvas.width, canvas.height, sceneTheme);

    const visualAction = engine.resolveVisualAction();
    const animation =
      creature.animations.find(
        (candidate) => candidate.name.toLowerCase() === visualAction?.toLowerCase(),
      ) || creature.animations[0];
    if (!animation) return;

    const visualDirection = animation.directions === 1 ? 0 : npcState.direction;
    const frames =
      animation.framesByDirection[visualDirection] || animation.framesByDirection[0] || [];
    if (!frames.length) return;

    const totalTicks = frames.reduce(
      (sum, frame) => sum + Math.max(1, frame.duration || 1),
      0,
    );
    let currentTick = (npcState.stateTimer * 60) % Math.max(1, totalTicks);
    let frame = frames[0];
    for (const candidate of frames) {
      const duration = Math.max(1, candidate.duration || 1);
      if (currentTick < duration) {
        frame = candidate;
        break;
      }
      currentTick -= duration;
    }

    const scale = 3;
    const originX = frame.origin?.x ?? animation.frameWidth / 2;
    const originY = frame.origin?.y ?? animation.frameHeight / 2;
    const shadowOrigin = frame.shadowOrigin || frame.origin;
    const shadowX =
      npcState.x + ((shadowOrigin?.x ?? originX) - originX) * scale;
    const shadowY =
      npcState.y + ((shadowOrigin?.y ?? originY) - originY) * scale;

    context.fillStyle = "rgba(0,0,0,0.32)";
    context.beginPath();
    context.ellipse(
      shadowX,
      shadowY + 2,
      Math.max(8, creature.shadowSize * 8),
      Math.max(3, creature.shadowSize * 3),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    const drawSprite = (image: HTMLImageElement) => {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        npcState.x - originX * scale,
        npcState.y - originY * scale,
        animation.frameWidth * scale,
        animation.frameHeight * scale,
      );
      context.font = "600 11px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillStyle = "rgba(0,0,0,0.65)";
      context.fillText(
        creature.displayName,
        npcState.x + 1,
        npcState.y - originY * scale - 8 + 1,
      );
      context.fillStyle = "#ffffff";
      context.fillText(
        creature.displayName,
        npcState.x,
        npcState.y - originY * scale - 8,
      );
    };

    const cached = imageCacheRef.current.get(frame.dataUrl);
    if (cached) {
      drawSprite(cached);
    } else {
      const image = new Image();
      image.onload = () => {
        imageCacheRef.current.set(frame.dataUrl, image);
        // A later state publication redraws the complete scene safely.
      };
      image.src = frame.dataUrl;
    }
  }, [creature, engine, npcState, sceneTheme]);

  const runInteraction = (interaction: () => void) => {
    interaction();
    publishEngineState();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rectangle = canvas.getBoundingClientRect();
    const x = ((event.clientX - rectangle.left) / rectangle.width) * canvas.width;
    const y = ((event.clientY - rectangle.top) / rectangle.height) * canvas.height;
    if (Math.hypot(x - npcState.x, y - npcState.y) < 48) {
      runInteraction(() => engine.interactPet());
    }
  };

  const resolvedAction = engine.resolveVisualAction() || "nenhuma";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-3 md:p-6">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <Bot className="h-5 w-5 text-emerald-400" /> Laboratório de comportamento
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Máquina de estados ligada às animações que realmente existem no personagem.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsSimulating((value) => !value)}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
        >
          {isSimulating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isSimulating ? "Pausar" : "Continuar"}
        </button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                Visual atual: <strong className="text-emerald-300">{resolvedAction}</strong>
              </span>
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
                {(["grass", "dungeon", "town"] as SceneTheme[]).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    onClick={() => setSceneTheme(theme)}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                      sceneTheme === theme
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {theme === "grass" ? "Grama" : theme === "dungeon" ? "Calabouço" : "Praça"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                onClick={handleCanvasClick}
                className="h-auto w-full cursor-pointer touch-manipulation"
              />
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Toque no personagem para fazer carinho.
            </p>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Interações e teste de ações</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => runInteraction(() => engine.interactFeed())}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
              >
                <Apple className="h-4 w-4 text-rose-400" /> Alimentar
              </button>
              <button
                type="button"
                onClick={() => runInteraction(() => engine.interactPet())}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
              >
                <Heart className="h-4 w-4 text-pink-400" /> Carinho
              </button>
              <button
                type="button"
                onClick={() => runInteraction(() => engine.interactAttack())}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
              >
                <Swords className="h-4 w-4 text-amber-400" /> Ataque
              </button>
              <button
                type="button"
                onClick={() => runInteraction(() => engine.interactHurt())}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
              >
                <ShieldAlert className="h-4 w-4 text-red-400" /> Dano
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={forcedAction}
                onChange={(event) => setForcedAction(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                {creature.animations.map((animation) => (
                  <option key={animation.id} value={animation.name}>
                    {animation.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!forcedAction}
                onClick={() =>
                  runInteraction(() => engine.forceState(forcedAction))
                }
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <Activity className="h-4 w-4" /> Executar animação
              </button>
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-4 text-sm font-bold text-white">Estado do NPC</h3>
            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <span className="block text-[10px] uppercase text-slate-500">Intenção</span>
              <strong className="font-mono text-sm text-indigo-300">
                {npcState.currentAction}
              </strong>
            </div>
            <div className="space-y-4">
              {[
                { label: "Energia", value: npcState.energy, bar: "bg-amber-500" },
                { label: "Fome", value: npcState.hunger, bar: "bg-rose-500" },
                { label: "Felicidade", value: npcState.happiness, bar: "bg-emerald-500" },
              ].map((metric) => (
                <div key={metric.label}>
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>{metric.label}</span>
                    <span>{Math.round(metric.value)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
                    <div
                      className={`h-full transition-[width] ${metric.bar}`}
                      style={{ width: `${Math.max(0, Math.min(100, metric.value))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Log de transições</h3>
            <div className="h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px]">
              {logs.map((log) => (
                <div key={log.id} className="grid grid-cols-[54px_80px_1fr] gap-1 text-slate-400">
                  <span className="text-slate-600">{log.timestamp}</span>
                  <span className="truncate font-bold text-indigo-400">[{log.action}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
