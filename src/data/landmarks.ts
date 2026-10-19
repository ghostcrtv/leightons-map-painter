/**
 * Famous landmarks at their real locations (latitude / longitude in degrees).
 * Shown as pins on the map when Settings → Landmarks is on; tapping one shows a photo,
 * its name and a fun fact. ORIGINAL data: never changed by gameplay.
 *
 * To add one: give it a unique id, the real coordinates, the country's id (ISO code as in
 * countries.json), an emoji (shown on the pin, and in the circle until a photo is added),
 * and one short, true, kid-friendly fact. A photo goes in public/landmarks/<id>.jpg
 * (square, about 480×480) with its credit in `photo`.
 */
export interface Landmark {
  id: string;
  name: string;
  /** City or area, e.g. "New York City". */
  place: string;
  /** Country id (ISO code, as in countries.json). */
  country: string;
  lat: number;
  lon: number;
  emoji: string;
  fact: string;
  /** The photo's credit and licence (public/landmarks/<id>.jpg). No photo yet = emoji. */
  photo?: { credit: string; licence: string };
}

export const LANDMARKS: Landmark[] = [
  // North America
  {
    id: 'statue-of-liberty', name: 'Statue of Liberty', place: 'New York City', country: 'US', lat: 40.6892, lon: -74.0445, emoji: '🗽',
    fact: 'A gift from France in 1886. From the ground to the tip of the torch she is 93 m tall.',
    photo: { credit: 'Christian David', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'golden-gate-bridge', name: 'Golden Gate Bridge', place: 'San Francisco', country: 'US', lat: 37.8199, lon: -122.4783, emoji: '🌉',
    fact: 'Opened in 1937. Its famous colour is called "International Orange".',
    photo: { credit: 'Frank Schulenburg', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'grand-canyon', name: 'Grand Canyon', place: 'Arizona', country: 'US', lat: 36.1069, lon: -112.1129, emoji: '🏜️',
    fact: 'The Colorado River carved it over millions of years. In places it is more than 1.8 km deep.',
    photo: { credit: 'Tuxyso', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'mount-rushmore', name: 'Mount Rushmore', place: 'South Dakota', country: 'US', lat: 43.8791, lon: -103.4591, emoji: '🪨',
    fact: 'Four presidents carved into a mountain. Each face is about 18 m tall.',
    photo: { credit: 'Thomas Wolf, www.foto-tw.de', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'niagara-falls', name: 'Niagara Falls', place: 'Ontario', country: 'CA', lat: 43.0896, lon: -79.0849, emoji: '💧',
    fact: 'Three waterfalls on the border between Canada and the United States.',
    photo: { credit: 'Maksimsokolov', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'chichen-itza', name: 'Chichén Itzá', place: 'Yucatán', country: 'MX', lat: 20.6843, lon: -88.5678, emoji: '🛕',
    fact: 'A great Maya city. Its pyramid, El Castillo, has 365 steps: one for each day of the year.',
    photo: { credit: 'Daniel Schwen', licence: 'CC BY-SA 4.0' },
  },
  // South America
  {
    id: 'christ-the-redeemer', name: 'Christ the Redeemer', place: 'Rio de Janeiro', country: 'BR', lat: -22.9519, lon: -43.2105, emoji: '⛰️',
    fact: 'A 30 m statue with open arms on top of Corcovado mountain, looking over the city.',
    photo: { credit: 'Arturdiasr', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'machu-picchu', name: 'Machu Picchu', place: 'Cusco Region', country: 'PE', lat: -13.1631, lon: -72.545, emoji: '🏔️',
    fact: 'An Inca city built high in the Andes mountains in the 1400s.',
    photo: { credit: 'Diego Delso', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'moai', name: 'Moai of Easter Island', place: 'Rapa Nui (Easter Island)', country: 'CL', lat: -27.1258, lon: -109.277, emoji: '🗿',
    fact: 'Almost 900 giant stone statues carved by the Rapa Nui people.',
    photo: { credit: 'Rivi', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'iguazu-falls', name: 'Iguazú Falls', place: 'Misiones', country: 'AR', lat: -25.6953, lon: -54.4367, emoji: '💦',
    fact: 'About 275 waterfalls on the border of Argentina and Brazil.',
    photo: { credit: 'Bernard Gagnon', licence: 'CC BY-SA 4.0' },
  },
  // Europe
  {
    id: 'eiffel-tower', name: 'Eiffel Tower', place: 'Paris', country: 'FR', lat: 48.8584, lon: 2.2945, emoji: '🗼',
    fact: 'Built for a world fair in 1889, from about 18,000 iron parts.',
    photo: { credit: 'Benh LIEU SONG', licence: 'Public domain' },
  },
  {
    id: 'big-ben', name: 'Big Ben', place: 'London', country: 'GB', lat: 51.5007, lon: -0.1246, emoji: '🕰️',
    fact: '"Big Ben" is really the name of the giant bell inside the clock tower.',
    photo: { credit: 'Julian Herzog', licence: 'CC BY 4.0' },
  },
  {
    id: 'stonehenge', name: 'Stonehenge', place: 'Wiltshire', country: 'GB', lat: 51.1789, lon: -1.8262, emoji: '🪨',
    fact: 'A ring of huge standing stones, started about 5,000 years ago.',
    photo: { credit: 'Diego Delso', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'colosseum', name: 'Colosseum', place: 'Rome', country: 'IT', lat: 41.8902, lon: 12.4922, emoji: '🏟️',
    fact: 'An arena of Ancient Rome that could hold about 50,000 people.',
    photo: { credit: 'Diliff', licence: 'CC BY-SA 2.5' },
  },
  {
    id: 'leaning-tower', name: 'Leaning Tower of Pisa', place: 'Pisa', country: 'IT', lat: 43.723, lon: 10.3966, emoji: '🔔',
    fact: 'It is a bell tower. It began to lean while it was still being built, in the 1100s.',
    photo: { credit: 'PaestumPaestum', licence: 'CC BY 4.0' },
  },
  {
    id: 'sagrada-familia', name: 'Sagrada Família', place: 'Barcelona', country: 'ES', lat: 41.4036, lon: 2.1744, emoji: '⛪',
    fact: 'A huge church designed by Antoni Gaudí. Building started in 1882!',
    photo: { credit: 'Bernard Gagnon', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'parthenon', name: 'Parthenon', place: 'Athens', country: 'GR', lat: 37.9715, lon: 23.7257, emoji: '🏛️',
    fact: 'A temple to the goddess Athena on the Acropolis hill, about 2,500 years old.',
    photo: { credit: 'A.Savin', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'neuschwanstein', name: 'Neuschwanstein Castle', place: 'Bavaria', country: 'DE', lat: 47.5576, lon: 10.7498, emoji: '🏰',
    fact: 'A fairy-tale castle built in the 1800s for King Ludwig II of Bavaria.',
    photo: { credit: 'C. Stadler/Bwag', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'st-basils', name: "Saint Basil's Cathedral", place: 'Moscow', country: 'RU', lat: 55.7525, lon: 37.6231, emoji: '⛪',
    fact: 'Famous for its colourful onion-shaped domes, on Red Square.',
    photo: { credit: 'Юрий Д.К.', licence: 'CC BY 4.0' },
  },
  // Africa and the Middle East
  {
    id: 'pyramids-of-giza', name: 'Pyramids of Giza', place: 'Giza', country: 'EG', lat: 29.9792, lon: 31.1342, emoji: '🔺',
    fact: 'The Great Pyramid is about 4,500 years old: the oldest of the Seven Wonders of the Ancient World.',
    photo: { credit: 'Ricardo Liberato', licence: 'CC BY-SA 2.0' },
  },
  {
    id: 'petra', name: 'Petra', place: "Ma'an", country: 'JO', lat: 30.3285, lon: 35.4444, emoji: '🏜️',
    fact: 'A city carved right into pink sandstone cliffs about 2,000 years ago.',
    photo: { credit: 'Diego Delso', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'burj-khalifa', name: 'Burj Khalifa', place: 'Dubai', country: 'AE', lat: 25.1972, lon: 55.2744, emoji: '🏙️',
    fact: 'When it opened in 2010 it was the tallest building in the world: 828 m high!',
    photo: { credit: 'Laika ac', licence: 'CC BY-SA 2.0' },
  },
  {
    id: 'kilimanjaro', name: 'Mount Kilimanjaro', place: 'Kilimanjaro Region', country: 'TZ', lat: -3.0674, lon: 37.3556, emoji: '🏔️',
    fact: "Africa's tallest mountain (5,895 m), with snow on top even though it is near the equator.",
    photo: { credit: 'Diego Delso', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'victoria-falls', name: 'Victoria Falls', place: 'Zambezi River', country: 'ZW', lat: -17.9243, lon: 25.8572, emoji: '🌈',
    fact: 'Its local name, Mosi-oa-Tunya, means "The Smoke That Thunders".',
    photo: { credit: 'Matti Blume', licence: 'CC BY-SA 4.0' },
  },
  // Asia and Oceania
  {
    id: 'taj-mahal', name: 'Taj Mahal', place: 'Agra', country: 'IN', lat: 27.1751, lon: 78.0421, emoji: '🕌',
    fact: 'A white marble tomb built by Emperor Shah Jahan in memory of his wife, Mumtaz Mahal.',
    photo: { credit: 'Yann; edited by King of Hearts', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'great-wall', name: 'Great Wall of China', place: 'Badaling, near Beijing', country: 'CN', lat: 40.3588, lon: 116.02, emoji: '🧱',
    fact: 'Built over many centuries. All its walls together stretch more than 20,000 km.',
    photo: { credit: 'CEphoto, Uwe Aranas', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'mount-fuji', name: 'Mount Fuji', place: 'Honshu', country: 'JP', lat: 35.3606, lon: 138.7274, emoji: '🗻',
    fact: "Japan's tallest mountain (3,776 m), and it is a volcano!",
    photo: { credit: 'MaedaAkihiko', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'angkor-wat', name: 'Angkor Wat', place: 'Siem Reap', country: 'KH', lat: 13.4125, lon: 103.867, emoji: '🛕',
    fact: 'The largest religious monument in the world, built in the 1100s. It is even on the flag of Cambodia!',
    photo: { credit: 'Jakub Hałun', licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'sydney-opera-house', name: 'Sydney Opera House', place: 'Sydney', country: 'AU', lat: -33.8568, lon: 151.2153, emoji: '🎭',
    fact: 'Its roofs look like giant sails. It opened in 1973.',
    photo: { credit: 'Diliff', licence: 'CC BY-SA 3.0' },
  },
  {
    id: 'uluru', name: 'Uluru', place: 'Northern Territory', country: 'AU', lat: -25.3444, lon: 131.0369, emoji: '🪨',
    fact: 'A giant red sandstone rock, sacred to the Anangu, the Aboriginal people of the area.',
    photo: { credit: 'Weyf', licence: 'CC0' },
  },
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));
