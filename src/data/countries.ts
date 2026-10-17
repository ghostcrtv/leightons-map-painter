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
  /** Capital city name (filled in from capitals.json; missing for uninhabited places). */
  capital?: string;
}

export interface CapitalInfo {
  /** Country id this is the capital of. */
  id: string;
  name: string;
  lon: number;
  lat: number;
}

export async function loadCountryRegistry(baseUrl: string): Promise<{ countries: CountryInfo[]; capitals: CapitalInfo[] }> {
  const [cRes, capRes] = await Promise.all([fetch(`${baseUrl}data/countries.json`), fetch(`${baseUrl}data/capitals.json`)]);
  if (!cRes.ok) throw new Error(`Could not load country list (${cRes.status})`);
  const countries = (await cRes.json()) as CountryInfo[];
  // Capitals are a nice extra: if they fail to load, the game still works.
  const capitals = capRes.ok ? ((await capRes.json()) as CapitalInfo[]) : [];
  const capitalById = new Map(capitals.map((c) => [c.id, c.name]));
  for (const c of countries) c.capital = capitalById.get(c.id);
  return { countries, capitals };
}
