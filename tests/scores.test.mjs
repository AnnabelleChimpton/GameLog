import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewTemplate, metacriticFor, scoreIn, readClaims, scoreFromClaims } from '../scripts/lib/scores.mjs';
import { yearFromExtract, looksRelevant, sameGame, candidates } from '../scripts/lib/wikipedia.mjs';

const article = (body) => `'''Halo 2''' is a 2004 game.\n== Reception ==\n${body}\nMore prose.`;

/* --- Reading the template ------------------------------------------------- */

test('reviewTemplate finds the box and reads its fields, nested templates and all', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| PC = true
| MC_PC = 72/100<ref name="mcpc">{{cite web|url=https://x|title=A|b=c}}</ref>
| MC_XBOX = 95/100<ref name="mcx" />
| IGN = 9.8/10
}}`));
  assert.ok(params);
  assert.equal(params.PC, 'true');
  assert.match(params.MC_PC, /^72\/100/);
  assert.match(params.MC_XBOX, /^95\/100/);
  assert.equal(reviewTemplate('no box here at all'), null);
});

test('scoreIn reads the ways a score gets written', () => {
  assert.equal(scoreIn('95/100'), 95);
  assert.equal(scoreIn('73 of 100'), 73);
  assert.equal(scoreIn('88%'), 88);
  assert.equal(scoreIn('(PC) 85/100'), 85);
  assert.equal(scoreIn('9.8/10'), null);
  assert.equal(scoreIn('N/A'), null);
});

/* --- Picking the platform's score ----------------------------------------- */

test('a field for the platform itself wins outright', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC_PC = 72/100<ref/>
| MC_XBOX = 95/100<ref/>
}}`));
  assert.equal(metacriticFor(params, 'Microsoft Xbox'), 95);
  assert.equal(metacriticFor(params, 'PC'), 72);
  assert.equal(metacriticFor(params, 'Sony PlayStation 2'), null, 'not listed: no guess');
});

test('one unlabelled score belongs to the original release only', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC = 83/100<ref name="MC">{{cite web|title=x}}</ref>
}}`));
  assert.equal(metacriticFor(params, 'Nintendo 64', { original: true }), 83);
  assert.equal(metacriticFor(params, 'Nintendo Switch', { original: false }), null,
    'a port does not inherit the original\'s score');
});

test('several scores in one field are told apart by their labels', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC = (PC) 88/100<ref/><br />(Xbox) 74/100<ref/>
}}`));
  assert.equal(metacriticFor(params, 'Microsoft Xbox'), 74);
  assert.equal(metacriticFor(params, 'PC'), 88);
  assert.equal(metacriticFor(params, 'Nintendo GameCube'), null);
});

test('"Xbox" does not claim the Xbox 360 line, nor "Wii" the Wii U one', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC = Xbox 360: 81/100<br>Wii U: 70/100<br>PS3: 80/100
}}`));
  assert.equal(metacriticFor(params, 'Microsoft Xbox'), null);
  assert.equal(metacriticFor(params, 'Nintendo Wii'), null);
  assert.equal(metacriticFor(params, 'Microsoft Xbox 360'), 81);
  assert.equal(metacriticFor(params, 'Nintendo Wii U'), 70);
  assert.equal(metacriticFor(params, 'Sony PlayStation 3'), 80);
});

test('a bare score followed by labelled re-releases is the original\'s', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC = 97/100 (70 reviews)<ref/><hr>'''''Remastered''''': 94/100<ref/>
}}`));
  assert.equal(metacriticFor(params, 'Nintendo GameCube', { original: true }), 97);
  assert.equal(metacriticFor(params, 'Nintendo Switch', { original: false }), null);
});

test('unbulleted lists inside the value split into lines', () => {
  const params = reviewTemplate(article(`{{Video game reviews
| MC = {{Unbulleted list|PS4: 85/100<ref/>|PC: 83/100<ref/>}}
}}`));
  assert.equal(metacriticFor(params, 'Sony PlayStation 4'), 85);
  assert.equal(metacriticFor(params, 'PC'), 83);
});

test('a value of "wikidata" yields nothing from the article', () => {
  const params = reviewTemplate(article('{{Video game reviews\n| MC = wikidata\n}}'));
  assert.equal(metacriticFor(params, 'Sony PlayStation 5', { original: true }), null);
});

/* --- Wikidata ------------------------------------------------------------- */

const claim = (value, by, platforms = []) => ({
  mainsnak: { datavalue: { value } },
  qualifiers: {
    P447: by.map((id) => ({ datavalue: { value: { id } } })),
    P400: platforms.map((id) => ({ datavalue: { value: { id } } })),
  },
});

test('readClaims keeps only Metacritic scores, with their platforms', () => {
  const scores = readClaims({ claims: { P444: [
    claim('85/100', ['Q150248'], ['Q5014725']),
    claim('92%', ['Q21039459']),            // OpenCritic, not wanted
    claim('79/100', ['Q150248'], ['Q19610114']),
  ] } });
  assert.deepEqual(scores, [
    { score: 85, platforms: ['Q5014725'] },
    { score: 79, platforms: ['Q19610114'] },
  ]);
});

