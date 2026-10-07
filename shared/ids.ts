/** Lowercase, no ambiguous characters (0 o 1 l i). */
export const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

interface MinimalCrypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> };
}
interface MinimalTextEncoder {
  encode(input: string): Uint8Array;
}

const g = globalThis as unknown as {
  crypto: MinimalCrypto;
  TextEncoder: new () => MinimalTextEncoder;
};

export function newId(len = 8): string {
  const out: string[] = [];
  const n = ID_ALPHABET.length;
  const limit = 256 - (256 % n);
  while (out.length < len) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of bytes) {
      if (b < limit && out.length < len) out.push(ID_ALPHABET[b % n]!);
    }
  }
  return out.join("");
}

export const GROUP_ID_LENGTH = 10;
export const KID_TOKEN_LENGTH = 12;
export const FAMILY_SECRET_LENGTH = 24;

export const groupId = (): string => newId(GROUP_ID_LENGTH);
export const kidToken = (): string => newId(KID_TOKEN_LENGTH);
export const familySecret = (): string => newId(FAMILY_SECRET_LENGTH);

export function isId(value: unknown, len?: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (len !== undefined && value.length !== len) return false;
  for (const c of value) if (!ID_ALPHABET.includes(c)) return false;
  return true;
}

export async function sha256hex(input: string): Promise<string> {
  const data = new g.TextEncoder().encode(input);
  const hash = new Uint8Array(await g.crypto.subtle.digest("SHA-256", data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `X-Family-Key` is `<familyId>.<secret>`. */
export function formatFamilyKey(familyId: string, secret: string): string {
  return `${familyId}.${secret}`;
}

export function parseFamilyKey(header: string | null | undefined): { familyId: string; secret: string } | null {
  if (!header) return null;
  const dot = header.indexOf(".");
  if (dot <= 0) return null;
  const familyId = header.slice(0, dot);
  const secret = header.slice(dot + 1);
  if (!isId(familyId) || !isId(secret, FAMILY_SECRET_LENGTH)) return null;
  return { familyId, secret };
}
