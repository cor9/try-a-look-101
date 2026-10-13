import "server-only";
import OpenAI, { toFile } from "openai";
import { availableProviders, costPerImageUsd, imageModel, imageProvider, parseDataUrl, type Provider } from "./config";
import type { RefImage } from "@/lib/prompt";

export interface ImageJob {
  prompt: string;
  /** Labeled data: URLs, in the order the prompt refers to them. */
  images: RefImage[];
  variations: number;
}

export interface ImageResult {
  images: string[];
  provider: Provider;
  model: string;
  estimatedCostUsd: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** The engine to use: the one the user picked if it's configured, else the default. */
export function activeProvider(requested?: Provider): { provider: Provider; model: string } {
  const provider = requested && availableProviders().includes(requested) ? requested : imageProvider();
  if (!provider) {
    throw new ProviderError(
      "Image generation isn't configured yet. Set OPENAI_API_KEY or GEMINI_API_KEY on the server.",
      503,
    );
  }
  return { provider, model: imageModel(provider) };
}

export async function generateImages(job: ImageJob, requested?: Provider): Promise<ImageResult> {
  const { provider, model } = activeProvider(requested);
  const images = provider === "openai" ? await viaOpenAI(job, model) : await viaGemini(job, model);
  return { images, provider, model, estimatedCostUsd: +(images.length * costPerImageUsd(provider)).toFixed(3) };
}

async function viaOpenAI(job: ImageJob, model: string): Promise<string[]> {
  const client = new OpenAI();
  const files = await Promise.all(
    job.images.map(({ url }, i) => {
      const parsed = parseDataUrl(url);
      if (!parsed) throw new ProviderError("Invalid reference image.", 400);
      const ext = parsed.mime.split("/")[1];
      return toFile(Buffer.from(parsed.data, "base64"), `reference-${i + 1}.${ext}`, { type: parsed.mime });
    }),
  );

  try {
    const res = await client.images.edit({
      model,
      image: files,
      // Files can't carry captions, so the role of each image goes at the top of the prompt.
      prompt: `Reference images, in order:\n${job.images.map((im) => `- ${im.label}`).join("\n")}\n\n${job.prompt}`,
      n: job.variations,
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 90,
      // gpt-image-1.x needs this to hold on to faces; newer models do it by default.
      ...(model.startsWith("gpt-image-1") ? { input_fidelity: "high" as const } : {}),
    });
    const out = (res.data ?? []).flatMap((d) => (d.b64_json ? [`data:image/jpeg;base64,${d.b64_json}`] : []));
    if (!out.length) throw new ProviderError("The image model returned no images.");
    return out;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof OpenAI.RateLimitError) throw new ProviderError("The image service is busy — try again in a minute.", 429);
    if (err instanceof OpenAI.AuthenticationError) throw new ProviderError("The image service API key is invalid.", 500);
    if (err instanceof OpenAI.BadRequestError) {
      throw new ProviderError(
        "The image model declined this request. Try a different photo or simpler wording.",
        422,
      );
    }
    if (err instanceof OpenAI.APIError) throw new ProviderError(`Image service error (${err.status ?? "network"}).`);
    throw err;
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function viaGemini(job: ImageJob, model: string): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY!;
  const parts: GeminiPart[] = [];
  job.images.forEach(({ url, label }) => {
    const parsed = parseDataUrl(url);
    if (!parsed) throw new ProviderError("Invalid reference image.", 400);
    parts.push({ text: label });
    parts.push({ inlineData: { mimeType: parsed.mime, data: parsed.data } });
  });
  parts.push({ text: job.prompt });

  const one = async (): Promise<string> => {
    const res = await fetch(
      `${process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
        }),
      },
    );
    if (res.status === 429) throw new ProviderError("The image service is busy — try again in a minute.", 429);
    if (res.status === 401 || res.status === 403) throw new ProviderError("The image service API key is invalid.", 500);
    if (res.status === 404) throw new ProviderError(`Image model "${model}" was not found — check GEMINI_IMAGE_MODEL.`, 500);
    if (!res.ok) {
      const detail = await res.text();
      if (detail.includes("API_KEY_INVALID")) throw new ProviderError("The image service API key is invalid.", 500);
      console.error("gemini error", res.status, detail.slice(0, 500));
      throw new ProviderError(`Image service error (${res.status}).`);
    }
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (body.promptFeedback?.blockReason) {
      throw new ProviderError("The image model declined this request. Try a different photo or simpler wording.", 422);
    }
    const img = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!img) {
      const reason = body.candidates?.[0]?.finishReason;
      throw new ProviderError(`The image model returned no image${reason ? ` (${reason.toLowerCase()})` : ""}. Try again.`, 422);
    }
    return `data:${img.mimeType};base64,${img.data}`;
  };

  return Promise.all(Array.from({ length: job.variations }, one));
}
