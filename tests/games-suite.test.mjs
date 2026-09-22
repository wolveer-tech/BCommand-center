import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('public/index.html', 'utf8');
const script = readFileSync('public/games-suite.js', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const gamesPanel = html.match(/<div class="ent-panel" data-ent-panel="games">([\s\S]*?)<div class="ent-panel" data-ent-panel="community">/)?.[1] || '';

test('Games screen contains the requested eight-game lineup', () => {
  const titles = [...gamesPanel.matchAll(/<h3>[^<]*?([^<]+)<\/h3>/g)].map(match => match[1].trim());
  assert.deepEqual(titles, ['🔢 2048', '🧠 Trivia', '🟩 Wordle', '🟨 Connections', '✏️ Mini Crossword', '📰 Crossword', '🧵 Strands', '🔢 Sudoku']);
  assert.doesNotMatch(gamesPanel, /Snake|Reaction Test|Spelling Bee|Letter Boxed|Pips/);
});

test('Puzzle controls expose difficulty and a full refresh', () => {
  assert.match(gamesPanel, /id="gamesDifficulty"/);
  assert.match(gamesPanel, /value="easy"/);
  assert.match(gamesPanel, /value="medium"/);
  assert.match(gamesPanel, /value="hard"/);
  assert.match(gamesPanel, /id="refreshAllGames"/);
  assert.match(script, /function changeDifficulty/);
  assert.match(script, /function resetSuite/);
});

test('New puzzle suite JavaScript parses and is available offline', () => {
  new vm.Script(script);
  assert.match(serviceWorker, /command-centre-shell-v10\.29\.0-games/);
  assert.match(serviceWorker, /\/games-suite\.css/);
  assert.match(serviceWorker, /\/games-suite\.js/);
});
