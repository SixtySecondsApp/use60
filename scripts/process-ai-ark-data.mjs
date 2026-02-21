#!/usr/bin/env node
/**
 * Script to prune and transform AI Ark reference data files
 * into static JSON files for use in the frontend service.
 */

import { readFileSync, writeFileSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../AI-Ark-Structure');
const OUT_DIR = resolve(__dirname, '../src/lib/data/ai-ark');

console.log('Processing AI Ark reference data...\n');

// ─── 1. Industries ────────────────────────────────────────────────────────────
{
  const raw = JSON.parse(readFileSync(`${SRC_DIR}/industries.json`, 'utf-8'));
  // Already an array of strings
  const industries = raw.map(s => s.trim()).filter(Boolean);
  writeFileSync(`${OUT_DIR}/industries.json`, JSON.stringify(industries, null, 2));
  console.log(`industries.json: ${industries.length} entries`);
}

// ─── 2. Industry Tags ─────────────────────────────────────────────────────────
{
  const raw = JSON.parse(readFileSync(`${SRC_DIR}/industry tags.json`, 'utf-8'));
  const tags = raw.map(s => s.trim()).filter(Boolean);
  writeFileSync(`${OUT_DIR}/industry-tags.json`, JSON.stringify(tags, null, 2));
  console.log(`industry-tags.json: ${tags.length} entries`);
}

// ─── 3. Technologies (top 5000 by doc_count) ─────────────────────────────────
{
  const raw = JSON.parse(readFileSync(`${SRC_DIR}/technologies.json`, 'utf-8'));
  // Sort descending by doc_count, take top 5000
  const sorted = raw
    .filter(t => t && t.key)
    .sort((a, b) => b.doc_count - a.doc_count)
    .slice(0, 5000)
    .map(t => ({ key: t.key, doc_count: t.doc_count }));
  writeFileSync(`${OUT_DIR}/technologies.json`, JSON.stringify(sorted, null, 2));
  console.log(`technologies.json: ${sorted.length} entries (from ${raw.length} total)`);
}

// ─── 4. Cities (top 10000) ───────────────────────────────────────────────────
{
  const raw = JSON.parse(readFileSync(`${SRC_DIR}/person-location-city.json`, 'utf-8'));
  // Source is already sorted by popularity — take first 10000
  const cities = raw.slice(0, 10000).map(s => s.trim()).filter(Boolean);
  writeFileSync(`${OUT_DIR}/cities.json`, JSON.stringify(cities, null, 2));
  console.log(`cities.json: ${cities.length} entries (from ${raw.length} total)`);
}

// ─── 5. Countries (from JSONL) ────────────────────────────────────────────────
{
  const lines = readFileSync(`${SRC_DIR}/country&state.jsonl`, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  const countries = lines.map(line => {
    const obj = JSON.parse(line);
    return {
      name: obj.name,
      iso2: obj.iso2,
      region: obj.region,
      subregion: obj.subregion,
      zones: Array.isArray(obj.zone) ? obj.zone : [],
      states: Array.isArray(obj.states) ? obj.states.map(s => ({ name: s.name })) : [],
    };
  });

  writeFileSync(`${OUT_DIR}/countries.json`, JSON.stringify(countries, null, 2));
  console.log(`countries.json: ${countries.length} entries`);
}

console.log('\nDone! All files written to src/lib/data/ai-ark/');
