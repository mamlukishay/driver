/** Helpers for reading Workers AI / LLM text replies defensively. */

/** Finds the first balanced `{...}` in `text`, ignoring braces inside JSON strings. */
function firstObjectText(text: string): string | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** A model reply (text, possibly fenced or wrapped in prose, or an already-parsed object) as a JSON object, or null. */
export function replyObject(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) return input as Record<string, unknown>;
  if (typeof input !== "string") return null;
  const unfenced = input.replace(/```[a-zA-Z]*/g, "");
  const candidate = firstObjectText(unfenced);
  if (!candidate) return null;
  try {
    const raw: unknown = JSON.parse(candidate);
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Pulls the generated text (or already-parsed JSON object) out of the shapes Workers AI text models return. */
export function aiReplyPayload(out: unknown): unknown {
  if (typeof out === "string") return out;
  if (typeof out !== "object" || out === null) return null;
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  return o.response ?? o.choices?.[0]?.message?.content ?? null;
}
