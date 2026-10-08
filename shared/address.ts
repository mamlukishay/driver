/** A family's home address for navigation and full display: "street, city". */

/**
 * "הרצל 5" + "פרדס חנה-כרכור" → "הרצל 5, פרדס חנה-כרכור". Only the street when there is no city,
 * only the city when there is no street, "" when neither. A legacy street text that already names
 * the city ("הרצל 5, פרדס חנה") is returned unchanged.
 */
export function fullAddress(f: { address?: string; city?: string }): string {
  const street = (f.address ?? "").trim();
  const city = (f.city ?? "").trim();
  if (!city) return street;
  if (!street) return city;
  if (street.includes(city)) return street;
  return `${street}, ${city}`;
}
