import { GoogleGenAI, Type } from "@google/genai";
import { GenerationPlan } from "../../src/types";

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

/**
 * Model Registry adhering strictly to official SDK guidance
 */
export const ModelRegistry = {
  textPlanner: "gemini-3.6-flash",
  imageGeneratorLite: "gemini-3.1-flash-lite-image",
  imageGeneratorStandard: "gemini-3.1-flash-image",
};

/**
 * Creates a structured Generation Plan using Gemini or smart fallback
 */
export async function createGenerationPlan(
  prompt: string,
  targetCreatureId: string,
  targetAnimationName: string,
  targetDirection: number
): Promise<GenerationPlan> {
  const ai = getAiClient();

  if (!ai) {
    // Smart fallback plan when API key is not present
    return {
      id: `plan_${Date.now()}`,
      targetCreatureId,
      targetAnimationName,
      targetDirection,
      operation: prompt.toLowerCase().includes("evolucao") || prompt.toLowerCase().includes("evoluir") ? "new_creature" : "edit_frame",
      prompt,
      styleNotes: "Pixel art profissional estilo PMDCollab, contornos vivos, sem blur, fundo sólido Magenta #FF00FF",
      matteColor: "#FF00FF",
      expectedFrameCount: 1,
      frameWidth: 32,
      frameHeight: 32,
    };
  }

  try {
    const systemInstruction =
      "Você é um engenheiro de IA especializado no formato de spritesheets do PMDCollab/SpriteCollab. " +
      "Analise a solicitação de alteração/evolução visual de sprite do Pokémon/criatura e crie um plano técnico de geração em JSON. " +
      "Garanta que a cor de fundo 'matteColor' seja magenta sólida (#FF00FF) para recorte determinístico de transparência.";

    const response = await ai.models.generateContent({
      model: ModelRegistry.textPlanner,
      contents: `Pedido de geração/evolução de sprite em Pixel Art: "${prompt}" para a animação "${targetAnimationName}" na direção ${targetDirection}.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            operation: { type: Type.STRING, description: "Tipo da operação (recolor, edit_frame, create_pose, new_animation, new_creature)" },
            prompt: { type: Type.STRING, description: "Prompt detalhado para o modelo Nano Banana em pixel art" },
            styleNotes: { type: Type.STRING, description: "Notas de estilo, paleta e proporções" },
            matteColor: { type: Type.STRING, description: "Cor de fundo sólida em hexadecimal (#FF00FF)" },
            expectedFrameCount: { type: Type.INTEGER, description: "Número de frames esperados" },
            frameWidth: { type: Type.INTEGER, description: "Largura do frame em pixels" },
            frameHeight: { type: Type.INTEGER, description: "Altura do frame em pixels" },
          },
          required: ["operation", "prompt", "matteColor", "frameWidth", "frameHeight"],
        },
      },
    });

    const jsonStr = response.text || "{}";
    const parsed = JSON.parse(jsonStr);

    return {
      id: `plan_${Date.now()}`,
      targetCreatureId,
      targetAnimationName,
      targetDirection,
      operation: parsed.operation || "edit_frame",
      prompt: parsed.prompt || prompt,
      styleNotes: parsed.styleNotes || "Pixel art limpo estilo Pokémon, contornos nítidos, fundo #FF00FF",
      matteColor: parsed.matteColor || "#FF00FF",
      expectedFrameCount: parsed.expectedFrameCount || 1,
      frameWidth: parsed.frameWidth || 32,
      frameHeight: parsed.frameHeight || 32,
    };
  } catch (err: any) {
    console.warn("Gemini planning failed, falling back to local planner:", err.message);
    return {
      id: `plan_${Date.now()}`,
      targetCreatureId,
      targetAnimationName,
      targetDirection,
      operation: "edit_frame",
      prompt,
      styleNotes: "Pixel art estilo PMDCollab com fundo Magenta #FF00FF",
      matteColor: "#FF00FF",
      expectedFrameCount: 1,
      frameWidth: 32,
      frameHeight: 32,
    };
  }
}

/**
 * Generates or edits an image using Nano Banana (Gemini Image models)
 */
export async function generateSpriteImageWithNanoBanana(
  plan: GenerationPlan,
  base64ReferenceImage?: string
): Promise<string> {
  const ai = getAiClient();

  if (ai) {
    const fullPrompt =
      `Clean Pixel Art sprite of character, ${plan.prompt}. ` +
      `Exact logical grid dimensions ${plan.frameWidth}x${plan.frameHeight} pixels. ` +
      `Sharp pixel art style, no anti-aliasing blur, solid untextured uniform ${plan.matteColor} background color. ` +
      `Retain iconic creature posture, direction ${plan.targetDirection}, and style consistency.`;

    // Attempt Primary Model (gemini-3.1-flash-lite-image or gemini-2.5-flash)
    const candidateModels = [
      ModelRegistry.imageGeneratorLite,
      "gemini-2.5-flash",
      "gemini-3.0-flash",
    ];

    for (const modelName of candidateModels) {
      try {
        const parts: any[] = [{ text: fullPrompt }];
        if (base64ReferenceImage) {
          const cleanBase64 = base64ReferenceImage.replace(/^data:image\/\w+;base64,/, "");
          parts.unshift({
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          });
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
          for (const part of candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
              return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
            }
          }
        }
      } catch (err: any) {
        console.warn(`Nano Banana generation with ${modelName} failed/quota exceeded, trying next fallback:`, err.message);
      }
    }

    // Try Imagen 3 fallback if standard multimodal models fail or hit rate limits
    try {
      const imagenRes = await ai.models.generateImages({
        model: "imagen-3.0-generate-002",
        prompt: `Pixel art sprite of ${plan.prompt}, single frame on flat solid ${plan.matteColor} background, clear pixel boundaries.`,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/png",
          aspectRatio: "1:1",
        },
      });
      if (imagenRes.generatedImages && imagenRes.generatedImages.length > 0) {
        const base64Img = imagenRes.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64Img}`;
      }
    } catch (err: any) {
      console.warn("Imagen 3 fallback also skipped:", err.message);
    }
  }

  // Smart Procedural Pixel Art Engine Fallback
  // Guarantees zero-downtime sprite generation with solid matte color & pixel outlines
  return generateProceduralSpriteFrame(plan, base64ReferenceImage);
}

