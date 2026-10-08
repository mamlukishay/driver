/**
 * Paint token for a car drawing, from the free-text color word on the car ("לבן", "כסופה", "אדום מטאלי").
 * Matches the first word by stem, so masculine and feminine forms both work; anything else is neutral.
 */
export type CarPaint = "white" | "black" | "grey" | "silver" | "red" | "blue" | "green" | "neutral";

const STEMS: [string, CarPaint][] = [
  ["לבנ", "white"],
  ["לבן", "white"],
  ["שחור", "black"],
  ["אפור", "grey"],
  ["כסו", "silver"],
  ["אדו", "red"],
  ["כחו", "blue"],
  ["ירו", "green"],
];

export function carPaint(color: string | undefined): CarPaint {
  const word = (color ?? "").trim().split(/\s+/)[0] ?? "";
  for (const [stem, paint] of STEMS) if (word.startsWith(stem)) return paint;
  return "neutral";
}
