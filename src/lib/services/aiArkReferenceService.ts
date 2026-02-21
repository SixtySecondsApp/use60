/**
 * AI Ark Reference Service
 *
 * Provides fuzzy autocomplete search over bundled static reference data:
 * industries, industry tags, technologies, cities, and countries.
 *
 * All data is imported at build time — no network requests, no external deps.
 */

import industriesData from '@/lib/data/ai-ark/industries.json';
import industryTagsData from '@/lib/data/ai-ark/industry-tags.json';
import technologiesData from '@/lib/data/ai-ark/technologies.json';
import citiesData from '@/lib/data/ai-ark/cities.json';
import countriesData from '@/lib/data/ai-ark/countries.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Technology {
  key: string;
  doc_count: number;
}

export interface Country {
  name: string;
  iso2: string;
  region: string;
  subregion: string;
  zones: string[];
  states: { name: string }[];
}

export type TradeZone = 'G7' | 'G20' | 'EU' | 'APEC' | 'LATAM' | 'MENA';

// Zone label substrings to match against the zones[] array in each country
const TRADE_ZONE_KEYWORDS: Record<TradeZone, string> = {
  G7: 'G7',
  G20: 'G20',
  EU: 'EU (',
  APEC: 'APEC',
  LATAM: 'LATAM',
  MENA: 'MENA',
};

// ─── Typed data casts ─────────────────────────────────────────────────────────

const industries = industriesData as string[];
const industryTags = industryTagsData as string[];
const technologies = technologiesData as Technology[];
const cities = citiesData as string[];
const countries = countriesData as Country[];

// ─── Fuzzy Search Helpers ─────────────────────────────────────────────────────

/**
 * Fuzzy search over a string array.
 * Results are sorted: exact prefix matches first, then substring matches.
 */
function fuzzySearchStrings(items: string[], query: string, limit = 20): string[] {
  if (!query.trim()) return items.slice(0, limit);
  const q = query.toLowerCase();
  const exact: string[] = [];
  const contains: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower.startsWith(q)) exact.push(item);
    else if (lower.includes(q)) contains.push(item);
  }
  return [...exact, ...contains].slice(0, limit);
}

/**
 * Fuzzy search over technologies by key string.
 * Results are sorted: exact prefix matches first, then substring matches.
 * Within each group, original doc_count order (already descending) is preserved.
 */
function fuzzySearchTechnologies(items: Technology[], query: string, limit = 20): Technology[] {
  if (!query.trim()) return items.slice(0, limit);
  const q = query.toLowerCase();
  const exact: Technology[] = [];
  const contains: Technology[] = [];
  for (const item of items) {
    const lower = item.key.toLowerCase();
    if (lower.startsWith(q)) exact.push(item);
    else if (lower.includes(q)) contains.push(item);
  }
  return [...exact, ...contains].slice(0, limit);
}

/**
 * Fuzzy search over countries by name.
 */
function fuzzySearchCountries(
  items: Country[],
  query: string,
  limit = 20,
): { name: string; iso2: string; region: string; subregion: string }[] {
  if (!query.trim()) {
    return items.slice(0, limit).map(({ name, iso2, region, subregion }) => ({
      name,
      iso2,
      region,
      subregion,
    }));
  }
  const q = query.toLowerCase();
  const exact: Country[] = [];
  const contains: Country[] = [];
  for (const item of items) {
    const lower = item.name.toLowerCase();
    if (lower.startsWith(q)) exact.push(item);
    else if (lower.includes(q)) contains.push(item);
  }
  return [...exact, ...contains].slice(0, limit).map(({ name, iso2, region, subregion }) => ({
    name,
    iso2,
    region,
    subregion,
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fuzzy-search industries by name.
 * Returns up to `limit` matches, prefix matches first.
 */
export function searchIndustries(query: string, limit = 20): string[] {
  return fuzzySearchStrings(industries, query, limit);
}

/**
 * Fuzzy-search industry tags by name.
 * Returns up to `limit` matches, prefix matches first.
 */
export function searchIndustryTags(query: string, limit = 20): string[] {
  return fuzzySearchStrings(industryTags, query, limit);
}

/**
 * Fuzzy-search technologies by key.
 * Results preserve popularity ordering within match groups.
 * Returns up to `limit` matches, prefix matches first.
 */
export function searchTechnologies(query: string, limit = 20): Technology[] {
  return fuzzySearchTechnologies(technologies, query, limit);
}

/**
 * Fuzzy-search cities by name.
 * Cities are pre-sorted by global popularity in the dataset.
 * Returns up to `limit` matches, prefix matches first.
 */
export function searchCities(query: string, limit = 20): string[] {
  return fuzzySearchStrings(cities, query, limit);
}

/**
 * Fuzzy-search countries by name.
 * Returns up to `limit` matches with basic country metadata.
 */
export function searchCountries(
  query: string,
  limit = 20,
): { name: string; iso2: string; region: string; subregion: string }[] {
  return fuzzySearchCountries(countries, query, limit);
}

/**
 * Get all countries belonging to a specific trade zone.
 * Zone matching is done against the `zones` string array on each country.
 */
export function getTradeZoneCountries(zone: TradeZone): { name: string; iso2: string }[] {
  const keyword = TRADE_ZONE_KEYWORDS[zone];
  return countries
    .filter(c => c.zones.some(z => z.includes(keyword)))
    .map(({ name, iso2 }) => ({ name, iso2 }));
}

/**
 * Get the most popular technologies (already sorted by doc_count descending).
 */
export function getPopularTechnologies(limit = 20): Technology[] {
  return technologies.slice(0, limit);
}

/**
 * Async stub for future full-dataset API calls.
 * Currently returns the bundled data (technologies top 5000, cities top 10000).
 */
export async function getFullDataset(type: 'technologies' | 'cities'): Promise<string[] | Technology[]> {
  if (type === 'technologies') return technologies;
  return cities;
}
