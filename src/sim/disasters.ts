/**
 * Natural disasters. Pure data + rules (unit-tested). Add a disaster by adding an entry to
 * DISASTERS (and an animation in effects.ts, or it uses a simple default one).
 *
 * "Random disaster" picks a disaster that fits the place: hurricanes for warm coasts,
 * earthquakes and volcanoes on the Pacific "Ring of Fire", blizzards in the cold north,
 * sandstorms in deserts, and so on. The lists below are simplified for a game.
 */
import { pickWeighted, type Rand } from './random';

export interface PlaceFacts {
  id: string;
  /** Latitude/longitude of the country's middle (degrees). */
  lat: number;
  lon: number;
  coastal: boolean;
  km2: number;
}

export interface DisasterDef {
  id: string;
  name: string;
  emoji: string;
  /** Words for the banner: "Earthquake shakes Japan!" */
  verb: string;
  /** How much it weakens (0–1), random between these. */
  severity: [number, number];
  /** How likely this disaster is in a place (0 = never picked by "Random"). */
  fits: (p: PlaceFacts) => number;
  /** A "crazy" disaster: only happens when Crazy disasters are turned on in Settings. */
  crazy?: boolean;
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Pacific Ring of Fire, Himalaya, Mediterranean and Middle East belts (simplified). */
export const SEISMIC = set(`JP ID PH TW CN NP BT IN PK AF IR TR GR IT AL MK ME BA HR SI CY IL JO LB SY IQ TJ KG UZ TM
  AZ AM GE RU MM MN DZ MA PT RO HT DO JM PR CU MX GT SV HN NI CR PA CO EC PE BO CL AR VE TT US CA NZ PG SB VU FJ TO WS
  TL KR KP IS ER DJ ET KE TZ UG RW BI CD MW MZ YE OM AE SA KZ GU MP AS LK BD`);

export const VOLCANIC = set(`JP ID PH TW NZ PG SB VU FJ TO WS RU US MX GT SV HN NI CR PA CO EC PE BO CL AR IS IT GR
  ES PT CV CM CD RW UG TZ KE ET ER DJ YE SA KM RE MS VC LC DM GP MQ KN TF HM AQ GQ ST TR AM IR AF MN CN KR KP`);

export const TORNADO = set(`US CA MX BD IN AR BR UY PY ZA AU NZ GB IE FR DE PL IT ES NL BE CZ AT HU UA RU CN JP
  TR RO BG RS SE FI EE LV LT BY SK CH DK`);

export const DESERT = set(`DZ EG LY TN MA EH MR ML NE TD SD SA AE QA KW BH OM YE IQ IR JO IL SY AF PK TM UZ KZ MN
  CN AU NA BW DJ SO ER ET SS PS`);

export const WILDFIRE = set(`AU US CA GR PT ES IT FR TR RU BR CL AR BO ZA MX IL LB CY HR AL MK DZ TN MA KZ MN ID`);

export const FLOODY = set(`BD NL IN PK CN VN TH MM KH LA ID PH JP BR NG GH SD SS SO KE MZ MG DE BE GB FR IT PL CZ RO
  US MX CO PE VE GY SR NP MY LK AF IR`);

const absLat = (p: PlaceFacts) => Math.abs(p.lat);

const tropicalStorms = (p: PlaceFacts) => {
  if (!p.coastal) return 0;
  const lat = p.lat;
  const lon = p.lon;
  const atl = lat > 8 && lat < 42 && lon > -100 && lon < -55; // Atlantic & Caribbean
  const epac = lat > 8 && lat < 30 && lon > -120 && lon <= -85; // East Pacific (Mexico)
  const wpac = lat > 3 && lat < 42 && lon > 95 && lon < 180; // Typhoons
  const nind = lat > 5 && lat < 26 && lon > 50 && lon < 100; // Bay of Bengal, Arabian Sea
  const sind = lat < -8 && lat > -35 && lon > 30 && lon < 180; // Madagascar to Australia & Pacific islands
  const spac = lat < -8 && lat > -30 && (lon > 150 || lon < -130);
  return atl || epac || wpac || nind || sind || spac ? 3 : 0;
};

export const DISASTERS: DisasterDef[] = [
  {
    id: 'earthquake', name: 'Earthquake', emoji: '🫨', verb: 'shakes', severity: [0.04, 0.3],
    fits: (p) => (SEISMIC.has(p.id) ? 3 : 0.15),
  },
  {
    id: 'volcano', name: 'Volcano', emoji: '🌋', verb: 'erupts in', severity: [0.05, 0.32],
    fits: (p) => (VOLCANIC.has(p.id) ? 2.5 : 0),
  },
  {
    id: 'tsunami', name: 'Tsunami', emoji: '🌊', verb: 'crashes into', severity: [0.06, 0.32],
    fits: (p) => (p.coastal && SEISMIC.has(p.id) ? 2 : 0),
  },
  {
    id: 'hurricane', name: 'Hurricane', emoji: '🌀', verb: 'slams', severity: [0.05, 0.3],
    fits: tropicalStorms,
  },
  {
    id: 'tornado', name: 'Tornado', emoji: '🌪️', verb: 'tears across', severity: [0.03, 0.2],
    fits: (p) => (TORNADO.has(p.id) ? 2.5 : absLat(p) > 25 && absLat(p) < 55 && p.km2 > 20000 ? 0.3 : 0),
  },
  {
    id: 'flood', name: 'Flood', emoji: '💧', verb: 'floods', severity: [0.03, 0.24],
    fits: (p) => (FLOODY.has(p.id) ? 3 : DESERT.has(p.id) ? 0.3 : absLat(p) > 66 ? 0.2 : 1.2),
  },
  {
    id: 'wildfire', name: 'Wildfire', emoji: '🔥', verb: 'burns across', severity: [0.03, 0.22],
    fits: (p) => (WILDFIRE.has(p.id) ? 3 : absLat(p) > 15 && absLat(p) < 62 && p.km2 > 10000 && !DESERT.has(p.id) ? 0.6 : 0),
  },
  {
    id: 'drought', name: 'Drought', emoji: '☀️', verb: 'dries out', severity: [0.04, 0.22],
    fits: (p) => (DESERT.has(p.id) ? 2 : absLat(p) < 38 && p.km2 > 50000 ? 1.2 : absLat(p) < 50 && p.km2 > 50000 ? 0.4 : 0),
  },
  {
    id: 'blizzard', name: 'Blizzard', emoji: '❄️', verb: 'freezes', severity: [0.03, 0.18],
    fits: (p) => (absLat(p) > 55 ? 3 : absLat(p) > 40 ? 1.5 : ['NP', 'BT', 'AF', 'TJ', 'KG', 'CH', 'AT', 'LS'].includes(p.id) ? 1 : 0),
  },
  {
    id: 'sandstorm', name: 'Sandstorm', emoji: '🏜️', verb: 'buries', severity: [0.03, 0.18],
    fits: (p) => (DESERT.has(p.id) ? 3 : 0),
  },
  {
    id: 'meteor', name: 'Meteor strike', emoji: '☄️', verb: 'smashes into', severity: [0.1, 0.4],
    fits: () => 0.12, // rare, can happen anywhere
  },
  // ---- Crazy disasters (Settings → Crazy disasters). Cartoon fun; they weaken like the others.
  { id: 'zombies', name: 'Zombie outbreak', emoji: '🧟', verb: 'shambles into', severity: [0.06, 0.34], fits: () => 1, crazy: true },
  { id: 'aliens', name: 'Alien invasion', emoji: '👽', verb: 'lands in', severity: [0.06, 0.34], fits: () => 1, crazy: true },
  { id: 'nuke', name: 'Nuclear bomb', emoji: '☢️', verb: 'explodes over', severity: [0.2, 0.45], fits: () => 0.6, crazy: true },
  { id: 'spiders', name: 'Giant spider swarm', emoji: '🕷️', verb: 'crawls all over', severity: [0.04, 0.26], fits: () => 1, crazy: true },
  { id: 'kraken', name: 'Kraken attack', emoji: '🐙', verb: 'rises up at', severity: [0.05, 0.3], fits: (p) => (p.coastal ? 1 : 0), crazy: true },
  { id: 'robots', name: 'Robot uprising', emoji: '🤖', verb: 'takes over', severity: [0.06, 0.32], fits: () => 1, crazy: true },
  { id: 'dinosaurs', name: 'Dinosaur stampede', emoji: '🦖', verb: 'stomps through', severity: [0.05, 0.3], fits: () => 1, crazy: true },
  { id: 'spaghetti', name: 'Spaghetti storm', emoji: '🍝', verb: 'rains down on', severity: [0.02, 0.14], fits: () => 1, crazy: true },
  { id: 'dragon', name: 'Dragon attack', emoji: '🐉', verb: 'breathes fire on', severity: [0.06, 0.34], fits: () => 1, crazy: true },
  { id: 'blackhole', name: 'Mini black hole', emoji: '🕳️', verb: 'swallows part of', severity: [0.12, 0.42], fits: () => 0.5, crazy: true },
];

export const NORMAL_DISASTERS = DISASTERS.filter((d) => !d.crazy);
export const CRAZY_DISASTERS = DISASTERS.filter((d) => d.crazy);

/** With crazy disasters on, about this share of random disasters are crazy ones. */
export const CRAZY_CHANCE = 0.3;

export const DISASTER_BY_ID = new Map(DISASTERS.map((d) => [d.id, d]));

/** Disasters that can happen here, likeliest first. */
export function likelyDisasters(p: PlaceFacts): { def: DisasterDef; weight: number }[] {
  return NORMAL_DISASTERS.map((def) => ({ def, weight: def.fits(p) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** A disaster that fits the place (random, weighted). */
export function pickDisaster(p: PlaceFacts, rand: Rand, crazy = false): DisasterDef {
  if (crazy && rand() < CRAZY_CHANCE) return pickCrazy(p, rand);
  const list = likelyDisasters(p);
  if (!list.length) return DISASTER_BY_ID.get('meteor')!;
  return pickWeighted(list.map((x) => ({ item: x.def, weight: x.weight })), rand);
}

/** A random crazy disaster that can happen here (the kraken needs a coast). */
export function pickCrazy(p: PlaceFacts, rand: Rand): DisasterDef {
  const list = CRAZY_DISASTERS.map((def) => ({ item: def, weight: def.fits(p) })).filter((x) => x.weight > 0);
  return pickWeighted(list, rand);
}

/** How bad this one is: usually light or moderate, sometimes severe, rarely extreme. */
export function rollSeverity(def: DisasterDef, rand: Rand): number {
  const [a, b] = def.severity;
  return Math.round((a + (b - a) * Math.pow(rand(), 1.6)) * 100) / 100;
}

export function severityWord(s: number): 'Light' | 'Moderate' | 'Severe' | 'Extreme' {
  return s < 0.09 ? 'Light' : s < 0.16 ? 'Moderate' : s < 0.25 ? 'Severe' : 'Extreme';
}

/** How the smoke looks for a total weakness (0–0.6). */
export function smokeWord(w: number): string {
  return w < 0.1 ? 'a little smoke' : w < 0.2 ? 'smoking' : w < 0.35 ? 'heavy smoke' : 'huge clouds of smoke';
}
