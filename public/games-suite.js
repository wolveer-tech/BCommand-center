(() => {
  'use strict';

  const LEVELS = ['easy', 'medium', 'hard'];
  const runtime = { crosswordWrong: {}, strandsBoards: {}, sudokuSelected: '', sudokuWrong: new Set(), tileTimer: null };

  const CONNECTIONS = {
    easy: [
      { title: 'Fruit', words: ['APPLE', 'PEAR', 'MANGO', 'PLUM'] },
      { title: 'Weather', words: ['RAIN', 'WIND', 'SNOW', 'HAIL'] },
      { title: 'At a desk', words: ['PEN', 'RULER', 'PAPER', 'STAPLER'] },
      { title: 'Can follow “sun”', words: ['LIGHT', 'RISE', 'FLOWER', 'SCREEN'] }
    ],
    medium: [
      { title: 'Move quietly', words: ['CREEP', 'SNEAK', 'TIPTOE', 'SLINK'] },
      { title: 'Parts of a book', words: ['SPINE', 'COVER', 'INDEX', 'CHAPTER'] },
      { title: '___ board', words: ['DASH', 'SURF', 'SCORE', 'KEY'] },
      { title: 'Words hidden after a letter', words: ['BEE', 'SEA', 'TEA', 'WHY'] }
    ],
    hard: [
      { title: 'Things with a pitch', words: ['ROOF', 'SONG', 'SALES', 'TENT'] },
      { title: 'Palindromes', words: ['LEVEL', 'ROTOR', 'CIVIC', 'KAYAK'] },
      { title: 'Begin with silent letters', words: ['GNOME', 'KNIFE', 'PSALM', 'WRIST'] },
      { title: 'Change one letter in “COLD”', words: ['CORD', 'GOLD', 'COLT', 'FOLD'] }
    ]
  };

  const WORDLE_LEVELS = {
    easy: ['HOUSE', 'LIGHT', 'WATER', 'PLANT', 'SMILE', 'TRAIN', 'MUSIC', 'BEACH'],
    medium: ['CRANE', 'CHARM', 'FRESH', 'STONE', 'TRUST', 'GUIDE', 'CROWN', 'QUIET'],
    hard: ['GLYPH', 'NYMPH', 'VIXEN', 'QUILL', 'JAZZY', 'FJORD', 'WALTZ', 'BAYOU']
  };

  const TRIVIA_LEVELS = {
    easy: [
      { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Mars', 'Jupiter', 'Mercury'], c: 1 },
      { q: 'How many days are in a leap year?', a: ['364', '365', '366', '367'], c: 2 },
      { q: 'Which ocean is the largest?', a: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], c: 3 }
    ],
    medium: [
      { q: 'What does the “P” in GDP stand for?', a: ['Price', 'Product', 'Profit', 'Production'], c: 1 },
      { q: 'Which element has the symbol Fe?', a: ['Iron', 'Fluorine', 'Francium', 'Fermium'], c: 0 },
      { q: 'Who wrote The Picture of Dorian Gray?', a: ['Oscar Wilde', 'Charles Dickens', 'George Eliot', 'Thomas Hardy'], c: 0 }
    ],
    hard: [
      { q: 'Which treaty formally ended the Thirty Years’ War?', a: ['Utrecht', 'Versailles', 'Westphalia', 'Tordesillas'], c: 2 },
      { q: 'What is the SI unit of catalytic activity?', a: ['Katal', 'Weber', 'Tesla', 'Siemens'], c: 0 },
      { q: 'Which moon has a dense nitrogen-rich atmosphere?', a: ['Europa', 'Titan', 'Phobos', 'Io'], c: 1 }
    ]
  };

  const MINI_SQUARES = {
    easy: {
      words: ['BALL', 'AREA', 'LEAD', 'LADY'],
      across: ['Round toy', 'Region or space', 'Be in front', 'Polite term for a woman'],
      down: ['Formal dance', 'Surface measurement', 'Heavy metal', 'A noblewoman']
    },
    medium: {
      words: ['SAGE', 'AREA', 'GEAR', 'EARS'],
      across: ['Wise person', 'Extent of a surface', 'Equipment', 'They help you hear'],
      down: ['Aromatic herb', 'Field of study', 'To prepare for action', 'Handles on a jug']
    },
    hard: {
      words: ['TAPE', 'ABID', 'PIPE', 'EDEN'],
      across: ['Recording medium', 'Tolerate, in a phrase', 'Conduit', 'Biblical garden'],
      down: ['Sticky strip', 'Dwell, poetically', 'Smoking implement', 'Paradise']
    }
  };

  const CROSSWORDS = {
    easy: {
      across: { answer: 'PLANET', clue: 'World orbiting a star' },
      down: [
        { answer: 'APPLE', clue: 'Fruit linked with teachers' },
        { answer: 'CRANE', clue: 'Tall lifting machine' },
        { answer: 'SHEEP', clue: 'Woolly farm animal' }
      ]
    },
    medium: {
      across: { answer: 'STREAM', clue: 'Small flowing body of water' },
      down: [
        { answer: 'ASSET', clue: 'Something of value' },
        { answer: 'THREE', clue: 'Number of sides on a triangle' },
        { answer: 'STAMP', clue: 'Postage purchase' }
      ]
    },
    hard: {
      across: { answer: 'BRIDGE', clue: 'Connection over an obstacle' },
      down: [
        { answer: 'ROBIN', clue: 'Red-breasted songbird' },
        { answer: 'SHIRT', clue: 'Collared garment' },
        { answer: 'EAGER', clue: 'Full of anticipation' }
      ]
    }
  };

  const BEE_PUZZLES = {
    easy: { center: 'A', outer: ['C', 'T', 'E', 'R', 'S', 'P'], answers: ['carpet', 'cater', 'crate', 'react', 'trace', 'spare', 'parse', 'taper', 'stare', 'taste', 'asset', 'pasta', 'paper', 'appear', 'separate'] },
    medium: { center: 'O', outer: ['C', 'L', 'U', 'D', 'R', 'F'], answers: ['color', 'floor', 'cloud', 'could', 'odour', 'food', 'cool', 'colour', 'flood', 'door'] },
    hard: { center: 'I', outer: ['S', 'T', 'R', 'A', 'N', 'G'], answers: ['staring', 'training', 'strain', 'stain', 'train', 'giant', 'grain', 'rising', 'sitting', 'rating', 'string', 'artisan'] }
  };

  const STRANDS = {
    easy: { theme: 'Things in the sky', size: 6, words: ['SUN', 'MOON', 'STAR', 'CLOUD'] },
    medium: { theme: 'On a breakfast table', size: 7, words: ['TOAST', 'CEREAL', 'COFFEE', 'BUTTER', 'SPOON'] },
    hard: { theme: 'Words associated with theatre', size: 8, words: ['CURTAIN', 'ACTOR', 'SCRIPT', 'STAGE', 'ORCHESTRA', 'MATINEE'] }
  };

  const LETTER_BOX = {
    sides: [['C', 'E', 'W'], ['R', 'L', 'I'], ['A', 'B', 'T'], ['N', 'O', 'S']],
    answers: ['CRANE', 'ELBOW', 'WITS', 'CROWN', 'BRAIN', 'STAIR', 'ROBE', 'EARN', 'NEAR', 'RATE', 'TOWER', 'WEAR', 'SORE', 'EAST', 'TIRE', 'RAIN'],
    solution: ['CRANE', 'ELBOW', 'WITS']
  };

  function suite() {
    const entertainment = state.entertainment || (state.entertainment = {});
    const current = entertainment.gameSuite && typeof entertainment.gameSuite === 'object' ? entertainment.gameSuite : {};
    current.difficulty = LEVELS.includes(current.difficulty) ? current.difficulty : 'medium';
    current.seed = Number.isFinite(Number(current.seed)) ? Number(current.seed) : 0;
    entertainment.gameSuite = current;
    return current;
  }

  function saveSuite() {
    saveState();
  }

  function hashSeed(value) {
    let h = 2166136261;
    for (const ch of String(value)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rngFor(salt = '') {
    let a = hashSeed(`${suite().difficulty}:${suite().seed}:${salt}`);
    return () => {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, salt = '') {
    const out = items.slice();
    const random = rngFor(salt);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function puzzleId(name) {
    return `${name}:${suite().difficulty}:${suite().seed}`;
  }

  function setSuiteStatus(message) {
    const el = document.querySelector('#gamesSuiteStatus');
    if (el) el.textContent = message;
  }

  function suiteWordleAnswer() {
    const pool = WORDLE_LEVELS[suite().difficulty];
    return pool[suite().seed % pool.length];
  }

  function suiteTriviaQuestion() {
    const pool = TRIVIA_LEVELS[suite().difficulty];
    return pool[suite().seed % pool.length];
  }

  function connectionsState() {
    const s = suite();
    if (!s.connections || s.connections.id !== puzzleId('connections')) {
      s.connections = {
        id: puzzleId('connections'),
        words: shuffle(CONNECTIONS[s.difficulty].flatMap(group => group.words), 'connections'),
        selected: [],
        found: [],
        mistakes: 0
      };
      saveSuite();
    }
    return s.connections;
  }

  function renderConnections() {
    const el = document.querySelector('#connectionsGame');
    if (!el) return;
    const s = connectionsState();
    const groups = CONNECTIONS[suite().difficulty];
    const mistakeLimit = { easy: 5, medium: 4, hard: 3 }[suite().difficulty];
    const solved = s.found.map(index => {
      const group = groups[index];
      return `<div class="connection-group level-${index}"><strong>${group.title}</strong><span>${group.words.join(', ')}</span></div>`;
    }).join('');
    const remaining = s.words.filter(word => !s.found.some(index => groups[index].words.includes(word)));
    const finished = s.found.length === groups.length;
    const lost = s.mistakes >= mistakeLimit && !finished;
    el.innerHTML = `${solved}<div class="connections-grid">${remaining.map(word => `<button class="connection-tile${s.selected.includes(word) ? ' selected' : ''}" data-connection-word="${word}" ${finished || lost ? 'disabled' : ''}>${word}</button>`).join('')}</div>
      <div class="puzzle-actions"><button class="btn primary" data-suite-action="connections-submit" ${s.selected.length !== 4 || finished || lost ? 'disabled' : ''}>Submit group</button><span class="sub">Mistakes ${s.mistakes}/${mistakeLimit}</span></div>
      <div class="puzzle-note ${finished ? 'win' : lost ? 'over' : ''}">${finished ? 'All four connections found.' : lost ? 'No guesses left — start a new puzzle to try again.' : 'Select exactly four linked words.'}</div>`;
  }

  function toggleConnection(word) {
    const s = connectionsState();
    if (s.selected.includes(word)) s.selected = s.selected.filter(item => item !== word);
    else if (s.selected.length < 4) s.selected.push(word);
    renderConnections();
  }

  function submitConnection() {
    const s = connectionsState();
    if (s.selected.length !== 4) return;
    const groups = CONNECTIONS[suite().difficulty];
    const index = groups.findIndex(group => group.words.every(word => s.selected.includes(word)));
    if (index >= 0 && !s.found.includes(index)) s.found.push(index);
    else s.mistakes += 1;
    s.selected = [];
    saveSuite();
    renderConnections();
  }

  function crosswordPuzzle(kind) {
    const level = suite().difficulty;
    if (kind === 'mini') {
      const data = MINI_SQUARES[level];
      const entries = [];
      data.words.forEach((answer, index) => {
        entries.push({ number: index + 1, direction: 'Across', answer, clue: data.across[index], row: index, col: 0, dr: 0, dc: 1 });
        entries.push({ number: index + 1, direction: 'Down', answer, clue: data.down[index], row: 0, col: index, dr: 1, dc: 0 });
      });
      return { size: 4, entries };
    }
    const data = CROSSWORDS[level];
    return {
      size: 6,
      entries: [
        { number: 1, direction: 'Across', answer: data.across.answer, clue: data.across.clue, row: 2, col: 0, dr: 0, dc: 1 },
        ...data.down.map((entry, index) => ({ number: index + 1, direction: 'Down', answer: entry.answer, clue: entry.clue, row: 0, col: index * 2, dr: 1, dc: 0 }))
      ]
    };
  }

  function crosswordCells(puzzle) {
    const cells = new Map();
    for (const entry of puzzle.entries) {
      [...entry.answer].forEach((letter, index) => {
        const row = entry.row + entry.dr * index;
        const col = entry.col + entry.dc * index;
        const key = `${row},${col}`;
        const existing = cells.get(key);
        if (existing && existing.letter !== letter) throw new Error(`Crossword conflict at ${key}`);
        cells.set(key, { letter, number: existing?.number || (index === 0 ? entry.number : '') });
      });
    }
    return cells;
  }

  function crosswordState(kind) {
    const key = `${kind}Crossword`;
    const s = suite();
    if (!s[key] || s[key].id !== puzzleId(key)) {
      s[key] = { id: puzzleId(key), values: {} };
      saveSuite();
    }
    return s[key];
  }

  function renderCrossword(kind) {
    const target = kind === 'mini' ? '#miniCrosswordGame' : '#crosswordGame';
    const el = document.querySelector(target);
    if (!el) return;
    const puzzle = crosswordPuzzle(kind);
    const cells = crosswordCells(puzzle);
    const s = crosswordState(kind);
    const easy = suite().difficulty === 'easy';
    const wrong = runtime.crosswordWrong[kind] || new Set();
    const squares = [];
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const key = `${row},${col}`;
        const cell = cells.get(key);
        if (!cell) {
          squares.push('<div class="crossword-block" aria-hidden="true"></div>');
          continue;
        }
        const prefilled = easy && hashSeed(`${puzzleId(kind)}:${key}`) % 5 === 0;
        const value = prefilled ? cell.letter : (s.values[key] || '');
        const cls = wrong.has(key) ? ' wrong' : value && value === cell.letter ? ' correct' : '';
        squares.push(`<label class="crossword-cell${prefilled ? ' prefilled' : ''}${cls}">${cell.number ? `<span class="crossword-number">${cell.number}</span>` : ''}<input aria-label="${kind} crossword row ${row + 1} column ${col + 1}" data-cross-kind="${kind}" data-cross-key="${key}" maxlength="1" value="${value}" ${prefilled ? 'readonly' : ''}></label>`);
      }
    }
    const clues = ['Across', 'Down'].map(direction => `<div><h4>${direction}</h4><ol>${puzzle.entries.filter(entry => entry.direction === direction).map(entry => `<li value="${entry.number}">${entry.clue}</li>`).join('')}</ol></div>`).join('');
    const complete = [...cells].every(([key, cell]) => (s.values[key] || (easy && hashSeed(`${puzzleId(kind)}:${key}`) % 5 === 0 ? cell.letter : '')) === cell.letter);
    el.innerHTML = `<div class="crossword-layout"><div class="crossword-grid" style="grid-template-columns:repeat(${puzzle.size},1fr)">${squares.join('')}</div><div class="crossword-clues">${clues}</div></div><div class="puzzle-note${complete ? ' win' : ''}">${complete ? 'Crossword complete.' : 'Tap a square and type one letter.'}</div>`;
  }

  function updateCrossword(input) {
    const kind = input.dataset.crossKind;
    const key = input.dataset.crossKey;
    const value = String(input.value || '').replace(/[^A-Za-z]/g, '').slice(-1).toUpperCase();
    input.value = value;
    crosswordState(kind).values[key] = value;
    runtime.crosswordWrong[kind] = new Set();
    saveSuite();
  }

  function checkCrossword(kind) {
    const puzzle = crosswordPuzzle(kind);
    const cells = crosswordCells(puzzle);
    const s = crosswordState(kind);
    const wrong = new Set();
    for (const [key, cell] of cells) if ((s.values[key] || '').toUpperCase() && (s.values[key] || '').toUpperCase() !== cell.letter) wrong.add(key);
    runtime.crosswordWrong[kind] = wrong;
    renderCrossword(kind);
  }

  function beeState() {
    const s = suite();
    if (!s.bee || s.bee.id !== puzzleId('bee')) {
      s.bee = { id: puzzleId('bee'), found: [], current: '' };
      saveSuite();
    }
    return s.bee;
  }

  function renderBee(message = '') {
    const el = document.querySelector('#spellingBeeGame');
    if (!el) return;
    const puzzle = BEE_PUZZLES[suite().difficulty];
    const s = beeState();
    const score = s.found.reduce((total, word) => total + Math.max(1, word.length - 3), 0);
    el.innerHTML = `<div class="bee-hive">${puzzle.outer.map((letter, index) => `<button class="bee-letter" data-bee-letter="${letter}" data-pos="${index}">${letter}</button>`).join('')}<button class="bee-letter center" data-bee-letter="${puzzle.center}">${puzzle.center}</button></div>
      <input class="puzzle-input" id="beeInput" autocomplete="off" spellcheck="false" aria-label="Spelling Bee word" value="${s.current}" placeholder="Type a word…">
      <div class="puzzle-actions"><button class="btn" data-suite-action="bee-delete">Delete</button><button class="btn primary" data-suite-action="bee-submit">Enter</button><span class="sub">Score ${score}</span></div>
      <div class="puzzle-note">${message || `Use only these letters and include ${puzzle.center}. Minimum four letters.`}</div>
      <div class="bee-found">${s.found.map(word => `<span class="bee-word">${word.toUpperCase()}</span>`).join('')}</div>`;
  }

  function submitBee() {
    const puzzle = BEE_PUZZLES[suite().difficulty];
    const s = beeState();
    const word = String(s.current || '').toLowerCase();
    let message = '';
    if (word.length < 4) message = 'Words need at least four letters.';
    else if (!word.includes(puzzle.center.toLowerCase())) message = `Every word must use ${puzzle.center}.`;
    else if (!puzzle.answers.includes(word)) message = 'That word is not in this puzzle’s word list.';
    else if (s.found.includes(word)) message = 'Already found.';
    else {
      s.found.push(word);
      message = word.length >= 7 ? 'Excellent long word!' : 'Nice find.';
    }
    s.current = '';
    saveSuite();
    renderBee(message);
  }

  function buildStrandsBoard() {
    const puzzle = STRANDS[suite().difficulty];
    const key = puzzleId('strands');
    if (runtime.strandsBoards[key]) return runtime.strandsBoards[key];
    const random = rngFor('strands');
    const grid = Array.from({ length: puzzle.size }, () => Array(puzzle.size).fill(''));
    const placements = {};
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
    for (const word of puzzle.words) {
      let placed = false;
      for (let attempt = 0; attempt < 400 && !placed; attempt++) {
        const [dr, dc] = directions[Math.floor(random() * directions.length)];
        const row = Math.floor(random() * puzzle.size);
        const col = Math.floor(random() * puzzle.size);
        const endRow = row + dr * (word.length - 1);
        const endCol = col + dc * (word.length - 1);
        if (endRow < 0 || endCol < 0 || endRow >= puzzle.size || endCol >= puzzle.size) continue;
        const cells = [...word].map((letter, index) => ({ row: row + dr * index, col: col + dc * index, letter }));
        if (cells.some(cell => grid[cell.row][cell.col] && grid[cell.row][cell.col] !== cell.letter)) continue;
        cells.forEach(cell => { grid[cell.row][cell.col] = cell.letter; });
        placements[word] = cells.map(cell => `${cell.row},${cell.col}`);
        placed = true;
      }
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let row = 0; row < puzzle.size; row++) for (let col = 0; col < puzzle.size; col++) if (!grid[row][col]) grid[row][col] = alphabet[Math.floor(random() * alphabet.length)];
    return runtime.strandsBoards[key] = { grid, placements };
  }

  function strandsState() {
    const s = suite();
    if (!s.strands || s.strands.id !== puzzleId('strands')) {
      s.strands = { id: puzzleId('strands'), found: [], selected: [] };
      saveSuite();
    }
    return s.strands;
  }

  function renderStrands(message = '') {
    const el = document.querySelector('#strandsGame');
    if (!el) return;
    const puzzle = STRANDS[suite().difficulty];
    const board = buildStrandsBoard();
    const s = strandsState();
    const foundCells = new Set(s.found.flatMap(word => board.placements[word] || []));
    el.innerHTML = `<div class="puzzle-note"><strong>Theme: ${puzzle.theme}</strong></div><div class="strands-board" style="grid-template-columns:repeat(${puzzle.size},1fr)">${board.grid.flatMap((row, r) => row.map((letter, c) => {
      const key = `${r},${c}`;
      return `<button class="strands-cell${s.selected.includes(key) ? ' selected' : ''}${foundCells.has(key) ? ' found' : ''}" data-strands-cell="${key}">${letter}</button>`;
    })).join('')}</div><div class="strands-words">${puzzle.words.map(word => `<span class="strands-word${s.found.includes(word) ? ' found' : ''}">${word.length} letters</span>`).join('')}</div><div class="puzzle-note${s.found.length === puzzle.words.length ? ' win' : ''}">${message || (s.found.length === puzzle.words.length ? 'Theme complete.' : 'Tap adjacent letters to trace a themed word.')}</div>`;
  }

  function selectStrandsCell(key) {
    const s = strandsState();
    const [row, col] = key.split(',').map(Number);
    const last = s.selected[s.selected.length - 1];
    if (last) {
      const [lastRow, lastCol] = last.split(',').map(Number);
      if (Math.max(Math.abs(row - lastRow), Math.abs(col - lastCol)) > 1 || s.selected.includes(key)) {
        renderStrands('Choose a new neighbouring letter.');
        return;
      }
    }
    s.selected.push(key);
    const board = buildStrandsBoard();
    const text = s.selected.map(cell => {
      const [r, c] = cell.split(',').map(Number);
      return board.grid[r][c];
    }).join('');
    const puzzle = STRANDS[suite().difficulty];
    const match = puzzle.words.find(word => !s.found.includes(word) && (word === text || [...word].reverse().join('') === text));
    if (match) {
      s.found.push(match);
      s.selected = [];
      saveSuite();
      renderStrands(`Found ${match}.`);
      return;
    }
    saveSuite();
    renderStrands();
  }

  function tilesState() {
    const s = suite();
    const pairCount = { easy: 4, medium: 6, hard: 8 }[s.difficulty];
    if (!s.tiles || s.tiles.id !== puzzleId('tiles')) {
      const ids = Array.from({ length: pairCount }, (_, index) => index);
      s.tiles = { id: puzzleId('tiles'), order: shuffle([...ids, ...ids], 'tiles'), open: [], matched: [], moves: 0 };
      saveSuite();
    }
    return s.tiles;
  }

  function tileStyle(pair) {
    const colors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#f97316'];
    return `--tile-color:${colors[pair % colors.length]};--tile-angle:${pair * 23}deg`;
  }

  function renderTiles() {
    const el = document.querySelector('#tilesGame');
    if (!el) return;
    const s = tilesState();
    el.innerHTML = `<div class="tiles-board">${s.order.map((pair, index) => `<button aria-label="Pattern tile ${index + 1}" class="pattern-tile${s.open.includes(index) ? ' open' : ''}${s.matched.includes(pair) ? ' matched' : ''}" style="${tileStyle(pair)}" data-tile-index="${index}"></button>`).join('')}</div><div class="puzzle-note${s.matched.length * 2 === s.order.length ? ' win' : ''}">${s.matched.length * 2 === s.order.length ? `All pairs matched in ${s.moves} moves.` : `${s.moves} moves • ${s.matched.length} pairs matched`}</div>`;
  }

  function selectTile(index) {
    const s = tilesState();
    if (s.open.length >= 2 || s.open.includes(index) || s.matched.includes(s.order[index])) return;
    s.open.push(index);
    if (s.open.length === 2) {
      s.moves += 1;
      const [a, b] = s.open;
      if (s.order[a] === s.order[b]) {
        s.matched.push(s.order[a]);
        s.open = [];
        saveSuite();
        renderTiles();
      } else {
        saveSuite();
        renderTiles();
        clearTimeout(runtime.tileTimer);
        runtime.tileTimer = setTimeout(() => { s.open = []; saveSuite(); renderTiles(); }, 650);
      }
    } else {
      saveSuite();
      renderTiles();
    }
  }

  function sudokuSolution() {
    return Array.from({ length: 81 }, (_, index) => {
      const row = Math.floor(index / 9);
      const col = index % 9;
      return (row * 3 + Math.floor(row / 3) + col) % 9 + 1;
    });
  }

  function sudokuState() {
    const s = suite();
    if (!s.sudoku || s.sudoku.id !== puzzleId('sudoku')) {
      const blanks = { easy: 36, medium: 46, hard: 54 }[s.difficulty];
      s.sudoku = { id: puzzleId('sudoku'), blank: shuffle(Array.from({ length: 81 }, (_, index) => index), 'sudoku').slice(0, blanks), values: {} };
      runtime.sudokuSelected = '';
      runtime.sudokuWrong = new Set();
      saveSuite();
    }
    return s.sudoku;
  }

  function renderSudoku(message = '') {
    const el = document.querySelector('#sudokuGame');
    if (!el) return;
    const s = sudokuState();
    const solution = sudokuSolution();
    const blanks = new Set(s.blank);
    const complete = s.blank.every(index => Number(s.values[index]) === solution[index]);
    el.innerHTML = `<div class="sudoku-board">${solution.map((number, index) => {
      const row = Math.floor(index / 9);
      const editable = blanks.has(index);
      const value = editable ? (s.values[index] || '') : number;
      return `<button class="sudoku-cell${editable ? '' : ' fixed'}${runtime.sudokuSelected === String(index) ? ' selected' : ''}${runtime.sudokuWrong.has(index) ? ' wrong' : ''}${row === 2 || row === 5 ? ' box-bottom' : ''}" data-sudoku-cell="${index}" ${editable ? '' : 'disabled'}>${value}</button>`;
    }).join('')}</div><div class="sudoku-numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(number => `<button class="btn" data-sudoku-number="${number}">${number}</button>`).join('')}<button class="btn" data-sudoku-number="0">⌫</button></div><div class="puzzle-note${complete ? ' win' : ''}">${message || (complete ? 'Sudoku complete.' : 'Select an empty square, then choose a number.')}</div>`;
  }

  function setSudokuNumber(number) {
    if (runtime.sudokuSelected === '') return;
    const s = sudokuState();
    s.values[runtime.sudokuSelected] = Number(number) || '';
    runtime.sudokuWrong.delete(Number(runtime.sudokuSelected));
    saveSuite();
    renderSudoku();
  }

  function checkSudoku() {
    const s = sudokuState();
    const solution = sudokuSolution();
    runtime.sudokuWrong = new Set(s.blank.filter(index => s.values[index] && Number(s.values[index]) !== solution[index]));
    renderSudoku(runtime.sudokuWrong.size ? `${runtime.sudokuWrong.size} square${runtime.sudokuWrong.size === 1 ? '' : 's'} need another look.` : 'No mistakes found so far.');
  }

  function letterBoxState() {
    const s = suite();
    if (!s.letterBox || s.letterBox.id !== puzzleId('letterBox')) {
      s.letterBox = { id: puzzleId('letterBox'), words: [], current: '' };
      saveSuite();
    }
    return s.letterBox;
  }

  function letterBoxSides() {
    const offset = suite().seed % LETTER_BOX.sides.length;
    return LETTER_BOX.sides.map((_, index) => LETTER_BOX.sides[(index + offset) % LETTER_BOX.sides.length]);
  }

  function renderLetterBox(message = '') {
    const el = document.querySelector('#letterBoxedGame');
    if (!el) return;
    const s = letterBoxState();
    const sides = letterBoxSides();
    const used = new Set(s.words.join(''));
    const limit = { easy: 8, medium: 6, hard: 4 }[suite().difficulty];
    const allLetters = new Set(sides.flat());
    const won = [...allLetters].every(letter => used.has(letter)) && s.words.length <= limit;
    const sideNames = ['top', 'right', 'bottom', 'left'];
    el.innerHTML = `<div class="letter-box">${sides.map((side, index) => `<div class="letter-side ${sideNames[index]}">${side.map(letter => `<span class="${used.has(letter) ? 'letter-used' : ''}">${letter}</span>`).join('')}</div>`).join('')}</div><div class="boxed-chain">${s.words.map(word => `<span class="boxed-word">${word}</span>`).join('')}</div><input class="puzzle-input" id="letterBoxInput" autocomplete="off" spellcheck="false" value="${s.current}" placeholder="Enter a word…"><div class="puzzle-actions"><button class="btn primary" data-suite-action="letter-submit">Add word</button><span class="sub">Goal: all letters in ${limit} words or fewer</span></div><div class="puzzle-note${won ? ' win' : ''}">${message || (won ? 'Box complete.' : 'Consecutive letters must come from different sides; each word continues the chain.')}</div>`;
  }

  function submitLetterBox() {
    const s = letterBoxState();
    const word = String(s.current || '').toUpperCase();
    const sides = letterBoxSides();
    const map = new Map(sides.flatMap((side, index) => side.map(letter => [letter, index])));
    let message = '';
    if (word.length < 3) message = 'Use at least three letters.';
    else if (![...word].every(letter => map.has(letter))) message = 'Use only letters shown around the box.';
    else if ([...word].some((letter, index) => index && map.get(letter) === map.get(word[index - 1]))) message = 'Switch sides after every letter.';
    else if (s.words.length && s.words[s.words.length - 1].slice(-1) !== word[0]) message = `Start with ${s.words[s.words.length - 1].slice(-1)} to continue the chain.`;
    else if (!LETTER_BOX.answers.includes(word)) message = 'That word is not in this puzzle’s word list.';
    else if (s.words.includes(word)) message = 'Already used.';
    else { s.words.push(word); message = 'Word added.'; }
    s.current = '';
    saveSuite();
    renderLetterBox(message);
  }

  function pipsRules() {
    return {
      easy: [
        { op: 'sum', target: 4 }, { op: 'sum', target: 7 }, { op: 'sum', target: 9 }
      ],
      medium: [
        { op: 'sum', target: 8 }, { op: 'difference', target: 3 }, { op: 'sum', target: 11 }, { op: 'same' }
      ],
      hard: [
        { op: 'product', target: 24 }, { op: 'sum', target: 5 }, { op: 'difference', target: 5 }, { op: 'product', target: 30 }
      ]
    }[suite().difficulty];
  }

  function pipsState() {
    const s = suite();
    if (!s.pips || s.pips.id !== puzzleId('pips')) {
      s.pips = { id: puzzleId('pips'), values: pipsRules().map(() => [0, 0]), checked: false };
      saveSuite();
    }
    return s.pips;
  }

  function pipsPass(rule, values) {
    const [a, b] = values.map(Number);
    if (rule.op === 'sum') return a + b === rule.target;
    if (rule.op === 'difference') return Math.abs(a - b) === rule.target;
    if (rule.op === 'product') return a * b === rule.target;
    return a === b;
  }

  function pipsLabel(rule) {
    if (rule.op === 'sum') return `Sum is ${rule.target}`;
    if (rule.op === 'difference') return `Difference is ${rule.target}`;
    if (rule.op === 'product') return `Product is ${rule.target}`;
    return 'Both halves match';
  }

  function renderPips() {
    const el = document.querySelector('#pipsGame');
    if (!el) return;
    const rules = pipsRules();
    const s = pipsState();
    const option = value => `<option value="${value}">${'●'.repeat(value) || '0'}</option>`;
    const solved = rules.every((rule, index) => pipsPass(rule, s.values[index]));
    el.innerHTML = `<div class="pips-list">${rules.map((rule, index) => `<div class="pips-row${s.checked ? (pipsPass(rule, s.values[index]) ? ' correct' : ' wrong') : ''}"><span class="pip-rule">${pipsLabel(rule)}</span><select aria-label="Domino ${index + 1} left" class="pip-select" data-pips-index="${index}" data-pips-side="0">${[0, 1, 2, 3, 4, 5, 6].map(option).join('')}</select><select aria-label="Domino ${index + 1} right" class="pip-select" data-pips-index="${index}" data-pips-side="1">${[0, 1, 2, 3, 4, 5, 6].map(option).join('')}</select></div>`).join('')}</div><div class="puzzle-note${solved ? ' win' : ''}">${solved ? 'Every domino rule is satisfied.' : 'Choose the pip count for both halves of each domino.'}</div>`;
    el.querySelectorAll('[data-pips-index]').forEach(select => { select.value = String(s.values[Number(select.dataset.pipsIndex)][Number(select.dataset.pipsSide)]); });
  }

  function resetSuite({ announce = true } = {}) {
    const s = suite();
    s.seed += 1;
    for (const key of ['connections', 'miniCrossword', 'crosswordCrossword', 'strands', 'sudoku']) delete s[key];
    const stats = state.entertainment.gameStats;
    stats.wordleGuesses = [];
    stats.wordleCurrent = '';
    stats.wordleFinished = false;
    stats.wordleWon = false;
    stats.wordleDate = '';
    stats.triviaLastDate = '';
    stats.triviaLastCorrect = null;
    stats.triviaLastAnswer = null;
    runtime.crosswordWrong = {};
    runtime.sudokuSelected = '';
    runtime.sudokuWrong = new Set();
    saveSuite();
    new2048();
    renderSuiteGames();
    if (announce) setSuiteStatus(`Fresh ${s.difficulty} puzzles loaded.`);
  }

  function changeDifficulty(value) {
    if (!LEVELS.includes(value) || value === suite().difficulty) return;
    suite().difficulty = value;
    resetSuite({ announce: false });
    setSuiteStatus(`${value[0].toUpperCase()}${value.slice(1)} mode selected. Fresh puzzles loaded.`);
  }

  function renderSuiteGames() {
    const select = document.querySelector('#gamesDifficulty');
    if (select) select.value = suite().difficulty;
    if (!game2048State.grid.some(Boolean)) new2048(); else render2048();
    renderTrivia();
    renderWordle();
    renderConnections();
    renderCrossword('mini');
    renderCrossword('crossword');
    renderStrands();
    renderSudoku();
    bindSuiteControls();
  }

  function bindSuiteControls() {
    const panel = document.querySelector('.ent-panel[data-ent-panel="games"]');
    if (!panel || panel.dataset.suiteBound === '1') return;
    panel.dataset.suiteBound = '1';
    panel.addEventListener('click', event => {
      const word = event.target.closest('[data-connection-word]');
      if (word) { toggleConnection(word.dataset.connectionWord); return; }
      const beeLetter = event.target.closest('[data-bee-letter]');
      if (beeLetter) { const s = beeState(); s.current += beeLetter.dataset.beeLetter; saveSuite(); renderBee(); return; }
      const strandsCell = event.target.closest('[data-strands-cell]');
      if (strandsCell) { selectStrandsCell(strandsCell.dataset.strandsCell); return; }
      const tile = event.target.closest('[data-tile-index]');
      if (tile) { selectTile(Number(tile.dataset.tileIndex)); return; }
      const sudokuCell = event.target.closest('[data-sudoku-cell]');
      if (sudokuCell) { runtime.sudokuSelected = sudokuCell.dataset.sudokuCell; renderSudoku(); return; }
      const sudokuNumber = event.target.closest('[data-sudoku-number]');
      if (sudokuNumber) { setSudokuNumber(Number(sudokuNumber.dataset.sudokuNumber)); return; }
      const action = event.target.closest('[data-suite-action]')?.dataset.suiteAction;
      if (!action) return;
      if (action === 'connections-submit') submitConnection();
      else if (action === 'connections-shuffle') { connectionsState().words = shuffle(connectionsState().words, `connections:${Date.now()}`); saveSuite(); renderConnections(); }
      else if (action === 'mini-check') checkCrossword('mini');
      else if (action === 'crossword-check') checkCrossword('crossword');
      else if (action === 'bee-submit') submitBee();
      else if (action === 'bee-delete') { const s = beeState(); s.current = s.current.slice(0, -1); saveSuite(); renderBee(); }
      else if (action === 'strands-clear') { strandsState().selected = []; saveSuite(); renderStrands(); }
      else if (action === 'sudoku-check') checkSudoku();
      else if (action === 'letter-submit') submitLetterBox();
      else if (action === 'pips-check') { pipsState().checked = true; saveSuite(); renderPips(); }
    });
    panel.addEventListener('input', event => {
      if (event.target.matches('[data-cross-key]')) updateCrossword(event.target);
      else if (event.target.id === 'beeInput') { beeState().current = event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase(); saveSuite(); }
      else if (event.target.id === 'letterBoxInput') { letterBoxState().current = event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase(); saveSuite(); }
    });
    panel.addEventListener('change', event => {
      if (event.target.id === 'gamesDifficulty') changeDifficulty(event.target.value);
      else if (event.target.matches('[data-pips-index]')) {
        const s = pipsState();
        s.values[Number(event.target.dataset.pipsIndex)][Number(event.target.dataset.pipsSide)] = Number(event.target.value);
        s.checked = false;
        saveSuite();
      }
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      if (event.target.id === 'beeInput') { event.preventDefault(); submitBee(); }
      else if (event.target.id === 'letterBoxInput') { event.preventDefault(); submitLetterBox(); }
    });
    document.querySelector('#refreshAllGames')?.addEventListener('click', () => resetSuite());
  }

  wordleAnswer = suiteWordleAnswer;
  dailyTrivia = suiteTriviaQuestion;
  renderEntertainmentGames = renderSuiteGames;
  window.renderEntertainmentGames = renderSuiteGames;
  window.refreshGameSuite = resetSuite;

  if (document.querySelector('.ent-panel[data-ent-panel="games"]')?.classList.contains('active')) renderSuiteGames();
})();