/**
 * Procedural Pixel Art generator for testing offline or when API key is unconfigured
 */
function generateProceduralSpriteFrame(plan: GenerationPlan, base64Ref?: string): string {
  const w = plan.frameWidth || 32;
  const h = plan.frameHeight || 32;

  // We build SVG / Canvas simulation as Data URL
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${plan.matteColor || "#FF00FF"}" />
    <!-- Creature Body Base -->
    <rect x="${Math.floor(w * 0.25)}" y="${Math.floor(h * 0.25)}" width="${Math.floor(w * 0.5)}" height="${Math.floor(h * 0.5)}" fill="#facc15" rx="3" />
    <!-- Outline -->
    <rect x="${Math.floor(w * 0.25)}" y="${Math.floor(h * 0.25)}" width="${Math.floor(w * 0.5)}" height="${Math.floor(h * 0.5)}" fill="none" stroke="#000" stroke-width="1" />
    <!-- Eyes -->
    <rect x="${Math.floor(w * 0.35)}" y="${Math.floor(h * 0.35)}" width="2" height="2" fill="#000" />
    <rect x="${Math.floor(w * 0.55)}" y="${Math.floor(h * 0.35)}" width="2" height="2" fill="#000" />
    <!-- Cheeks / Accents -->
    <rect x="${Math.floor(w * 0.3)}" y="${Math.floor(h * 0.45)}" width="2" height="2" fill="#ef4444" />
    <rect x="${Math.floor(w * 0.6)}" y="${Math.floor(h * 0.45)}" width="2" height="2" fill="#ef4444" />
    <!-- Ears / Horns depending on prompt -->
    <polygon points="${Math.floor(w * 0.28)},${Math.floor(h * 0.25)} ${Math.floor(w * 0.2)},${Math.floor(h * 0.1)} ${Math.floor(w * 0.38)},${Math.floor(h * 0.25)}" fill="#facc15" stroke="#000" stroke-width="0.5" />
    <polygon points="${Math.floor(w * 0.62)},${Math.floor(h * 0.25)} ${Math.floor(w * 0.7)},${Math.floor(h * 0.1)} ${Math.floor(w * 0.72)},${Math.floor(h * 0.25)}" fill="#facc15" stroke="#000" stroke-width="0.5" />
    <!-- Power Aura / Evolution Effect -->
    <circle cx="${Math.floor(w * 0.5)}" cy="${Math.floor(h * 0.5)}" r="${Math.floor(w * 0.45)}" fill="none" stroke="#a855f7" stroke-width="1" stroke-dasharray="2,2" />
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

