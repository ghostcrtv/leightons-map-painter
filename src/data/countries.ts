/**
 * Country registry: the static facts about each country or territory.
 *
 * This is ORIGINAL WORLD DATA and is never modified by gameplay. Editable game
 * state (who owns what, power ratings, etc.) lives in separate modules so the
 * real world can always be restored.
 */

export interface CountryInfo {
  /** Stable game id. ISO 3166-1 alpha-2 code where one exists (e.g. "DE"), otherwise a slug. */
  id: string;
  name: string;
  /** Flag image code (see public/flags/atlas.json), or null for disputed areas. */
  flag: string | null;
  /** Disputed areas are drawn in neutral grey rather than with a flag. */
  disputed: boolean;
  /** Approximate real-world land area in km² (Natural Earth 1:10m data). */
  areaKm2: number;
}

export async function loadCountryRegistry(baseUrl: string): Promise<CountryInfo[]> {
  const res = await fetch(`${baseUrl}data/countries.json`);
  if (!res.ok) throw new Error(`Could not load country list (${res.status})`);
  return (await res.json()) as CountryInfo[];
}
