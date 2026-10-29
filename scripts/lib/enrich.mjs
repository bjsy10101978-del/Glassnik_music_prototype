/**
 * Catalogue enrichment tables and helpers.
 *
 * The Glassnik catalogue is a *research scaffold*: every record still has to
 * be replaced by a human-verified Pixabay Music track before production use.
 * This module adds the richness the scaffold was missing (distinct artists,
 * secondary genres and moods, vocals, a candidate Pixabay Music source URL
 * and a working Pixabay Music search URL) while keeping every value
 * deterministic, so `npm run build:data` always regenerates the same files.
 *
 * IMPORTANT HONESTY RULE
 * ----------------------
 * `source_url` is a *candidate* Pixabay Music track page URL. The numeric
 * track id is derived locally and has NOT been opened in a browser, so the
 * URL is not verified. Every record therefore keeps
 * `source_url_status: "candidate_unverified"`,
 * `review_status: "pending_source_verification"` and
 * `content_id_flag: "unverified"`, and `source_search_url` points at a real,
 * working Pixabay Music search page that a reviewer can use to find the
 * genuine track.
 */

/** First names used to build 100 distinct placeholder artist names. */
export const ARTIST_FIRST_NAMES = [
  'Alder',
  'Bramble',
  'Cedar',
  'Dune',
  'Ember',
  'Fable',
  'Grove',
  'Harbor',
  'Indigo',
  'Juniper',
  'Kestrel',
  'Lantern',
  'Meadow',
  'Nimbus',
  'Onyx',
  'Prairie',
  'Quarry',
  'River',
  'Sable',
  'Thicket',
  'Umber',
  'Verdant',
  'Willow',
  'Yarrow',
  'Zenith',
  'Basalt',
  'Cinder',
  'Drift',
  'Echo',
  'Flint',
  'Glade',
  'Hollow',
  'Isle',
  'Kelp',
  'Lichen',
  'Mistral',
  'North',
  'Orchard',
  'Pebble',
  'Quartz',
  'Reef',
  'Summit',
  'Tundra',
  'Vale',
  'Wold',
  'Zephyr',
  'Anchor',
  'Bramblewood',
  'Coastway',
  'Duskfall',
  'Everline',
];

/** Surnames used to build 100 distinct placeholder artist names. */
export const ARTIST_LAST_NAMES = [
  'Aalto',
  'Bellweather',
  'Cardinal',
  'Dovetail',
  'Eastway',
  'Fairlight',
  'Greenway',
  'Holloway',
  'Ironwood',
  'Jessup',
  'Kirkwall',
  'Larkspur',
  'Merrick',
  'Northrop',
  'Oakhart',
  'Penhurst',
  'Quarryman',
  'Ravenswood',
  'Saltmarsh',
  'Thistledown',
  'Underhill',
  'Vesper',
  'Westbrook',
  'Yarrowby',
  'Zephyrine',
  'Ashcombe',
  'Brightwater',
  'Cloudberry',
  'Dunmore',
  'Elmwood',
  'Fernbank',
  'Greyloch',
  'Hartwell',
  'Ivybridge',
  'Jasperly',
  'Kilnsey',
  'Longmarsh',
  'Moorcroft',
  'Nightingale',
  'Oxley',
  'Pinecrest',
  'Rushmere',
  'Stonegate',
  'Thornbury',
  'Ullswater',
  'Vantablack',
  'Whitlow',
  'Yewtree',
  'Amberly',
  'Bracknell',
  'Coleridge',
  'Dalefoot',
  'Everleigh',
];

/** Secondary genres. Never contains style words tied to a country. */
export const GENRE_POOL = [
  'ambient',
  'cinematic',
  'chillhop',
  'downtempo',
  'indie electronic',
  'acoustic',
  'minimal electronic',
  'lo-fi',
  'electronic',
  'orchestral',
  'piano',
  'synthwave',
  'house',
  'jazz-hop',
  'trip hop',
  'neoclassical',
  'percussion',
  'tropical',
  'drum and bass',
  'soft rock',
];

/**
 * Secondary moods. The eight moods that the sample experiences ask for
 * (calm, curious, uplifting, reflective, playful, dreamy, focused, warm) are
 * deliberately excluded so that adding a second mood can never change how a
 * recommendation is ranked.
 */
export const SECONDARY_MOODS = [
  'energetic',
  'chill',
  'romantic',
  'epic',
  'hopeful',
  'nostalgic',
  'mystical',
  'gentle',
  'bold',
  'serene',
  'melodic',
  'driving',
  'breezy',
  'jazzy',
  'earthy',
  'cosmic',
  'cinematic',
  'tender',
  'bright',
  'festive',
  'tranquil',
  'cozy',
  'sparse',
  'luminous',
];

/** Vocals labels cycled deterministically across the catalogue. */
export const VOCALS_CYCLE = ['instrumental', 'instrumental', 'mixed', 'instrumental', 'vocal'];

/** Lower-case, hyphenated slug used in Pixabay Music page URLs. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Candidate Pixabay Music track page URL.
 *
 * The shape matches the real Pixabay Music URL format
 * (`https://pixabay.com/music/<title-slug>-<track-id>/`) but the numeric id
 * is generated locally, so the URL is NOT verified.
 */
export function pixabayTrackUrl(title, trackNumber) {
  const slug = slugify(title);
  const id = 100000 + ((trackNumber * 7919 + 104729) % 900000);
  return `https://pixabay.com/music/${slug}-${id}/`;
}

/** A real, working Pixabay Music search URL a reviewer can use. */
export function pixabaySearchUrl(genre) {
  return `https://pixabay.com/music/search/${slugify(genre)}/`;
}

/**
 * Deterministic 6-digit id derived from a seed, used for placeholder artist
 * and content ids. Never used as a licence or rights identifier.
 */
export function stableId(seed, modulo = 900000, offset = 100000) {
  return offset + (Math.abs(Math.trunc(seed * 2654435761)) % modulo);
}
