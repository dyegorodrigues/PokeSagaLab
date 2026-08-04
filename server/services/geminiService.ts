import { GoogleGenAI, Type } from "@google/genai";
import { GenerationPlan } from "../../src/types";

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (aiInstance) return aiInstance;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY não está configurada. Adicione a chave nos Secrets do projeto antes de usar a geração por IA.",
    );
  }
  aiInstance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "saga-spritelab-ai" },
    },
  });
  return aiInstance;
}

/** Stable model IDs documented by Google AI as of July 2026. */
export const ModelRegistry = {
  textPlanner: process.env.GEMINI_PLANNER_MODEL || "gemini-3.5-flash",
  imageGeneratorStandard:
    process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  imageGeneratorLite:
    process.env.GEMINI_IMAGE_LITE_MODEL || "gemini-3.1-flash-lite-image",
  imageGeneratorLegacy:
    process.env.GEMINI_IMAGE_LEGACY_MODEL || "gemini-2.5-flash-image",
} as const;

const OPERATIONS = new Set<GenerationPlan["operation"]>([
  "recolor",
  "edit_frame",
  "create_pose",
  "new_animation",
  "new_creature",
]);

function parseOperation(value: unknown): GenerationPlan["operation"] {
  return typeof value === "string" &&
    OPERATIONS.has(value as GenerationPlan["operation"])
    ? (value as GenerationPlan["operation"])
    : "edit_frame";
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseReferenceImage(dataUrl?: string) {
  if (!dataUrl) return undefined;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  );
  if (!match) {
    throw new Error("A imagem de referência não é um Data URL base64 válido.");
  }
  return { mimeType: match[1], data: match[2] };
}

export async function createGenerationPlan(
  prompt: string,
  targetCreatureId: string,
  targetAnimationName: string,
  targetDirection: number,
): Promise<GenerationPlan> {
  const ai = getAiClient();
  const systemInstruction = [
    "Você é um diretor técnico de pixel art especializado no formato PMD/SpriteCollab.",
    "Crie um plano de geração objetivo e coerente com o personagem de referência.",
    "Não afirme que uma pose, direção ou frame foi validado sem evidência visual.",
    "Use fundo magenta uniforme #FF00FF para permitir recorte determinístico.",
    "O plano deve descrever apenas uma célula ou sequência solicitada, sem inserir texto, grades ou legendas na imagem.",
  ].join(" ");

  try {
    const response = await ai.models.generateContent({
      model: ModelRegistry.textPlanner,
      contents: `Pedido: ${prompt}\nAnimação: ${targetAnimationName}\nDireção PMD: ${targetDirection}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            operation: {
              type: Type.STRING,
              description:
                "Uma de: recolor, edit_frame, create_pose, new_animation, new_creature",
            },
            prompt: {
              type: Type.STRING,
              description: "Prompt visual detalhado para o modelo de imagem",
            },
            styleNotes: {
              type: Type.STRING,
              description: "Restrições de silhueta, paleta, contorno e consistência",
            },
            matteColor: {
              type: Type.STRING,
              description: "Cor de fundo hexadecimal; use #FF00FF",
            },
            expectedFrameCount: { type: Type.INTEGER },
            frameWidth: { type: Type.INTEGER },
            frameHeight: { type: Type.INTEGER },
          },
          required: [
            "operation",
            "prompt",
            "styleNotes",
            "matteColor",
            "expectedFrameCount",
            "frameWidth",
            "frameHeight",
          ],
        },
      },
    });

    if (!response.text) {
      throw new Error("O planejador não retornou JSON.");
    }
    const parsed = JSON.parse(response.text) as Record<string, unknown>;
    return {
      id: `plan_${Date.now()}`,
      targetCreatureId,
      targetAnimationName,
      targetDirection,
      operation: parseOperation(parsed.operation),
      prompt:
        typeof parsed.prompt === "string" && parsed.prompt.trim()
          ? parsed.prompt
          : prompt,
      styleNotes:
        typeof parsed.styleNotes === "string" && parsed.styleNotes.trim()
          ? parsed.styleNotes
          : "Pixel art nítido, paleta controlada e silhueta consistente.",
      matteColor:
        typeof parsed.matteColor === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(parsed.matteColor)
          ? parsed.matteColor
          : "#FF00FF",
      expectedFrameCount: positiveInteger(parsed.expectedFrameCount, 1),
      frameWidth: positiveInteger(parsed.frameWidth, 32),
      frameHeight: positiveInteger(parsed.frameHeight, 32),
    };
  } catch (error) {
    throw new Error(
      `Falha ao criar o plano com ${ModelRegistry.textPlanner}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function generateSpriteImageWithNanoBanana(
  plan: GenerationPlan,
  base64ReferenceImage?: string,
): Promise<string> {
  const ai = getAiClient();
  const reference = parseReferenceImage(base64ReferenceImage);
  const prompt = [
    plan.prompt,
    `Create pixel art intended for a logical ${plan.frameWidth}x${plan.frameHeight} cell.`,
    "Preserve the reference character's silhouette, proportions, palette, facial features and outline weight.",
    `Render PMD direction index ${plan.targetDirection} for action ${plan.targetAnimationName}.`,
    "Use hard pixel edges, no motion blur, no antialiasing halo, no text, no labels and no sprite-sheet grid.",
    `Use a completely flat, uniform ${plan.matteColor} background touching every image border.`,
    plan.styleNotes,
  ].join(" ");

  const models = [
    ModelRegistry.imageGeneratorStandard,
    ModelRegistry.imageGeneratorLite,
    ModelRegistry.imageGeneratorLegacy,
  ].filter((model, index, all) => all.indexOf(model) === index);
  const failures: string[] = [];

  for (const model of models) {
    try {
      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      if (reference) {
        parts.unshift({ inlineData: reference });
      }

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
      });
      const responseParts = response.candidates?.[0]?.content?.parts || [];
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
        }
      }
      failures.push(`${model}: resposta sem imagem`);
    } catch (error) {
      failures.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Nenhum modelo Nano Banana retornou uma imagem. ${failures.join(" | ")}`,
  );
}
