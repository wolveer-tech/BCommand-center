import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/games-content.js', 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const content = context.window.CommandCentreGameContent;

test('expanded content banks provide substantial variety at every difficulty', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    assert.ok(content.WORDLE_LEVELS[level].length >= 365, `${level} Wordle bank is too small`);
    assert.ok(content.TRIVIA_LEVELS[level].length >= 365, `${level} trivia bank is too small`);
    assert.ok(content.CONNECTION_BOARDS[level].length >= 8, `${level} Connections bank is too small`);
    assert.ok(content.MINI_CROSSWORDS[level].length >= 8, `${level} Mini Crossword bank is too small`);
    assert.ok(content.CROSSWORDS[level].length >= 8, `${level} Crossword bank is too small`);
    assert.ok(content.STRANDS[level].length >= 10, `${level} Strands bank is too small`);
  }
});

test('the first year of daily generated puzzles does not repeat', () => {
  const fingerprint = value => JSON.stringify(value);
  for (const level of ['easy', 'medium', 'hard']) {
    const wordleYear = Array.from({ length: 365 }, (_, seed) => content.WORDLE_LEVELS[level][(seed * 37) % content.WORDLE_LEVELS[level].length]);
    const triviaYear = Array.from({ length: 365 }, (_, seed) => content.TRIVIA_LEVELS[level][(seed * 37) % content.TRIVIA_LEVELS[level].length].q);
    assert.equal(new Set(wordleYear).size, 365, `${level} Wordle repeats within one year`);
    assert.equal(new Set(triviaYear).size, 365, `${level} trivia repeats within one year`);
    const generated = {
      connections: Array.from({ length: 365 }, (_, seed) => content.connectionsFor(level, seed)),
      miniCrossword: Array.from({ length: 365 }, (_, seed) => content.crosswordFor('mini', level, seed)),
      crossword: Array.from({ length: 365 }, (_, seed) => content.crosswordFor('crossword', level, seed)),
      strands: Array.from({ length: 365 }, (_, seed) => content.strandsFor(level, seed))
    };
    for (const [game, puzzles] of Object.entries(generated)) {
      assert.equal(new Set(puzzles.map(fingerprint)).size, 365, `${level} ${game} repeats within one year`);
    }
    for (const board of generated.connections) {
      assert.equal(board.length, 4);
      assert.equal(new Set(board.flatMap(group => group.words)).size, 16, `${level} generated Connections board contains duplicate words`);
    }
  }
});

test('Wordle and Connections entries are valid and unique within each puzzle', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const words = content.WORDLE_LEVELS[level];
    assert.equal(new Set(words).size, words.length);
    assert.ok(words.every(word => /^[A-Z]{5}$/.test(word)));
    for (const board of content.CONNECTION_BOARDS[level]) {
      assert.equal(board.length, 4);
      assert.ok(board.every(group => group.words.length === 4));
      const boardWords = board.flatMap(group => group.words);
      assert.equal(new Set(boardWords).size, 16, `${level} Connections board contains duplicate words`);
    }
  }
});

test('every Mini Crossword and Crossword has valid intersections', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (const puzzle of content.MINI_CROSSWORDS[level]) {
      assert.equal(puzzle.across.answer.length, 4);
      assert.equal(puzzle.down.length, 4);
      puzzle.down.forEach((entry, index) => assert.equal(entry.answer[1], puzzle.across.answer[index], `${level} Mini Crossword crossing ${puzzle.across.answer}/${entry.answer}`));
    }
    for (const puzzle of content.CROSSWORDS[level]) {
      assert.equal(puzzle.across.answer.length, 6);
      assert.equal(puzzle.down.length, 3);
      puzzle.down.forEach((entry, index) => assert.equal(entry.answer[2], puzzle.across.answer[index * 2], `${level} Crossword crossing ${puzzle.across.answer}/${entry.answer}`));
    }
    for (let seed = 0; seed < 365; seed += 1) {
      const mini = content.crosswordFor('mini', level, seed);
      mini.down.forEach((entry, index) => assert.equal(entry.answer[1], mini.across.answer[index], `${level} generated Mini crossing at seed ${seed}`));
      const crossword = content.crosswordFor('crossword', level, seed);
      crossword.down.forEach((entry, index) => assert.equal(entry.answer[2], crossword.across.answer[index * 2], `${level} generated Crossword crossing at seed ${seed}`));
    }
  }
});

test('every Strands word fits its board and every trivia answer index is usable', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (const puzzle of content.STRANDS[level]) {
      assert.ok(puzzle.words.length >= 4);
      assert.ok(puzzle.words.every(word => word.length <= puzzle.size), `${level} Strands word exceeds its board`);
      assert.equal(new Set(puzzle.words).size, puzzle.words.length);
    }
    for (const question of content.TRIVIA_LEVELS[level]) {
      assert.equal(question.a.length, 4);
      assert.equal(new Set(question.a).size, 4);
      assert.ok(Number.isInteger(question.c) && question.c >= 0 && question.c < question.a.length);
    }
    assert.equal(new Set(content.TRIVIA_LEVELS[level].map(question => question.q)).size, content.TRIVIA_LEVELS[level].length);
    for (let seed = 0; seed < 365; seed += 1) {
      const puzzle = content.strandsFor(level, seed);
      assert.ok(puzzle.words.every(word => word.length <= puzzle.size), `${level} generated Strands word exceeds its board at seed ${seed}`);
      assert.equal(new Set(puzzle.words).size, puzzle.words.length);
    }
  }
});

test('Sudoku now permutes digits, bands, stacks, rows and columns', () => {
  const suite = readFileSync('public/games-suite.js', 'utf8');
  for (const marker of ['sudoku-digits', 'sudoku-row-bands', 'sudoku-column-stacks', 'sudoku-rows-', 'sudoku-columns-']) assert.match(suite, new RegExp(marker));
  assert.match(suite, /contentVersion !== GAME_CONTENT\.version/);
});
