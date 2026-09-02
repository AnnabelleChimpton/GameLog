// Ids are filenames and link targets, so the invariant that matters is
// stability: the same game must always mint the same id, and every id must be
// something the art vendoring will accept. data.test.mjs pins the everyday
// shapes; this file pins the degenerate corner where slugging eats the whole
// name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeId, uniqueId, slug } from '../assets/js/ids.mjs';

// The same shape scripts/lib/vendor.mjs enforces before an id may name a file.
const USABLE = /^[a-z0-9][a-z0-9-]*$/i;

test('a fully non-ASCII name still gets a usable, stable id', () => {
  const id = makeId('プレイステーション', 'ファイナルファンタジー');
  assert.match(id, USABLE, 'the fallback id has to be usable as a filename');
  // Re-saving the same game must reproduce the same id, or art files and list
  // refs detach on every edit.
  assert.equal(makeId('プレイステーション', 'ファイナルファンタジー'), id);
  // A different game must not collide with it.
  assert.notEqual(makeId('プレイステーション', 'ドラゴンクエスト'), id);
});

test('the fallback only fires when the slug is empty', () => {
  // A name with any surviving ASCII keeps the id it has always had.
  assert.equal(makeId('Nintendo 64', 'GoldenEye 007'), 'nintendo-64-goldeneye-007');
  assert.equal(makeId('プレステ', 'Final Fantasy VII'), 'final-fantasy-vii');
});

test('a degenerate id still dedups through uniqueId', () => {
  const first = makeId('', '日本語');
  const taken = new Set([first]);
  assert.equal(uniqueId(first, taken), `${first}-2`);
});

test('slug itself stays empty for non-ASCII', () => {
  // The fallback lives in makeId, not slug: slug stays a pure text transform,
  // so callers that build their own ids from it keep seeing the emptiness.
  assert.equal(slug('ファミコン'), '');
});
