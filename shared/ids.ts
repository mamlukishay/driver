/** Lowercase, no ambiguous characters (0 o 1 l i). */
export const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

interface MinimalCrypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

const g = globalThis as unknown as { crypto: MinimalCrypto };

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

/** A random group slug (used when the creator gives none; legacy groups have these too). */
export const groupId = (): string => newId(GROUP_ID_LENGTH);

/** Short random ids (families, kids, cars, offers): lowercase from ID_ALPHABET. */
export function isId(value: unknown, len?: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (len !== undefined && value.length !== len) return false;
  for (const c of value) if (!ID_ALPHABET.includes(c)) return false;
  return true;
}
