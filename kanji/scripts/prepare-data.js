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

const OUTPUT_DIR = path.join(__dirname, '..', 'data');

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
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

  // Sort each level by frequency (stroke count as rough proxy, or just alphabetically by kanji)
  for (const level of Object.keys(levels)) {
    levels[level].sort((a, b) => a.kanji.localeCompare(b.kanji, 'ja'));
  }

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
