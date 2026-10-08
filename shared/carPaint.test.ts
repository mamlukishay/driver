import { expect, test } from "bun:test";
import { carPaint } from "./carPaint.ts";

test("carPaint maps Hebrew color words to paint, unknown to neutral", () => {
  expect(carPaint("לבן")).toBe("white");
  expect(carPaint("לבנה")).toBe("white");
  expect(carPaint("שחור")).toBe("black");
  expect(carPaint("אפורה")).toBe("grey");
  expect(carPaint("כסוף")).toBe("silver");
  expect(carPaint("כסופה מטאלית")).toBe("silver");
  expect(carPaint("אדומה")).toBe("red");
  expect(carPaint("כחול כהה")).toBe("blue");
  expect(carPaint(" ירוק ")).toBe("green");
  expect(carPaint("בורדו")).toBe("neutral");
  expect(carPaint(undefined)).toBe("neutral");
  expect(carPaint("")).toBe("neutral");
});
