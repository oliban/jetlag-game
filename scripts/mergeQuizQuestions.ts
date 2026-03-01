#!/usr/bin/env npx tsx
/**
 * Merges all quizQuestions_*.json batch files into quizQuestions.json
 * Run: npx tsx scripts/mergeQuizQuestions.ts
 */
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'src/data');
const outputPath = path.join(dataDir, 'quizQuestions.json');

const merged: {
  stations: Record<string, unknown[]>;
  countries: Record<string, unknown[]>;
} = { stations: {}, countries: {} };

const batchFiles = fs.readdirSync(dataDir)
  .filter(f => f.startsWith('quizQuestions_') && f.endsWith('.json'))
  .sort();

if (batchFiles.length === 0) {
  console.log('No batch files found. Expected files like quizQuestions_france.json');
  process.exit(1);
}

let totalStations = 0;
let totalCountries = 0;
let totalQuestions = 0;

for (const file of batchFiles) {
  const filePath = path.join(dataDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  let data: { stations?: Record<string, unknown[]>; countries?: Record<string, unknown[]> };

  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to parse ${file}:`, e);
    continue;
  }

  if (data.stations) {
    for (const [id, qs] of Object.entries(data.stations)) {
      if (!merged.stations[id]) {
        merged.stations[id] = [];
        totalStations++;
      }
      merged.stations[id].push(...qs);
      totalQuestions += qs.length;
    }
  }

  if (data.countries) {
    for (const [name, qs] of Object.entries(data.countries)) {
      const key = name.toLowerCase();
      if (!merged.countries[key]) {
        merged.countries[key] = [];
        totalCountries++;
      }
      merged.countries[key].push(...qs);
      totalQuestions += qs.length;
    }
  }

  console.log(`  ✓ ${file}`);
}

fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));

console.log(`\nMerged ${batchFiles.length} batch files:`);
console.log(`  ${totalStations} stations`);
console.log(`  ${totalCountries} countries`);
console.log(`  ${totalQuestions} total questions`);
console.log(`\nOutput: ${outputPath}`);
