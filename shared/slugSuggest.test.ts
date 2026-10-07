import { describe, expect, test } from "bun:test";
import { aiReplyPayload } from "./aiReply.ts";
import { type AiRunner, parseSlugReply, SLUG_SUGGEST_PROMPT, suggestSlugWithAI } from "./slugSuggest.ts";

const ai = (reply: unknown): AiRunner & { calls: { model: string; input: unknown }[] } => {
  const calls: { model: string; input: unknown }[] = [];
  return {
    calls,
    run: async (model, input) => {
      calls.push({ model, input });
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
};
const free = async () => false;
const M = "@cf/test/model";

describe("aiReplyPayload", () => {
  test("string, response, and OpenAI-style choices", () => {
    expect(aiReplyPayload("x")).toBe("x");
    expect(aiReplyPayload({ response: { slug: "a" } })).toEqual({ slug: "a" });
    expect(aiReplyPayload({ choices: [{ message: { content: "c" } }] })).toBe("c");
    expect(aiReplyPayload(null)).toBeNull();
    expect(aiReplyPayload(42)).toBeNull();
  });
});

describe("parseSlugReply", () => {
  test("object response (JSON mode)", () => {
    expect(parseSlugReply({ response: { slug: "tomer-bar-mitzvah" } })).toBe("tomer-bar-mitzvah");
  });
  test("string response, fenced, with prose", () => {
    expect(parseSlugReply({ response: '```json\n{"slug": "class-4-2-givatayim"}\n```' })).toBe("class-4-2-givatayim");
    expect(parseSlugReply('Sure! {"slug":"tomer-bar-mitzvah"} hope it helps')).toBe("tomer-bar-mitzvah");
  });
  test("sanitizes: case, spaces, underscores, stray chars", () => {
    expect(parseSlugReply({ response: { slug: "  Tomer Bar_Mitzvah! " } })).toBe("tomer-bar-mitzvah");
  });
  test("trims long slugs to 30 chars without a trailing hyphen", () => {
    const s = parseSlugReply({ response: { slug: "kindergarten-havatzelet-ramat-hasharon-north" } });
    expect(s).toBe("kindergarten-havatzelet-ramat");
  });
  test("junk → null", () => {
    expect(parseSlugReply({ response: { slug: "בר מצווה" } })).toBeNull();
    expect(parseSlugReply({ response: { slug: "ab" } })).toBeNull();
    expect(parseSlugReply({ response: { slug: 7 } })).toBeNull();
    expect(parseSlugReply({ response: { name: "x-y-z" } })).toBeNull();
    expect(parseSlugReply({ response: "no json here" })).toBeNull();
    expect(parseSlugReply(undefined)).toBeNull();
  });
});

describe("suggestSlugWithAI", () => {
  test("sends the name with the prompt, JSON mode, low temperature, few tokens", async () => {
    const a = ai({ response: { slug: "tomer-bar-mitzvah" } });
    expect(await suggestSlugWithAI(a, M, "בר מצווה לתומר", free)).toBe("tomer-bar-mitzvah");
    expect(a.calls).toHaveLength(1);
    const input = a.calls[0]!.input as {
      messages: { role: string; content: string }[];
      max_tokens: number;
      temperature: number;
      response_format: { type: string };
    };
    expect(a.calls[0]!.model).toBe(M);
    expect(input.messages).toEqual([
      { role: "system", content: SLUG_SUGGEST_PROMPT },
      { role: "user", content: "בר מצווה לתומר" },
    ]);
    expect(input.max_tokens).toBeLessThanOrEqual(60);
    expect(input.temperature).toBeLessThanOrEqual(0.2);
    expect(input.response_format.type).toBe("json_schema");
  });

  test("taken slug → first free numbered variant", async () => {
    const taken = new Set(["tomer-bar-mitzvah", "tomer-bar-mitzvah-2"]);
    expect(await suggestSlugWithAI(ai({ response: { slug: "tomer-bar-mitzvah" } }), M, "x", async (s) => taken.has(s))).toBe(
      "tomer-bar-mitzvah-3",
    );
  });

  test("nothing free within the limit → null", async () => {
    expect(await suggestSlugWithAI(ai({ response: { slug: "busy-slug" } }), M, "x", async () => true)).toBeNull();
  });

  test("model throws → null, error reported", async () => {
    const errors: unknown[] = [];
    expect(await suggestSlugWithAI(ai(new Error("boom")), M, "x", free, undefined, (e) => errors.push(e))).toBeNull();
    expect(errors).toHaveLength(1);
  });

  test("junk reply → null", async () => {
    expect(await suggestSlugWithAI(ai({ response: "I cannot help with that." }), M, "x", free)).toBeNull();
    expect(await suggestSlugWithAI(ai(null), M, "x", free)).toBeNull();
  });

  test("taken-check failure → null", async () => {
    const boom = async (): Promise<boolean> => {
      throw new Error("do down");
    };
    expect(await suggestSlugWithAI(ai({ response: { slug: "abc-def" } }), M, "x", boom)).toBeNull();
  });

  test("deadline rejecting before a slow model → null", async () => {
    const slow: AiRunner = { run: () => new Promise((r) => setTimeout(() => r({ response: { slug: "late-one" } }), 200)) };
    const deadline = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10));
    const t0 = Date.now();
    expect(await suggestSlugWithAI(slow, M, "x", free, deadline)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(150);
  });
});
