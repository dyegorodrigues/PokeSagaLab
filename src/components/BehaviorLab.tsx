import React, { useState, useEffect, useRef } from "react";
import { Creature } from "../types";
import { BehaviorEngine } from "../domain/behavior/behaviorEngine";
import { Play, Pause, Bot, Apple, Heart, Activity, Zap, Moon } from "lucide-react";

interface BehaviorLabProps {
  creature: Creature;
}

export const BehaviorLab: React.FC<BehaviorLabProps> = ({ creature }) => {
  const [engine] = useState(() => {
    const e = new BehaviorEngine(640, 360);
    e.setAvailableActions(creature.animations.map(a => a.name.toLowerCase()));
    return e;
  });

  const [npcState, setNpcState] = useState(() => engine.getState());
  const [logs, setLogs] = useState(() => engine.getLogs());
  const [isSimulating, setIsSimulating] = useState(true);
  const [sceneTheme, setSceneTheme] = useState<"grass" | "dungeon" | "town">("grass");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    engine.setAvailableActions(creature.animations.map(a => a.name.toLowerCase()));
  }, [creature, engine]);

  // Main simulation loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    
    // To avoid React state spamming, we might want to throttle the state updates,
    // but for now let's keep it 60fps to match the original unless it lags.
    const loop = (currentTime: number) => {
      if (!isSimulating) return;
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const updatedState = engine.tick(dt);
      setNpcState(updatedState);
      setLogs(engine.getLogs());

      animationFrameId = requestAnimationFrame(loop);
    };

    if (isSimulating) {
      animationFrameId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating, engine]);

  // Render NPC & Scenery on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;

    // Draw Background Scene
    ctx.clearRect(0, 0, width, height);
    if (sceneTheme === "grass") {
      ctx.fillStyle = "#15803d";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#166534";
      for (let i = 0; i < width; i += 20) {
        for (let j = 0; j < height; j += 20) {
          ctx.fillRect(i + ((j * 3) % 10), j, 2, 4);
        }
      }
    } else if (sceneTheme === "dungeon") {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 32) ctx.strokeRect(x, 0, 32, height);
      for (let y = 0; y < height; y += 32) ctx.strokeRect(0, y, width, 32);
    } else {
      ctx.fillStyle = "#78350f";
      ctx.fillRect(0, 0, width, height);
    }

    // Draw Shadow under NPC
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(npcState.x, npcState.y + 12, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Find animation frame matching NPC action and direction
    let animName = npcState.currentAction;
    if (npcState.currentAction === "idle" || npcState.currentAction === "lookAround" || npcState.currentAction === "happy") {
      animName = "Idle";
    }
    
    let animObj = creature.animations.find((a) => a.name.toLowerCase() === animName.toLowerCase());
    if (!animObj) {
      if (npcState.currentAction === "walk") animObj = creature.animations.find((a) => a.name.toLowerCase() === "walk");
      if (!animObj) animObj = creature.animations.find((a) => a.name.toLowerCase() === "idle");
      if (!animObj) animObj = creature.animations[0];
    }

    const frames = animObj?.framesByDirection?.[npcState.direction] || animObj?.framesByDirection?.[0] || [];
    
    // Calculate exact frame based on durations
    let currentFrameIndex = 0;
    if (frames.length > 0) {
      const timerMs = npcState.stateTimer * 1000;
      let totalAnimTimeMs = 0;
      for (const f of frames) {
        totalAnimTimeMs += (f.duration || 6) * 33.3;
      }
      if (totalAnimTimeMs > 0) {
        let currentLoopMs = timerMs % totalAnimTimeMs;
        for (let i = 0; i < frames.length; i++) {
          const fDurationMs = (frames[i].duration || 6) * 33.3;
          if (currentLoopMs < fDurationMs) {
            currentFrameIndex = i;
            break;
          }
          currentLoopMs -= fDurationMs;
        }
      }
    }
    const frame = frames[currentFrameIndex] || frames[0];

    if (frame?.dataUrl) {
      const fw = animObj?.frameWidth || 32;
      const fh = animObj?.frameHeight || 32;
      const originX = frame.origin?.x || (fw / 2);
      const originY = frame.origin?.y || (fh / 2);
      
      const drawImage = (img: HTMLImageElement) => {
        ctx.save();
        ctx.translate(npcState.x, npcState.y);
        ctx.drawImage(img, -originX * 2, -originY * 2, fw * 2, fh * 2);
        ctx.restore();
      };

      if (imageCacheRef.current[frame.dataUrl]) {
        drawImage(imageCacheRef.current[frame.dataUrl]);
      } else {
        const img = new Image();
        img.onload = () => {
          imageCacheRef.current[frame.dataUrl] = img;
          drawImage(img);
        };
        img.src = frame.dataUrl;
      }
    } else {
      ctx.fillStyle = "#facc15";
      ctx.fillRect(npcState.x - 12, npcState.y - 12, 24, 24);
    }

    // Draw Name Tag above NPC
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(creature.displayName, npcState.x, npcState.y - 24);
  }, [npcState, creature, sceneTheme]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const dx = clickX - npcState.x;
    const dy = clickY - npcState.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 35) {
      engine.interactPet();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            Laboratório de Comportamento de NPC
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulador autônomo com máquina de estados, tomadas de decisão, necessidades e reatividade a toque.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isSimulating ? "Pausar" : "Simular"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Cenário:</span>
              <div className="flex items-center gap-1">
                {(["grass", "dungeon", "town"] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setSceneTheme(theme)}
                    className={`px-2 py-0.5 rounded capitalize text-[11px] cursor-pointer ${
                      sceneTheme === theme ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {theme === "grass" ? "Grama" : theme === "dungeon" ? "Calabouço" : "Praça"}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative bg-slate-950 flex justify-center">
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                onClick={handleCanvasClick}
                className="w-full h-auto cursor-pointer max-h-[380px]"
              />
            </div>

            {/* Interactive Control Palette */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
              <button
                onClick={() => engine.interactFeed()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                title="Aumenta Fome e Felicidade"
              >
                <Apple className="w-3.5 h-3.5 text-rose-400" />
                <span>Alimentar</span>
              </button>
              <button
                onClick={() => engine.interactPet()}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                title="Aumenta Felicidade"
              >
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span>Carinho</span>
              </button>
              
              {/* Dynamically list available animations to test */}
              {creature.animations.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => engine.forceState(anim.name.toLowerCase())}
                  className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                  title={`Testar animação ${anim.name}`}
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate max-w-[80px]">{anim.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: State Inspector & Logs */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">Status & Necessidades</h3>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Ação Atual:</span>
                  <strong className="text-indigo-400 font-mono capitalize">{npcState.currentAction}</strong>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Energia:</span>
                  <strong className="text-slate-200">{Math.round(npcState.energy)}%</strong>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-amber-500 h-full transition-all" style={{ width: `${npcState.energy}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Fome:</span>
                  <strong className="text-slate-200">{Math.round(npcState.hunger)}%</strong>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-rose-500 h-full transition-all" style={{ width: `${npcState.hunger}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Felicidade:</span>
                  <strong className="text-slate-200">{Math.round(npcState.happiness)}%</strong>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${npcState.happiness}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Behavior Logs */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200">Log de Transição</h3>
            <div className="bg-slate-950 p-3 rounded-lg h-44 overflow-y-auto space-y-1.5 font-mono text-[10px] border border-slate-800">
              {logs.map((log, idx) => (
                <div key={idx} className="text-slate-400 flex items-start gap-1.5">
                  <span className="text-slate-600">{log.timestamp}</span>
                  <span className="text-indigo-400 font-bold">[{log.action}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
