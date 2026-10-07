import type { PlacesResponse } from "../shared/types.ts";

/** Places API (New) autocomplete, Hebrew, Israel only. Failures yield no suggestions. */
export async function placesAutocomplete(apiKey: string, input: string): Promise<PlacesResponse> {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify({ input, languageCode: "he", includedRegionCodes: ["il"] }),
    });
    if (!res.ok) {
      console.error("places", res.status, await res.text().catch(() => ""));
      return { suggestions: [] };
    }
    const data = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    const suggestions: PlacesResponse["suggestions"] = [];
    for (const s of data.suggestions ?? []) {
      const p = s.placePrediction;
      if (p?.placeId && p.text?.text) suggestions.push({ text: p.text.text, placeId: p.placeId });
    }
    return { suggestions: suggestions.slice(0, 8) };
  } catch (e) {
    console.error("places fetch failed", e);
    return { suggestions: [] };
  }
}
