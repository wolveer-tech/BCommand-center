(() => {
  'use strict';

  const group = (title, words) => ({ title, words });
  const board = (...groups) => groups;
  const mini = (answer, clue, answers, clues) => ({
    size: 5,
    across: { answer, clue },
    down: answers.map((value, index) => ({ answer: value, clue: clues[index] }))
  });
  const cross = (answer, clue, answers, clues) => ({
    size: 6,
    across: { answer, clue },
    down: answers.map((value, index) => ({ answer: value, clue: clues[index] }))
  });
  const words = value => value.trim().split(/\s+/).filter(Boolean);
  const positive = value => Math.abs(Number(value) || 0);

  const WORDLE_LEVELS = {
    easy: [
      'HOUSE','LIGHT','WATER','PLANT','SMILE','TRAIN','MUSIC','BEACH','APPLE','BREAD',
      'CHAIR','CLOUD','DANCE','DREAM','EARTH','HAPPY','HEART','HORSE','GREEN','LAUGH',
      'MONEY','NIGHT','OCEAN','PARTY','PHONE','RIVER','SOUND','SWEET','TABLE','TIGER',
      'WORLD','YOUNG','BRAVE','CLEAN','DRINK','FRUIT','GRASS','MOUSE','PAPER','QUEEN'
    ],
    medium: [
      'CRANE','CHARM','FRESH','STONE','TRUST','GUIDE','CROWN','QUIET','BLEND','BRISK',
      'CLOVE','DWELL','FLAME','GRAIN','HONEY','IVORY','JOLLY','KNELT','LEMON','MARCH',
      'NOBLE','OPERA','PRIDE','QUEST','ROAST','SHORE','TENSE','UNITY','VALUE','WHIRL',
      'YEARN','ZEBRA','ADOPT','BAKER','CIDER','DEPTH','EAGER','FROST','GIANT','HABIT'
    ],
    hard: [
      'GLYPH','NYMPH','VIXEN','QUILL','JAZZY','FJORD','WALTZ','BAYOU','ABYSS','BLOKE',
      'CYNIC','DWARF','EPOCH','FRAIL','GAWKY','HAIKU','INEPT','JOUST','KHAKI','LURCH',
      'MIDGE','OZONE','PROXY','QUARK','RHYME','SLYLY','THYME','ULCER','VAGUE','WOOZY',
      'XENON','YACHT','ZESTY','BUXOM','COVEN','DITTO','ENVOY','FLASK','GNASH','HOVEL'
    ]
  };

  const WORDLE_EXPANSIONS = {
    easy: words(`
      ABOUT ABOVE ACTOR AFTER AGAIN ALIVE ALONE ANGEL ANGRY BLACK BLOCK BLOOD BOARD BRAIN BROWN BRUSH BUILD CARRY CATCH CHILD
      CLASS CLOCK CLOSE COACH COLOR COULD COURT DAILY DRIVE EARLY EMPTY ENJOY ENTER EVERY FAITH FIELD FIRST FLOOR FLOWER FOCUS
      FORCE FRAME FRONT GLASS GREAT GROUP GUARD GUESS HANDS HEAVY HOTEL HUMAN JUICE LARGE LEARN LEAVE LUNCH MAGIC METAL MODEL
      MOUTH MOVIE NEEDS NEVER NURSE PAINT PEACE PIZZA PLACE POWER RADIO REACH READY RIGHT ROUND SHEEP SHIRT SHORT SMALL SPACE
      SPOON SPORT START STORE STORY SUPER TEACH THANK THERE THING THREE TODAY TOUCH TRUCK UNDER WHITE WOMAN WRITE WRONG YOUTH
      BRING BROTHER CHORE DRESS FAMILY FIGHT FINAL FOUND FRIEND FUNNY GIVEN HOPES LIVES LOCAL LOVED LOVER LUCKY MAYBE MONTH
      MOTHER MOVES NORTH OWNER PIECE POINT PRICE PROUD QUICK QUIET REPLY SCHOOL SEVEN SHARE SLEEP SMOKE SOUTH STAND THESE THROW
    `),
    medium: words(`
      ACORN ADORE ALERT AMBER AMONG ANVIL APRON ARGUE ASSET ATLAS AVOID BADGE BASIC BASIN BLAST BLOOM BONUS CABIN CAMEL CANDY
      CEDAR CHESS CHILL CHOIR CLAIM CLIFF CLOAK CORAL CRAFT DAIRY DECOR DELTA DIARY DIGIT FABLE FERRY FLOOD FLOUR FORGE GHOST
      GLOBE GRACE GRAPE GRAPH HAZEL HINGE IDEAL INDEX JELLY JUDGE KNEEL LABEL LANCE LAYER LODGE MAPLE MERCY MERIT MINER MOTEL
      NINJA OLIVE ONION OUNCE PEACH PEARL PILOT PIVOT PLAZA PRIZE PULSE RANCH REBEL RIDGE ROBIN ROUTE ROYAL SAUCE SCALE SCOUT
      SHADE SHAKE SHELF SHELL SKILL SOLAR SPARK SPELL SPICE SPIKE STACK STAIR STEAM STEEL STORM STRAW SWIFT THORN TOAST TOWER
      TRAIL WHEAT WHEEL ALBUM BLANK BRAID BRAND BRICK BROOK CABLE CHAIN CHEST CLERK CLIMB COAST CRISP DANCE DRIFT ELBOW FENCE
      FEVER FLUTE GRANT HASTE HIKER IMAGE JEWEL LASER LINEN METER NOVEL PASTE PIANO PLANK PORCH REIGN SAINT SHINE SLOPE SMART
    `),
    hard: words(`
      AEONS AMPLY ANODE AORTA APHID BANAL BAWDY BEGET BERYL BLITZ BONGO BORAX BRIAR BROIL BRUTE CAPER CHAFE CHASM CHIRP CHUTE
      CIRCA CLANK CREPT CRYPT DATUM DECOY DIRGE DOGMA DROLL DROSS ECLAT EDIFY EERIE EGRET ELUDE ERODE ETUDE EXPEL FARCE FERAL
      FETID FIEND FILCH FLAIR FLUME FORAY FUDGE GHOUL GLEAN GLOAT GUILE GUSTO HAREM HASTE HEDGE HOARD ICILY INANE JAUNT KAPPA
      KIOSK KNAVE KOALA LAPEL LINGO LOAMY LUCID LUNGE MAMBO MANOR MAUVE MIMIC MOLTEN MURAL NEIGH OPIUM ORBIT OUTDO OVATE
      PANDA PECAN PIQUE PITHY PLUME POLYP POSSE PSYCH PYGMY QUEUE RAZOR RIGID RIVET ROGUE RUDDY SAHIB SCOWL SHARD SINEW SKULK
      SOBER SPAWN STOIC SULLY SWOON TABOO TALON TANGO TEPID TIARA TUNIC USURP VALOR VENOM VIGOR VODKA WACKY WIDOW WRYLY ZONAL
      ABATE ABHOR AFOOT ALOOF AMISS ARDOR BESET BILGE BOUGH CAMEO CHIDE CLOVE CRONE CURIO DAUNT DEIGN EMBER GUISE IMBUE JERKY
      KNELL LEERY LURID MORPH OAKEN PARRY QUASH REALM REBUS SMIRK SNAFU TORSO TROPE VERSO WHELP WREAK ZILCH
    `)
  };

  for (const level of ['easy', 'medium', 'hard']) {
    WORDLE_LEVELS[level] = [...new Set([...WORDLE_LEVELS[level], ...WORDLE_EXPANSIONS[level]])].filter(word => /^[A-Z]{5}$/.test(word));
  }
  const WORDLE_MASTER = [...new Set(Object.values(WORDLE_LEVELS).flat())];
  for (const level of ['easy', 'medium', 'hard']) {
    WORDLE_LEVELS[level] = [...WORDLE_LEVELS[level], ...WORDLE_MASTER.filter(word => !WORDLE_LEVELS[level].includes(word))].slice(0, 365);
  }

  const TRIVIA_LEVELS = {
    easy: [
      { q: 'Which planet is known as the Red Planet?', a: ['Venus','Mars','Jupiter','Mercury'], c: 1 },
      { q: 'How many days are in a leap year?', a: ['364','365','366','367'], c: 2 },
      { q: 'Which ocean is the largest?', a: ['Atlantic','Indian','Arctic','Pacific'], c: 3 },
      { q: 'What is the capital of France?', a: ['Lyon','Paris','Nice','Bordeaux'], c: 1 },
      { q: 'How many continents are there?', a: ['Five','Six','Seven','Eight'], c: 2 },
      { q: 'Which animal is the largest mammal?', a: ['Elephant','Blue whale','Giraffe','Hippopotamus'], c: 1 },
      { q: 'At what temperature does water freeze in Celsius?', a: ['0°C','10°C','32°C','100°C'], c: 0 },
      { q: 'Which shape has three sides?', a: ['Square','Circle','Triangle','Pentagon'], c: 2 },
      { q: 'What is the currency of Japan?', a: ['Won','Yen','Dollar','Rupee'], c: 1 },
      { q: 'Which gas do plants absorb from the air?', a: ['Oxygen','Hydrogen','Carbon dioxide','Helium'], c: 2 },
      { q: 'Which is the first month of the year?', a: ['March','January','June','December'], c: 1 },
      { q: 'Which animal is the tallest on land?', a: ['Camel','Giraffe','Elephant','Horse'], c: 1 },
      { q: 'What is Earth’s natural satellite?', a: ['The Sun','Mars','The Moon','Venus'], c: 2 },
      { q: 'Which instrument commonly has keys and pedals?', a: ['Violin','Flute','Piano','Trumpet'], c: 2 },
      { q: 'Which colour is made by mixing blue and yellow paint?', a: ['Purple','Orange','Green','Brown'], c: 2 }
    ],
    medium: [
      { q: 'What does the “P” in GDP stand for?', a: ['Price','Product','Profit','Production'], c: 1 },
      { q: 'Which element has the symbol Fe?', a: ['Iron','Fluorine','Francium','Fermium'], c: 0 },
      { q: 'Who wrote The Picture of Dorian Gray?', a: ['Oscar Wilde','Charles Dickens','George Eliot','Thomas Hardy'], c: 0 },
      { q: 'What is the capital of Canada?', a: ['Toronto','Vancouver','Ottawa','Montreal'], c: 2 },
      { q: 'What is the largest organ of the human body?', a: ['Liver','Skin','Lung','Heart'], c: 1 },
      { q: 'In which year did humans first land on the Moon?', a: ['1959','1965','1969','1972'], c: 2 },
      { q: 'What is the smallest prime number?', a: ['0','1','2','3'], c: 2 },
      { q: 'What is the official language of Brazil?', a: ['Spanish','Portuguese','French','English'], c: 1 },
      { q: 'Who painted Guernica?', a: ['Dalí','Picasso','Miró','Goya'], c: 1 },
      { q: 'What is the chemical symbol for potassium?', a: ['P','Po','K','Pt'], c: 2 },
      { q: 'Reykjavík is the capital of which country?', a: ['Norway','Finland','Iceland','Estonia'], c: 2 },
      { q: 'Who wrote the novel 1984?', a: ['George Orwell','Aldous Huxley','H. G. Wells','Ray Bradbury'], c: 0 },
      { q: 'What is binary 1010 in decimal?', a: ['8','9','10','12'], c: 2 },
      { q: 'The Ring of Fire surrounds which ocean?', a: ['Atlantic','Pacific','Indian','Arctic'], c: 1 },
      { q: 'Which Shakespeare character is Prince of Denmark?', a: ['Macbeth','Othello','Hamlet','Lear'], c: 2 }
    ],
    hard: [
      { q: 'Which treaty formally ended the Thirty Years’ War?', a: ['Utrecht','Versailles','Westphalia','Tordesillas'], c: 2 },
      { q: 'What is the SI unit of catalytic activity?', a: ['Katal','Weber','Tesla','Siemens'], c: 0 },
      { q: 'Which moon has a dense nitrogen-rich atmosphere?', a: ['Europa','Titan','Phobos','Io'], c: 1 },
      { q: 'Approximately how large is Avogadro’s constant?', a: ['6.022 × 10²³','9.81 × 10²','3.00 × 10⁸','1.602 × 10⁻¹⁹'], c: 0 },
      { q: 'What was the capital of the Byzantine Empire?', a: ['Antioch','Constantinople','Alexandria','Thessalonica'], c: 1 },
      { q: 'Who painted Las Meninas?', a: ['Velázquez','El Greco','Goya','Murillo'], c: 0 },
      { q: 'Which element has atomic number 74?', a: ['Osmium','Tungsten','Rhenium','Iridium'], c: 1 },
      { q: 'Who composed The Rite of Spring?', a: ['Ravel','Debussy','Stravinsky','Prokofiev'], c: 2 },
      { q: 'Which battle took place in England in 1066?', a: ['Agincourt','Bosworth','Hastings','Towton'], c: 2 },
      { q: 'What is the smallest bone in the human body?', a: ['Stapes','Patella','Ulna','Malleus'], c: 0 },
      { q: 'On which planet is a day longer than its year?', a: ['Mars','Mercury','Venus','Neptune'], c: 2 },
      { q: 'Which European language is generally considered a language isolate?', a: ['Basque','Catalan','Welsh','Albanian'], c: 0 },
      { q: 'Who designed the Analytical Engine?', a: ['Alan Turing','Charles Babbage','Konrad Zuse','John von Neumann'], c: 1 },
      { q: 'What is the deepest known ocean trench?', a: ['Java Trench','Tonga Trench','Mariana Trench','Puerto Rico Trench'], c: 2 },
      { q: 'Which treaty created the European Union?', a: ['Lisbon','Rome','Maastricht','Schengen'], c: 2 }
    ]
  };

  function numberQuestion(q, answer, spread = 1) {
    const correct = Number(answer);
    const values = [correct, correct + spread, correct - spread, correct + spread * 2];
    const rotation = positive(correct * 7 + q.length) % values.length;
    const rotated = values.slice(rotation).concat(values.slice(0, rotation));
    return { q, a: rotated.map(String), c: rotated.indexOf(correct) };
  }

  function generatedTrivia(level) {
    const out = [];
    for (let index = 0; index < 90; index += 1) {
      if (level === 'easy') {
        const addA = 11 + index;
        const addB = 3 + index % 17;
        out.push(numberQuestion(`What is ${addA} + ${addB}?`, addA + addB));
        const subtractA = 120 + index;
        const subtractB = 5 + index % 23;
        out.push(numberQuestion(`What is ${subtractA} − ${subtractB}?`, subtractA - subtractB));
        const factorA = 2 + index % 11;
        const factorB = 2 + Math.floor(index / 11);
        out.push(numberQuestion(`What is ${factorA} × ${factorB}?`, factorA * factorB, factorA));
        const divisor = 2 + index % 12;
        const quotient = 3 + Math.floor(index / 12);
        out.push(numberQuestion(`What is ${divisor * quotient} ÷ ${divisor}?`, quotient));
      } else if (level === 'medium') {
        const square = 11 + index;
        out.push(numberQuestion(`What is ${square} squared?`, square * square, square));
        const percentBase = 110 + index * 10;
        out.push(numberQuestion(`What is 10% of ${percentBase}?`, percentBase / 10, 10));
        const averageA = 20 + index;
        const averageB = averageA + 4 + (index % 8) * 2;
        out.push(numberQuestion(`What is the mean of ${averageA} and ${averageB}?`, (averageA + averageB) / 2, 2));
        const multiplier = 3 + index % 9;
        const offset = 2 + Math.floor(index / 9);
        out.push(numberQuestion(`If ${multiplier}x = ${multiplier * offset}, what is x?`, offset));
      } else {
        const square = 31 + index;
        out.push(numberQuestion(`What is ${square}²?`, square * square, square));
        const factorA = 17 + index;
        const factorB = 7 + index % 13;
        const deduction = 3 + index % 9;
        out.push(numberQuestion(`What is (${factorA} × ${factorB}) − ${deduction}?`, factorA * factorB - deduction, factorB));
        const coefficient = 5 + index % 8;
        const solution = 7 + Math.floor(index / 8);
        const constant = 4 + index % 11;
        out.push(numberQuestion(`Solve ${coefficient}x + ${constant} = ${coefficient * solution + constant}.`, solution));
        const divisor = 7 + index % 12;
        const dividend = 200 + index * 7;
        out.push(numberQuestion(`What is the remainder when ${dividend} is divided by ${divisor}?`, dividend % divisor));
      }
    }
    return out;
  }

  for (const level of ['easy', 'medium', 'hard']) {
    const original = TRIVIA_LEVELS[level];
    const generated = generatedTrivia(level);
    TRIVIA_LEVELS[level] = Array.from({ length: original.length + generated.length }, (_, index) =>
      index % 6 === 0 && original.length ? original.shift() : generated.shift()
    ).filter(Boolean).concat(original, generated);
  }

  const CONNECTION_BOARDS = {
    easy: [
      board(group('Fruit',['APPLE','PEAR','MANGO','PLUM']),group('Weather',['RAIN','WIND','SNOW','HAIL']),group('At a desk',['PEN','RULER','PAPER','STAPLER']),group('Can follow “sun”',['LIGHT','RISE','FLOWER','SCREEN'])),
      board(group('Colours',['RED','BLUE','GREEN','YELLOW']),group('Shapes',['CIRCLE','SQUARE','OVAL','TRIANGLE']),group('Pets',['CAT','DOG','RABBIT','HAMSTER']),group('Kitchen items',['PAN','POT','WHISK','LADLE'])),
      board(group('Farm animals',['COW','SHEEP','PIG','GOAT']),group('Transport',['BUS','TRAIN','PLANE','BOAT']),group('Instruments',['DRUM','PIANO','FLUTE','VIOLIN']),group('Rooms',['KITCHEN','BEDROOM','BATHROOM','GARAGE'])),
      board(group('Body parts',['HAND','FOOT','KNEE','ELBOW']),group('Clothing',['SHIRT','COAT','SOCK','HAT']),group('Hot drinks',['TEA','COFFEE','COCOA','CHAI']),group('Trees',['OAK','PINE','BIRCH','MAPLE'])),
      board(group('School subjects',['MATHS','SCIENCE','HISTORY','ART']),group('Tools',['HAMMER','DRILL','SAW','WRENCH']),group('Sea animals',['SHARK','WHALE','CRAB','OCTOPUS']),group('Places to sit',['CHAIR','BENCH','STOOL','SOFA'])),
      board(group('Breakfast foods',['TOAST','CEREAL','YOGURT','EGGS']),group('Ball sports',['FOOTBALL','TENNIS','RUGBY','GOLF']),group('Flowers',['ROSE','TULIP','DAISY','LILY']),group('Directions',['NORTH','SOUTH','EAST','WEST'])),
      board(group('Birds',['ROBIN','EAGLE','OWL','SWAN']),group('Vehicles',['CAR','VAN','LORRY','BICYCLE']),group('Desserts',['CAKE','PIE','TART','PUDDING']),group('Can be opened',['DOOR','WINDOW','GATE','BOX'])),
      board(group('Seasons',['SPRING','SUMMER','AUTUMN','WINTER']),group('Times of day',['DAWN','MORNING','NOON','EVENING']),group('Emotions',['HAPPY','SAD','ANGRY','CALM']),group('Building materials',['BRICK','WOOD','GLASS','STEEL']))
    ],
    medium: [
      board(group('Move quietly',['CREEP','SNEAK','TIPTOE','SLINK']),group('Parts of a book',['SPINE','COVER','INDEX','CHAPTER']),group('___ board',['DASH','SURF','SCORE','KEY']),group('Words that sound like letters',['BEE','SEA','TEA','WHY'])),
      board(group('Ways to look',['GAZE','STARE','PEER','GLANCE']),group('Containers',['JAR','TIN','TUB','BOX']),group('Keyboard keys',['SHIFT','RETURN','SPACE','ESCAPE']),group('___ light',['MOON','DAY','SPOT','FLASH'])),
      board(group('Sound verbs',['HUM','BUZZ','RING','ROAR']),group('Card suits',['HEARTS','DIAMONDS','CLUBS','SPADES']),group('Newspaper sections',['SPORT','BUSINESS','CULTURE','OPINION']),group('Fire ___',['FLY','PLACE','WORK','WOOD'])),
      board(group('Move fast',['SPRINT','DASH','RACE','BOLT']),group('Outerwear',['COAT','JACKET','PARKA','CAPE']),group('Web terms',['LINK','CACHE','COOKIE','TAB']),group('Things with a pitch',['FIELD','SALES','SONG','TENT'])),
      board(group('Cut into pieces',['SLICE','CHOP','DICE','MINCE']),group('Parts of a tree',['ROOT','BARK','TRUNK','BRANCH']),group('Dances',['SALSA','TANGO','WALTZ','SWING']),group('___ room',['BED','CLASS','BATH','SHOW'])),
      board(group('Argue',['DEBATE','DISPUTE','QUARREL','BICKER']),group('Small amounts',['DASH','PINCH','DROP','TRACE']),group('Space objects',['COMET','ASTEROID','PLANET','MOON']),group('___ line',['DEAD','SKY','HEAD','LIFE'])),
      board(group('Kinds of code',['SOURCE','MORSE','DRESS','ZIP']),group('Support',['AID','BACK','UPHOLD','BRACE']),group('Things with rings',['TREE','PHONE','SATURN','BOXING']),group('Silent first letters',['GNOME','KNIFE','PSALM','WRIST'])),
      board(group('Ways to speak',['WHISPER','MUMBLE','SHOUT','CHAT']),group('Shoe parts',['LACE','SOLE','HEEL','TONGUE']),group('___ keeper',['BEE','BOOK','SHOP','GOAL']),group('Things that run',['TAP','ENGINE','PROGRAM','NOSE']))
    ],
    hard: [
      board(group('Things with a pitch',['ROOF','SONG','SALES','TENT']),group('Palindromes',['LEVEL','ROTOR','CIVIC','KAYAK']),group('Begin with silent letters',['GNOME','KNIFE','PSALM','WRIST']),group('Change one letter in “COLD”',['CORD','GOLD','COLT','FOLD'])),
      board(group('Contain ONE',['STONE','MONEY','HONEY','CLONE']),group('Blue ___',['BERRY','BIRD','PRINT','MOON']),group('Can be cracked',['CODE','CASE','EGG','NUT']),group('Sound like letters',['BEE','SEA','TEA','WHY'])),
      board(group('___fall',['NIGHT','WATER','FOOT','SNOW']),group('Things with spines',['BOOK','CACTUS','HEDGEHOG','HUMAN']),group('Silent final E',['CAVE','HOPE','BIKE','TUBE']),group('Things you can draw',['BATH','CURTAIN','CARD','SWORD'])),
      board(group('Greek letters',['ALPHA','BETA','GAMMA','DELTA']),group('___stone',['KEY','LIME','SAND','BRIM']),group('End in IGHT',['LIGHT','NIGHT','SIGHT','MIGHT']),group('Kinds of scale',['FISH','MAP','PAY','MUSIC'])),
      board(group('Things with keys',['PIANO','KEYBOARD','LOCK','MAP']),group('Double letters',['COFFEE','BALLOON','ADDRESS','SUCCESS']),group('___ draft',['ROUGH','FIRST','FINAL','BEER']),group('Kinds of current',['ELECTRIC','OCEAN','AIR','NEWS'])),
      board(group('Can be sharp',['KNIFE','TURN','NOTE','MIND']),group('Head ___',['LINE','PHONE','LIGHT','START']),group('Words with silent B',['LAMB','COMB','THUMB','DEBT']),group('Made of cells',['BATTERY','BODY','HONEYCOMB','SPREADSHEET'])),
      board(group('Things with branches',['BANK','TREE','RIVER','GOVERNMENT']),group('Things with a charge',['BATTERY','CRIME','BULL','CARD']),group('___ case',['BOOK','COURT','PHONE','UPPER']),group('Can mean excellent',['PRIME','ACE','SUPER','GRAND'])),
      board(group('Heteronyms',['BOW','LEAD','WIND','ROW']),group('___ room',['BATH','CLASS','SHOW','MAIL']),group('NATO alphabet',['ALPHA','BRAVO','CHARLIE','DELTA']),group('Kinds of draft',['PICK','BEER','BREEZE','COPY']))
    ]
  };

  const MINI_CROSSWORDS = {
    easy: [
      mini('BALL','Round toy',['ABLE','CAVE','BLUE','CLAY'],['Capable','Hollow in rock','Colour of a clear sky','Pottery material']),
      mini('HOME','Where you live',['WHEN','BOAT','OMIT','BEAR'],['At what time','Small vessel','Leave out','Large furry animal']),
      mini('STAR','Light in the night sky',['ISLE','STEM','GAME','TREE'],['Small island','Plant stalk','Something played','Tall woody plant']),
      mini('FISH','Animal with fins',['AFAR','WIRE','USER','WHEN'],['At a distance','Thin metal strand','Person operating something','At what time']),
      mini('BOOK','Something to read',['ABLE','BOAT','COAT','SKIN'],['Capable','Small vessel','Warm outer layer','Body covering']),
      mini('RAIN','Water from clouds',['TREE','GAME','WIRE','SNAP'],['Tall woody plant','Something played','Thin metal strand','Break suddenly']),
      mini('MOON','Earth’s natural satellite',['OMIT','BOAT','COAT','SNAP'],['Leave out','Small vessel','Warm outer layer','Break suddenly']),
      mini('CAKE','Birthday treat',['ACID','GAME','SKIN','BEAR'],['Sour chemical','Something played','Body covering','Large furry animal'])
    ],
    medium: [
      mini('MINT','Aromatic herb',['OMIT','WIRE','SNAP','STEM'],['Leave out','Metal strand','Break suddenly','Plant stalk']),
      mini('WAVE','Ocean swell',['SWAN','GAME','OVEN','BEAR'],['Graceful water bird','Something played','Kitchen appliance','Large furry animal']),
      mini('DUSK','Evening twilight',['IDEA','SUIT','USER','SKIN'],['Thought','Matching clothes','Person operating something','Body covering']),
      mini('TIDE','Regular rise and fall of the sea',['STEM','WIRE','IDEA','BEAR'],['Plant stalk','Metal strand','Thought','Large furry animal']),
      mini('BARK','Tree covering or dog sound',['ABLE','CAVE','TREE','SKIN'],['Capable','Hollow in rock','Tall woody plant','Body covering']),
      mini('LAMP','Source of light',['BLUE','GAME','OMIT','OPEN'],['Sky colour','Something played','Leave out','Not closed']),
      mini('CORN','Cereal crop',['ACID','BOAT','TREE','SNAP'],['Sour chemical','Small vessel','Tall woody plant','Break suddenly']),
      mini('GLOW','Give off steady light',['AGED','BLUE','BOAT','SWAN'],['Grew older','Sky colour','Small vessel','Graceful water bird'])
    ],
    hard: [
      mini('ONYX','Banded gemstone',['BOAT','SNAP','EYES','AXLE'],['Small vessel','Break suddenly','Organs of sight','Shaft through wheels']),
      mini('QUIZ','Short knowledge test',['AQUA','SUIT','WIRE','CZAR'],['Water, in product names','Matching clothes','Metal strand','Russian ruler']),
      mini('MYTH','Traditional symbolic story',['OMIT','EYES','STEM','WHEN'],['Leave out','Organs of sight','Plant stalk','At what time']),
      mini('ECHO','Reflected sound',['BEAR','ACID','WHEN','BOAT'],['Large furry animal','Sour chemical','At what time','Small vessel']),
      mini('JAZZ','Improvised music style',['AJAR','GAME','CZAR','TZAR'],['Slightly open','Something played','Russian ruler','Alternative spelling of czar']),
      mini('LYNX','Wild cat with tufted ears',['BLUE','EYES','SNAP','AXLE'],['Sky colour','Organs of sight','Break suddenly','Shaft through wheels']),
      mini('VETO','Official rejection',['OVEN','BEAR','STEM','BOAT'],['Kitchen appliance','Large furry animal','Plant stalk','Small vessel']),
      mini('RUSE','Deceptive trick',['TREE','SUIT','USER','BEAR'],['Tall woody plant','Matching clothes','Person operating something','Large furry animal'])
    ]
  };

  const CROSSWORDS = {
    easy: [
      cross('PLANET','World orbiting a star',['APPLE','CRANE','SHEEP'],['Fruit linked with teachers','Tall lifting machine','Woolly farm animal']),
      cross('GARDEN','Place where flowers grow',['TIGER','CARRY','OCEAN'],['Striped big cat','Hold and move','Large body of salt water']),
      cross('CASTLE','Fortified royal home',['FOCUS','ASSET','BELLY'],['Centre of attention','Something of value','Front of the abdomen']),
      cross('MARKET','Place for buying and selling',['HUMAN','CARRY','OCEAN'],['A person','Hold and move','Large body of salt water']),
      cross('SCHOOL','Place for lessons',['ASSET','OTHER','SHORE'],['Something of value','The remaining one','Edge of the sea']),
      cross('FOREST','Large area of trees',['OFFER','CARRY','ASSET'],['Present for acceptance','Hold and move','Something of value']),
      cross('SUMMER','Warmest season',['ASSET','HUMAN','OCEAN'],['Something of value','A person','Large body of salt water']),
      cross('ORANGE','Citrus fruit and a colour',['CLOUD','CRANE','TIGER'],['Mass of water droplets','Tall lifting machine','Striped big cat'])
    ],
    medium: [
      cross('BRIGHT','Giving off plenty of light',['ROBIN','CHILD','OTHER'],['Red-breasted bird','Young person','The remaining one']),
      cross('WINTER','Coldest season',['TOWER','HONEY','OCEAN'],['Tall narrow building','Sweet food made by bees','Large body of salt water']),
      cross('SPRING','Season after winter',['ASSET','CARRY','HONEY'],['Something of value','Hold and move','Sweet food made by bees']),
      cross('POETRY','Verse as a literary form',['APPLE','OCEAN','CARRY'],['Fruit linked with teachers','Large body of salt water','Hold and move']),
      cross('TRAVEL','Go from one place to another',['AFTER','CRANE','OCEAN'],['Later than','Tall lifting machine','Large body of salt water']),
      cross('HEALTH','State of body and mind',['OTHER','CRANE','AFTER'],['The remaining one','Tall lifting machine','Later than']),
      cross('ISLAND','Land surrounded by water',['CHILD','BELLY','HONEY'],['Young person','Front of the abdomen','Sweet food made by bees']),
      cross('SILVER','Shiny precious metal',['ASSET','BELLY','OCEAN'],['Something of value','Front of the abdomen','Large body of salt water'])
    ],
    hard: [
      cross('CRYPTS','Underground burial chambers',['FOCUS','MAYOR','AFTER'],['Centre of attention','Elected civic leader','Later than']),
      cross('ZEALOT','Fanatically devoted person',['HAZEL','CRANE','SHORE'],['Green-brown colour','Tall lifting machine','Edge of the sea']),
      cross('RHYTHM','Pattern of beats',['CARRY','MAYOR','OTHER'],['Hold and move','Elected civic leader','The remaining one']),
      cross('EXOTIC','Strikingly unfamiliar',['OCEAN','SHORE','CHILD'],['Large body of salt water','Edge of the sea','Young person']),
      cross('MYSTIC','Person seeking spiritual truth',['HUMAN','ASSET','CHILD'],['A person','Something of value','Young person']),
      cross('GOBLIN','Mischievous creature of folklore',['TIGER','ROBIN','CHILD'],['Striped big cat','Red-breasted bird','Young person']),
      cross('FACADE','Front face of a building',['OFFER','FOCUS','BADGE'],['Present for acceptance','Centre of attention','Small emblem']),
      cross('JUNGLE','Dense tropical forest',['ENJOY','HONEY','BELLY'],['Take pleasure in','Sweet food made by bees','Front of the abdomen'])
    ]
  };

  const STRANDS = {
    easy: [
      { theme:'Things in the sky',size:6,words:['SUN','MOON','STAR','CLOUD'] },
      { theme:'In a garden',size:6,words:['ROSE','TULIP','SEED','SOIL'] },
      { theme:'Popular pets',size:6,words:['CAT','DOG','FISH','RABBIT'] },
      { theme:'Weather words',size:6,words:['RAIN','SNOW','WIND','STORM'] },
      { theme:'Colours',size:6,words:['RED','BLUE','GREEN','GOLD'] },
      { theme:'At the beach',size:6,words:['SAND','SHELL','WAVE','CRAB'] },
      { theme:'School desk',size:6,words:['PEN','BOOK','RULER','DESK'] },
      { theme:'Fruit bowl',size:6,words:['APPLE','PEAR','PLUM','GRAPE'] },
      { theme:'Making music',size:6,words:['DRUM','PIANO','FLUTE','SONG'] },
      { theme:'Around the home',size:6,words:['DOOR','CHAIR','TABLE','LAMP'] }
    ],
    medium: [
      { theme:'On a breakfast table',size:7,words:['TOAST','CEREAL','COFFEE','BUTTER','SPOON'] },
      { theme:'In a workshop',size:7,words:['HAMMER','DRILL','SAW','NAIL','WRENCH'] },
      { theme:'Outer space',size:7,words:['COMET','PLANET','ORBIT','ROCKET','METEOR'] },
      { theme:'Forest floor',size:7,words:['ACORN','BADGER','CANOPY','MOSS','FERN'] },
      { theme:'Kitchen drawer',size:7,words:['WHISK','KETTLE','APRON','LADLE','PANTRY'] },
      { theme:'Going on a trip',size:7,words:['AIRPORT','TICKET','HOTEL','TRAIN','MAP'] },
      { theme:'Under the sea',size:7,words:['CORAL','DOLPHIN','TURTLE','REEF','SHARK'] },
      { theme:'Cold weather',size:7,words:['SLEDGE','FROST','SCARF','GLOVE','ICICLE'] },
      { theme:'Sporting kit',size:7,words:['RACKET','HELMET','GOAL','PITCH','MEDAL'] },
      { theme:'At the library',size:7,words:['AUTHOR','NOVEL','SHELF','INDEX','COVER'] }
    ],
    hard: [
      { theme:'At the theatre',size:8,words:['CURTAIN','ACTOR','SCRIPT','STAGE','MATINEE'] },
      { theme:'Architecture',size:8,words:['ARCHWAY','COLUMN','FACADE','ATRIUM','DOME'] },
      { theme:'Navigation',size:8,words:['COMPASS','BEARING','CHART','BEACON','NORTH'] },
      { theme:'Mythology',size:8,words:['DRAGON','ORACLE','TITAN','PHOENIX','NYMPH'] },
      { theme:'Parts of language',size:8,words:['SYNTAX','VOWEL','CLAUSE','IDIOM','PREFIX'] },
      { theme:'Geology',size:8,words:['GRANITE','MAGMA','CRYSTAL','FOSSIL','MANTLE'] },
      { theme:'Finance terms',size:8,words:['EQUITY','BOND','ASSET','LEDGER','YIELD'] },
      { theme:'Detective story',size:8,words:['ALIBI','MOTIVE','CLUE','WITNESS','SUSPECT'] },
      { theme:'In an orchestra',size:8,words:['VIOLIN','CELLO','OBOE','TROMBONE','TEMPO'] },
      { theme:'Computing terms',size:8,words:['BINARY','SERVER','CACHE','KERNEL','ROUTER'] }
    ]
  };

  const STRAND_EXTRAS = {
    easy: [
      ['SKY','SUNSET','COMET','PLANET'], ['GRASS','LEAF','HERB','POND'], ['MOUSE','BIRD','PUPPY','KITTEN'], ['HAIL','FROST','CLOUD','BREEZE'],
      ['PINK','BLACK','WHITE','AMBER'], ['TOWEL','DUNE','SURF','SEA'], ['PENCIL','PAPER','ERASER','CRAYON'], ['MANGO','PEACH','MELON','BERRY'],
      ['NOTES','VOICE','CELLO','HARP'], ['SOFA','CLOCK','BED','SHELF']
    ],
    medium: [
      ['BACON','WAFFLE','JUICE','JAM'], ['CHISEL','PLIERS','SCREW','LATHE'], ['GALAXY','NEBULA','SATURN','LUNAR'], ['TWIG','LEAVES','DEER','ROOTS'],
      ['SPATULA','TONGS','GRATER','SIEVE'], ['TAXI','BEACH','CAMERA','MOTEL'], ['OCTOPUS','WHALE','SQUID','SEAL'], ['JACKET','BOOTS','CHILLY','ICE'],
      ['JERSEY','BOOTS','BAT','GLOVE'], ['READER','POETRY','PAGES','STORY']
    ],
    hard: [
      ['COSTUME','SCENERY','APPLAUSE','DRAMA'], ['BALCONY','VAULT','TURRET','PORTICO'], ['SEXTANT','MAP','COURSE','NEEDLE'], ['ZEUS','HERO','MEDUSA','CYCLOPS'],
      ['NOUN','VERB','ADVERB','PHRASE'], ['QUARTZ','BASALT','MINERAL','LAVA'], ['PROFIT','CREDIT','CAPITAL','BUDGET'], ['EVIDENCE','SECRET','CRIME','HUNCH'],
      ['TRUMPET','VIOLA','BATON','HORN'], ['PIXEL','COOKIE','MEMORY','SCRIPT']
    ]
  };

  const MINI_WORD_BANK = words(`
    ABLE ACID AFAR AGED AJAR ALSO AQUA AREA ARMY AWAY AXLE BABY BACK BAKE BALL BAND BANK BARK BASE BATH BEAR BEAT BELL BELT
    BEST BIKE BIRD BLUE BOAT BODY BOOK BOOT BOWL CAKE CALL CALM CARD CARE CASE CASH CAVE CITY CLAY CLUB COAT COLD COOK COOL
    CORN CZAR DARK DAWN DAYS DESK DOOR DOWN DRAW DROP DUSK EACH EARN EASY ECHO EDGE EYES FACE FACT FAIR FARM FAST FEAR FEET
    FILE FIRE FISH FLAG FLOW FOOD FOOT GAME GATE GIFT GIRL GIVE GLAD GLOW GOLD GOOD GRAY GROW HAIR HALF HAND HANG HARD HATE
    HAVE HEAD HEAR HEAT HELP HERE HILL HOME HOPE IDEA IRON ISLE ITEM JOIN JUMP KEEP KIND KING LAKE LAMP LAND LAST LATE LAZY
    LEAD LEAF LIFE LION LIST LIVE LOOK LOVE LUCK MAIL MAIN MAKE MANY MEAL MEET MIND MINT MISS MOON MOVE NAME NEAR NEST NEXT
    NICE NOTE OMIT ONYX OPEN OVEN PAGE PAIR PARK PART PATH PEAR PLAY QUIZ RAIN READ REAL RING ROAD ROCK ROOM ROSE RUSE SAFE
    SAND SAVE SEAT SHIP SHOP SHOW SIDE SIGN SING SKIN SNAP SNOW SOFT SONG STAR STEM STOP SUIT SWAN TAKE TALK TALL TEAM TENT
    TIDE TIME TOWN TREE TRIP TURN TZAR USER VETO WAVE WEEK WELL WHEN WIDE WIFE WILD WIND WIRE WISH WOOD WORD WORK YARD YEAR ZERO
  `);

  const CROSSWORD_WORD_BANK = words(`
    ABSENT ACCEPT ACCESS ACROSS ACTION ACTIVE ACTUAL ADJUST ADMIRE ADVICE AFFORD AFRAID AGENCY ALMOST ALWAYS AMOUNT ANIMAL ANNUAL
    ANSWER APPEAL APPEAR ARCADE ARTIST AUTUMN BACKUP BANNER BASKET BATTLE BEAUTY BECOME BEFORE BEHIND BETTER BORDER BOTTLE BOTTOM
    BRANCH BRIDGE BRIGHT BROKEN BUTTON CAMERA CANDLE CARPET CASTLE CHANCE CHANGE CHOICE CHURCH CIRCLE CLIENT CLOSED COFFEE COLUMN
    CORNER COTTON CREATE CREDIT CUSTOM DANGER DEALER DEGREE DINNER DOCTOR DRAGON DRAWER DRIVER EFFORT ENGINE ESCAPE ESTATE FAMILY
    FAMOUS FATHER FIGURE FLIGHT FLOWER FOLLOW FOREST FORGET FORMAT FRIEND FUTURE GARDEN GOLDEN GROUND GUITAR HAMMER HEALTH HEAVEN
    HELMET HONEST ISLAND JACKET JUNGLE KITTEN LADDER LAPTOP LATEST LETTER LITTLE MARKET MEMORY MIRROR MODERN MONKEY MOTHER MOTION
    NATURE NUMBER OBJECT OFFICE OPTION ORANGE PENCIL PEOPLE PLANET POCKET POETRY PRETTY PURPLE RABBIT RANDOM READER RECORD ROCKET
    SCHOOL SCREEN SECRET SILVER SIMPLE SISTER SPIRIT SPRING STREET STRONG SUMMER SUNSET SYSTEM TARGET THREAD TICKET TRAVEL TURTLE
    UNIQUE VALLEY VIOLET WALLET WINDOW WINNER WINTER YELLOW CRYPTS ZEALOT RHYTHM EXOTIC MYSTIC GOBLIN FACADE
  `);

  const combinationCache = new Map();
  function combinations(items, size) {
    const key = `${items.join('|')}:${size}`;
    if (combinationCache.has(key)) return combinationCache.get(key);
    const result = [];
    const visit = (start, chosen) => {
      if (chosen.length === size) { result.push(chosen.slice()); return; }
      for (let index = start; index <= items.length - (size - chosen.length); index += 1) {
        chosen.push(items[index]);
        visit(index + 1, chosen);
        chosen.pop();
      }
    };
    visit(0, []);
    combinationCache.set(key, result);
    return result;
  }

  const connectionVariantCache = {};
  function connectionVariants(level) {
    if (connectionVariantCache[level]) return connectionVariantCache[level];
    const source = CONNECTION_BOARDS[level];
    const variants = [];
    const possible = source.length ** 4;
    for (let variant = 0; variant < possible; variant += 1) {
      let cursor = variant;
      const groups = [0, 1, 2, 3].map(lane => {
        const boardIndex = cursor % source.length;
        cursor = Math.floor(cursor / source.length);
        return source[boardIndex][lane];
      });
      const boardWords = groups.flatMap(item => item.words);
      if (new Set(boardWords).size === 16) variants.push(groups);
    }
    connectionVariantCache[level] = variants;
    return variants;
  }

  function connectionsFor(level, seed) {
    const variants = connectionVariants(level);
    return variants[positive(seed) % variants.length];
  }

  function strandsFor(level, seed) {
    const themes = STRANDS[level];
    const themeIndex = positive(seed) % themes.length;
    const source = themes[themeIndex];
    const pool = [...new Set([...source.words, ...STRAND_EXTRAS[level][themeIndex]])];
    const variants = combinations(pool, source.words.length);
    const variantIndex = Math.floor(positive(seed) / themes.length) % variants.length;
    return { theme: source.theme, size: source.size, words: variants[variantIndex] };
  }

  const explicitClues = new Map();
  for (const bank of [MINI_CROSSWORDS, CROSSWORDS]) {
    for (const puzzles of Object.values(bank)) {
      for (const puzzle of puzzles) {
        explicitClues.set(puzzle.across.answer, puzzle.across.clue);
        for (const entry of puzzle.down) explicitClues.set(entry.answer, entry.clue);
      }
    }
  }

  function generatedClue(answer, seed) {
    if (explicitClues.has(answer)) return explicitClues.get(answer);
    const shift = 1 + positive(seed) % (answer.length - 1);
    let mixed = answer.slice(shift) + answer.slice(0, shift);
    if (mixed === answer) mixed = answer.split('').reverse().join('');
    return `Unscramble “${mixed}”`;
  }

  function uniqueEntries(values, seed) {
    const seen = new Set();
    return values.filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    }).map((answer, index) => ({ answer, clue: generatedClue(answer, seed + index) }));
  }

  function crosswordFor(kind, level, seed) {
    const miniMode = kind === 'mini';
    const original = miniMode ? MINI_CROSSWORDS[level] : CROSSWORDS[level];
    const acrossValues = uniqueEntries([
      ...original.map(puzzle => puzzle.across.answer),
      ...(miniMode ? MINI_WORD_BANK : CROSSWORD_WORD_BANK)
    ], seed);
    const downValues = uniqueEntries(miniMode
      ? [...MINI_WORD_BANK, ...Object.values(MINI_CROSSWORDS).flatMap(puzzles => puzzles.flatMap(puzzle => puzzle.down.map(entry => entry.answer)))]
      : [...WORDLE_LEVELS[level], ...Object.values(CROSSWORDS).flatMap(puzzles => puzzles.flatMap(puzzle => puzzle.down.map(entry => entry.answer)))], seed + 17);
    const crossingIndex = miniMode ? 1 : 2;
    const acrossIndexes = miniMode ? [0, 1, 2, 3] : [0, 2, 4];
    const candidatesFor = letter => downValues.filter(entry => entry.answer[crossingIndex] === letter);
    const usableAcross = acrossValues.filter(entry =>
      acrossIndexes.every(index => candidatesFor(entry.answer[index]).length >= 2)
    );
    const normalizedSeed = positive(seed);
    const across = usableAcross[normalizedSeed % usableAcross.length];
    const cycle = Math.floor(normalizedSeed / usableAcross.length);
    const used = new Set();
    const down = acrossIndexes.map((answerIndex, position) => {
      const candidates = candidatesFor(across.answer[answerIndex]);
      let candidateIndex = (cycle * (position * 2 + 1) + normalizedSeed + position * 11) % candidates.length;
      while (used.has(candidates[candidateIndex].answer) && candidates.length > used.size) candidateIndex = (candidateIndex + 1) % candidates.length;
      const chosen = candidates[candidateIndex];
      used.add(chosen.answer);
      return chosen;
    });
    return { size: miniMode ? 5 : 6, across, down };
  }

  window.CommandCentreGameContent = Object.freeze({
    version: 4,
    WORDLE_LEVELS,
    TRIVIA_LEVELS,
    CONNECTION_BOARDS,
    MINI_CROSSWORDS,
    CROSSWORDS,
    STRANDS,
    connectionsFor,
    crosswordFor,
    strandsFor
  });
})();