test('scoreFromClaims matches on the platform item, and PC on either PC item', () => {
  const scores = [
    { score: 85, platforms: ['Q5014725'] },
    { score: 79, platforms: ['Q19610114'] },
    { score: 87, platforms: ['Q16338'] },
  ];
  assert.equal(scoreFromClaims(scores, 'Sony PlayStation 4'), 85);
  assert.equal(scoreFromClaims(scores, 'Nintendo Switch'), 79);
  assert.equal(scoreFromClaims(scores, 'PC'), 87);
  assert.equal(scoreFromClaims(scores, 'Microsoft Xbox One'), null);
  assert.equal(scoreFromClaims([{ score: 90, platforms: [] }], 'Nintendo 64', { original: true }), 90);
  assert.equal(scoreFromClaims([{ score: 90, platforms: [] }], 'Nintendo 64', { original: false }), null);
});

/* --- Telling articles apart ----------------------------------------------- */

test('yearFromExtract takes the year the game is, not a neighbour\'s', () => {
  assert.equal(yearFromExtract('Mario Kart 64 is a 1996 kart racing game. It followed Super Mario Kart (1992).'), 1996);
  assert.equal(yearFromExtract('The Last of Us Part II is a 2020 action-adventure game, a sequel to the 2013 game.'), 2020);
  assert.equal(yearFromExtract('1080° Avalanche is a snowboarding game for the GameCube. It was released on December 1, 2003, in North America. It is a sequel to the 1998 game.'), 2003);
  assert.equal(yearFromExtract('Tetris is a puzzle game.'), null);
});

test('looksRelevant accepts any kind of game and turns down a series or a film', () => {
  assert.ok(looksRelevant('Ocarina of Time is a 1998 action-adventure game developed by Nintendo.'));
  assert.ok(looksRelevant('Ratchet & Clank is a 2016 platform video game. It is a tie-in to the 2016 film of the same name.'));
  assert.ok(!looksRelevant('Super Smash Bros. is a crossover fighting game series published by Nintendo.'));
  assert.ok(!looksRelevant('Doom is an American media franchise created by id Software.'));
  assert.ok(!looksRelevant('GoldenEye is a 1995 spy film in the James Bond series.'));
});

test('sameGame rejects a namesake from another decade and passes unknown years', () => {
  assert.ok(sameGame({ year: 2016 }, 'Ratchet & Clank is a 2016 platform game.'));
  assert.ok(!sameGame({ year: 2016 }, 'Ratchet & Clank is a 2002 platform game.'));
  assert.ok(sameGame({ year: null }, 'Ratchet & Clank is a 2002 platform game.'));
  assert.ok(sameGame({ year: 2016 }, 'A game with no year stated.'));
});

test('candidates tries the plain spellings first and the rare ones later', () => {
  const first = candidates('Legend of Zelda: Link\'s Awakening', 'Nintendo Switch', 2019);
  assert.deepEqual(first, [
    'Legend of Zelda: Link\'s Awakening',
    'The Legend of Zelda: Link\'s Awakening',
    'Legend of Zelda: Link\'s Awakening (video game)',
    'The Legend of Zelda: Link\'s Awakening (video game)',
  ]);
  const later = candidates('Katamari Damacy REROLL', 'Nintendo Switch', 2018, { round: 1 });
  assert.ok(later.includes('Katamari Damacy REROLL (2018 video game)'));
  assert.ok(later.includes('Katamari Damacy Reroll'), 'a shouted word is tried in title case');
});

/* --- The infobox decides whose an unlabelled score is --------------------- */

import { infoboxPlatforms, isFirstPlatform } from '../scripts/lib/scores.mjs';

test('infoboxPlatforms reads the list in release order, whatever the markup', () => {
  assert.deepEqual(infoboxPlatforms(`{{Infobox video game
| title = Doom
| platforms = {{Unbulleted list|[[PlayStation 4]]|[[Windows]]|[[Xbox One]]}}
| released = 2016
}}`), ['PlayStation 4', 'Windows', 'Xbox One']);
  assert.deepEqual(infoboxPlatforms(`{{Infobox video game
| platforms = [[Windows]], [[Xbox (console)|Xbox]], [[OS X]]
}}`), ['Windows', 'Xbox', 'OS X']);
  assert.deepEqual(infoboxPlatforms(`{{Infobox video game
| platforms = {{collapsible list|title={{nobold|[[PlayStation 2]]}}|[[Windows]]|[[Xbox (console)|Xbox]]}}
}}`), ['PlayStation 2', 'Windows', 'Xbox']);
  assert.deepEqual(infoboxPlatforms('no infobox'), []);
});

test('isFirstPlatform knows the long names the infobox uses', () => {
  assert.ok(isFirstPlatform('SNES/Super Famicom', ['Super Nintendo Entertainment System']));
  assert.ok(isFirstPlatform('PC', ['Windows', 'Xbox']));
  assert.ok(isFirstPlatform('Microsoft Xbox', ['Xbox', 'Windows']));
  assert.ok(!isFirstPlatform('Microsoft Xbox', ['Xbox 360']));
  assert.ok(!isFirstPlatform('Microsoft Xbox', ['PlayStation 2', 'Windows', 'Xbox']));
});

test('a port never inherits the original\'s unlabelled score, even in the same year', () => {
  const params = reviewTemplate(article('{{Video game reviews\n| MC = 97/100<ref/>\n}}'));
  const platforms = ['PlayStation 2', 'Windows', 'Xbox'];
  assert.equal(metacriticFor(params, 'Sony PlayStation 2', { original: true, platforms }), 97);
  assert.equal(metacriticFor(params, 'Microsoft Xbox', { original: true, platforms }), null,
    'GTA III on Xbox: the 97 is the PS2 score');
});
