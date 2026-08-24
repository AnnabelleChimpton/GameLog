// The CSV export is a promise about other people's software: Excel, Numbers,
// another collector app's importer. What matters is the quoting (a note with a
// comma must not become two cells), the BOM (Excel garbles "1080°" without it),
// and that the row says what the shelf says -- defaults resolved, not blank.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, collectionCsv } from '../assets/js/csv.mjs';

test('cells only quote when they must, and escape what they quote', () => {
  assert.equal(csvCell('Chrono Trigger'), 'Chrono Trigger');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(1998), '1998');
  assert.equal(csvCell('Beaten, twice'), '"Beaten, twice"');
  assert.equal(csvCell('the "gold" cart'), '"the ""gold"" cart"');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
});

test('the file starts with a BOM and a header row', () => {
  const csv = collectionCsv([]);
  assert.ok(csv.startsWith('\uFEFF'), 'Excel needs the byte-order mark');
  assert.equal(csv.slice(1).trimEnd(),
    'id,title,platform,year,region,condition,status,copies,genres,'
    + 'developer,publisher,metacritic,notes,added,igdbId');
});

test('a game becomes the row a spreadsheet reader would expect', () => {
  const csv = collectionCsv([{
    id: 'snes-earthbound', title: 'EarthBound', platform: 'SNES/Super Famicom',
    year: 1994, region: 'USA', condition: 'CIB', status: 'beaten', copies: 2,
    genres: ['RPG', 'Adventure'], developer: 'Ape, HAL', publisher: 'Nintendo',
    metacritic: null, notes: 'The "big box" one.', added: '2024-10-09', igdbId: 1384,
  }]);
  const row = csv.split('\r\n')[1];
  assert.equal(row,
    'snes-earthbound,EarthBound,SNES/Super Famicom,1994,USA,CIB,beaten,2,'
    + 'RPG; Adventure,"Ape, HAL",Nintendo,,"The ""big box"" one.",2024-10-09,1384');
});

test('missing fields export as the shelf shows them, not as gaps', () => {
  // No status means "unplayed" on the shelf; no copies count means one copy.
  const csv = collectionCsv([{ id: 'x', title: 'X', platform: 'PC' }]);
  const cells = csv.split('\r\n')[1].split(',');
  assert.equal(cells[6], 'unplayed');
  assert.equal(cells[7], '1');
  assert.equal(cells[8], '', 'no genres is an empty cell, not a crash');
});
