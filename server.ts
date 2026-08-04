import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  createGenerationPlan,
  generateSpriteImageWithNanoBanana,
} from "./server/services/geminiService";
import {
  fetchWhitelistedAsset,
  getSpriteCollabCharacter,
  getSpriteCollabIndex,
} from "./server/services/spritecollabService";

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function requireGemini(res: express.Response): boolean {
  if (geminiConfigured()) return true;
  res.status(503).json({
    success: false,
    code: "AI_NOT_CONFIGURED",
    error:
      "A geração por IA está desativada porque GEMINI_API_KEY não está configurada. O restante do SAGA SpriteLab continua disponível normalmente.",
  });
  return false;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      app: "SAGA SpriteLab AI",
      time: new Date().toISOString(),
      spriteCollabSource: "https://spriteserver.pmdcollab.org/graphql",
      capabilities: {
        editor: true,
        localStorage: true,
        importExport: true,
        spriteCollab: true,
        gemini: geminiConfigured(),
      },
    });
  });

  app.get("/api/capabilities", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      editor: true,
      localStorage: true,
      importExport: true,
      spriteCollab: true,
      gemini: geminiConfigured(),
      mode: geminiConfigured() ? "full" : "offline-editor",
      message: geminiConfigured()
        ? "Editor e geração por IA disponíveis."
        : "Modo editor ativo. Configure GEMINI_API_KEY apenas para habilitar geração por IA.",
    });
  });

  app.get("/api/spritecollab/index", async (req, res) => {
    try {
      const result = await getSpriteCollabIndex(req.query.refresh === "1");
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      res.json({
        source: "PMDCollab official GraphQL API",
        sourceCommit: result.sourceCommit,
        sourceUpdatedAt: result.sourceUpdatedAt,
        count: result.items.length,
        items: result.items,
      });
    } catch (error) {
      console.error("SpriteCollab index error:", error);
      res.status(502).json({
        error: "Não foi possível sincronizar o índice oficial do SpriteCollab.",
        details: messageFromError(error),
      });
    }
  });

  app.get("/api/spritecollab/character", async (req, res) => {
    const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
    if (!requestedPath) {
      return res.status(400).json({ error: "O parâmetro 'path' é obrigatório." });
    }

    try {
      const character = await getSpriteCollabCharacter(requestedPath);
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.json(character);
    } catch (error) {
      console.error("SpriteCollab character error:", error);
      return res.status(502).json({
        error: "Não foi possível carregar o personagem do SpriteCollab.",
        details: messageFromError(error),
      });
    }
  });

  app.get("/api/spritecollab/asset", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    if (!rawUrl) {
      return res.status(400).json({ error: "O parâmetro 'url' é obrigatório." });
    }

    try {
      const upstream = await fetchWhitelistedAsset(rawUrl);
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      const etag = upstream.headers.get("etag");

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (etag) res.setHeader("ETag", etag);

      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.send(buffer);
    } catch (error) {
      console.error("SpriteCollab asset proxy error:", error);
      return res.status(502).json({
        error: "Não foi possível carregar o asset remoto.",
        details: messageFromError(error),
      });
    }
  });

  app.post("/api/gemini/plan", async (req, res) => {
    if (!requireGemini(res)) return;
    try {
      const { prompt, targetCreatureId, targetAnimationName, targetDirection } = req.body;
      const plan = await createGenerationPlan(
        prompt || "Nova variação de sprite",
        targetCreatureId || "0025",
        targetAnimationName || "Walk",
        targetDirection || 0,
      );
      res.json({ success: true, plan });
    } catch (error) {
      console.error("Gemini Plan Error:", error);
      res.status(500).json({ success: false, error: messageFromError(error) });
    }
  });

  app.post("/api/gemini/generate-image", async (req, res) => {
    if (!requireGemini(res)) return;
    try {
      const { plan, referenceImage } = req.body;
      if (!plan) {
        return res
          .status(400)
          .json({ success: false, error: "Missing 'plan' in request body" });
      }
      const rawImageUrl = await generateSpriteImageWithNanoBanana(plan, referenceImage);
      return res.json({ success: true, rawImageUrl });
    } catch (error) {
      console.error("Gemini Generate Image Error:", error);
      return res.status(500).json({ success: false, error: messageFromError(error) });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const mode = geminiConfigured() ? "full" : "offline-editor";
    console.log(
      `[SAGA SpriteLab AI] Express server running on http://0.0.0.0:${PORT} (${mode})`,
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start SAGA SpriteLab AI:", error);
  process.exitCode = 1;
});
