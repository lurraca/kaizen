#!/usr/bin/env node

// Data preparation script for Kanji of the Day
// Merges kanji details from Smallsan/jlpt_kanji_json_msgpack
// with vocabulary from AnchorI/jlpt-kanji-dictionary

const fs = require('fs');
const path = require('path');

const KANJI_URL = 'https://raw.githubusercontent.com/Smallsan/jlpt_kanji_json_msgpack/main/kanji_jlpt_only.json';
const DICT_URLS = [1, 2, 3, 4].map(i =>
  `https://raw.githubusercontent.com/AnchorI/jlpt-kanji-dictionary/main/dictionary_part_${i}.json`
);

const KANJIVG_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';
const OUTPUT_DIR = path.join(__dirname, '..', 'data');

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
}

async function fetchText(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.text();
}

function extractStrokePaths(svgText) {
  if (!svgText) return null;
  const paths = [];
  const pathRegex = /<path[^>]*\bd="([^"]+)"[^>]*>/g;
  let match;
  while ((match = pathRegex.exec(svgText)) !== null) {
    // Only get paths from the StrokePaths group (skip stroke numbers)
    paths.push(match[1]);
  }
  return paths.length > 0 ? paths : null;
}

async function fetchStrokeData(kanji) {
  const code = kanji.codePointAt(0).toString(16).padStart(5, '0');
  const url = `${KANJIVG_BASE}/${code}.svg`;
  const svg = await fetchText(url);
  return extractStrokePaths(svg);
}

// Fetch stroke data with concurrency limit to avoid hammering the server
async function fetchAllStrokes(kanjiList, concurrency = 10) {
  const results = new Map();
  for (let i = 0; i < kanjiList.length; i += concurrency) {
    const batch = kanjiList.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (k) => [k, await fetchStrokeData(k)])
    );
    for (const [k, paths] of batchResults) {
      results.set(k, paths);
    }
    if (i + concurrency < kanjiList.length) {
      process.stdout.write(`\r  Fetched strokes: ${Math.min(i + concurrency, kanjiList.length)}/${kanjiList.length}`);
    }
  }
  process.stdout.write(`\r  Fetched strokes: ${kanjiList.length}/${kanjiList.length}\n`);
  return results;
}

function cleanMeanings(meanings) {
  return meanings.filter(m => !m.match(/radical\s*\(no\.\d+\)/i));
}

function findExamples(kanji, dictionary, maxExamples = 3) {
  const examples = [];
  for (const entry of dictionary) {
    if (!entry.kanji || !entry.kanji.includes(kanji)) continue;
    // Skip entries that are just the kanji itself
    if (entry.kanji === kanji) continue;

    // Extract English meanings from glossary_en, filtering out example sentences
    const meanings = (entry.glossary_en || []).filter(g =>
      !g.includes('。') && !g.includes('.')  && g.length < 60
    );
    if (meanings.length === 0) continue;

    examples.push({
      word: entry.kanji,
      reading: entry.reading || '',
      meaning: meanings.slice(0, 2).join('; ')
    });

    if (examples.length >= maxExamples) break;
  }
  return examples;
}

async function main() {
  console.log('Fetching kanji data...');
  const kanjiData = await fetchJSON(KANJI_URL);

  console.log('Fetching dictionary data...');
  const dictParts = await Promise.all(DICT_URLS.map(fetchJSON));
  const dictionary = dictParts.flat();
  console.log(`Loaded ${dictionary.length} dictionary entries`);

  // Sort dictionary by word length (shorter words are typically more common/useful)
  dictionary.sort((a, b) => (a.kanji || '').length - (b.kanji || '').length);

  // Group kanji by JLPT level
  const levels = { 5: [], 4: [], 3: [], 2: [], 1: [] };

  for (const [char, data] of Object.entries(kanjiData)) {
    const level = data.jlpt;
    if (!level || !levels[level]) continue;

    const cleaned = {
      kanji: char,
      meanings: cleanMeanings(data.meanings || []),
      on: data.on_readings || [],
      kun: data.kun_readings || [],
      strokes: data.stroke_count || 0,
      heisig: data.heisig_en || null,
      examples: findExamples(char, dictionary)
    };

    levels[level].push(cleaned);
  }

  // Sort each level alphabetically
  for (const level of Object.keys(levels)) {
    levels[level].sort((a, b) => a.kanji.localeCompare(b.kanji, 'ja'));
  }

  // Fetch stroke order data from KanjiVG
  const allKanji = Object.values(levels).flat().map(k => k.kanji);
  console.log(`Fetching stroke order data for ${allKanji.length} kanji...`);
  const strokeData = await fetchAllStrokes(allKanji);

  let strokeCount = 0;
  for (const level of Object.values(levels)) {
    for (const entry of level) {
      const paths = strokeData.get(entry.kanji);
      if (paths) {
        entry.strokePaths = paths;
        strokeCount++;
      }
    }
  }
  console.log(`Added stroke data for ${strokeCount}/${allKanji.length} kanji`);

  // Write output files
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [level, kanji] of Object.entries(levels)) {
    const filename = `n${level}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(kanji, null, 2));
    console.log(`Wrote ${filepath} (${kanji.length} kanji)`);
  }

  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
