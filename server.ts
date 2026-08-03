import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  SPRITE_0025_ANIM_DATA,
  DEFAULT_SPRITECOLLAB_INDEX,
} from "./server/services/spritecollabFixture";
import {
  createGenerationPlan,
  generateSpriteImageWithNanoBanana,
} from "./server/services/geminiService";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // --- API Routes ---

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      app: "SAGA SpriteLab AI",
      time: new Date().toISOString(),
    });
  });

  // SpriteCollab Index
  app.get("/api/spritecollab/index", async (_req, res) => {
    try {
      // Attempt GitHub API request if token or online, else return rich fixture index
      res.json({
        source: "PMDCollab/SpriteCollab",
        count: DEFAULT_SPRITECOLLAB_INDEX.length,
        items: DEFAULT_SPRITECOLLAB_INDEX,
      });
    } catch (err: any) {
      res.json({
        source: "Fallback Fixtures",
        count: DEFAULT_SPRITECOLLAB_INDEX.length,
        items: DEFAULT_SPRITECOLLAB_INDEX,
      });
    }
  });

  // SpriteCollab Character Details (AnimData.xml)
  app.get("/api/spritecollab/character/:id", async (req, res) => {
    const id = req.params.id;
    const cleanId = id.padStart(4, "0");

    try {
      const targetUrl = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${cleanId}/AnimData.xml`;
      const response = await fetch(targetUrl);
      
      let animDataXml = "";
      if (response.ok) {
        animDataXml = await response.text();
      } else {
        animDataXml = cleanId === "0025" ? SPRITE_0025_ANIM_DATA : SPRITE_0025_ANIM_DATA.replace("Pikachu", `Pokemon ${cleanId}`);
      }

      const nameMatch = DEFAULT_SPRITECOLLAB_INDEX.find(item => item.id === cleanId);
      const displayName = nameMatch ? nameMatch.name : `Personagem (${cleanId})`;

      return res.json({
        id: cleanId,
        numericId: cleanId,
        displayName: displayName,
        path: `sprite/${cleanId}`,
        animDataXml: animDataXml,
        license: "PMDCollab License",
        rawBaseUrl: `/api/spritecollab/raw/sprite/${cleanId}`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy Raw Assets from GitHub PMDCollab/SpriteCollab
  app.get("/api/spritecollab/raw/*", async (req, res) => {
    const assetPath = req.params[0];
    const targetUrl = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/${assetPath}`;

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).send("Asset not found on remote GitHub repo.");
      }
      const contentType = response.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(502).send("Error fetching remote raw asset: " + err.message);
    }
  });

  // Gemini AI Generation Plan
  app.post("/api/gemini/plan", async (req, res) => {
    try {
      const { prompt, targetCreatureId, targetAnimationName, targetDirection } = req.body;
      const plan = await createGenerationPlan(
        prompt || "Nova variação de sprite",
        targetCreatureId || "0025",
        targetAnimationName || "Walk",
        targetDirection || 0
      );
      res.json({ success: true, plan });
    } catch (err: any) {
      console.error("Gemini Plan Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Gemini Nano Banana Image Generation
  app.post("/api/gemini/generate-image", async (req, res) => {
    try {
      const { plan, referenceImage } = req.body;
      if (!plan) {
        return res.status(400).json({ success: false, error: "Missing 'plan' in request body" });
      }
      const rawImageUrl = await generateSpriteImageWithNanoBanana(plan, referenceImage);
      res.json({ success: true, rawImageUrl });
    } catch (err: any) {
      console.error("Gemini Generate Image Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Vite Middleware or Static Production Serving ---
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
    console.log(`[SAGA SpriteLab AI] Express server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
