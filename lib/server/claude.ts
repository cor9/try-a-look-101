import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseDataUrl } from "./config";

export const STYLIST_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export class StylistError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function imageBlock(url: string): Anthropic.Beta.BetaImageBlockParam {
  const parsed = parseDataUrl(url);
  if (!parsed) throw new StylistError("Invalid image.", 400);
  return {
    type: "image",
    source: { type: "base64", media_type: parsed.mime as "image/jpeg" | "image/png" | "image/webp", data: parsed.data },
  };
}

/**
 * One structured-output call to Claude. Returns the parsed JSON object that
 * matches `schema`.
 */
export async function askClaudeForJson<T>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const client = new Anthropic();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: STYLIST_MODEL,
      max_tokens: 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: {
        effort: opts.effort ?? "medium",
        format: { type: "json_schema", schema: opts.schema },
      },
      // If a safety classifier declines, let the API retry on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new StylistError("The stylist is busy — try again in a minute.", 429);
    if (err instanceof Anthropic.BadRequestError) throw new StylistError(`Stylist request rejected: ${err.message}`, 400);
    if (err instanceof Anthropic.AuthenticationError) throw new StylistError("Stylist API key is invalid.", 500);
    if (err instanceof Anthropic.APIError) throw new StylistError(`Stylist service error (${err.status ?? "network"}).`);
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new StylistError("The stylist couldn't help with that image. Try a different photo.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new StylistError("The stylist's answer was cut off — try fewer items.", 502);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new StylistError("The stylist returned an unreadable answer. Try again.");
  }
}
