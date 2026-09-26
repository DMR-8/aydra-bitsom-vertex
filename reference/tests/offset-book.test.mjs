import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettingsFor } from '../src/components/pdf-imposer/constants.ts';
import { physicalSheetCount, planImposition } from '../src/components/pdf-imposer/layout.ts';

const settings = defaultSettingsFor('offset-book');
const plan = (pageCount, patch = {}) =>
  planImposition('offset-book', { ...settings, ...patch }, { pageCount, pageSize: { width: 432, height: 648 } });

/**
 * Each plate as `TL, TR / BL, BR`, the way the shop's sample PDFs read: the top
 * row is turned head to head, the bottom row upright.
 */
function plates(result) {
  assert.equal(result.error, null);
  return result.sheets.map((sheet) => {
    const at = (row, col) => {
      const xs = [...new Set(sheet.slots.map((slot) => slot.x))].sort((a, b) => a - b);
      const ys = [...new Set(sheet.slots.map((slot) => slot.y))].sort((a, b) => a - b);
      const slot = sheet.slots.find((s) => s.x === xs[col] && s.y === ys[row]);
      assert.equal(slot.rotated, row === 0, `${sheet.label}: top row turns, bottom row does not`);
      return slot.page;
    };
    return `${at(0, 0)}, ${at(0, 1)} / ${at(1, 0)}, ${at(1, 1)}`;
  });
}

test('Center Pin is the default binding, with a Title Lot-Pot', () => {
  assert.equal(settings.centerPin, true);
  assert.equal(settings.lotPotPosition, 'title');
});

// docs/samples/Normal Bind - 20 Page.pdf
test('Normal Bind, 20 pages: two stacked sheets, then the last 4 pages as the Lot-Pot', () => {
  const result = plan(20, { centerPin: false });
  assert.deepEqual(plates(result), [
    '5, 4 / 8, 1',
    '3, 6 / 2, 7',
    '13, 12 / 16, 9',
    '11, 14 / 10, 15',
    '19, 18 / 20, 17',
  ]);
  assert.equal(result.sheets[4].lotPot, true);
  assert.equal(physicalSheetCount(result), 3);
});

// docs/samples/Centre Pin - Title Lot Pot - 20 Page.pdf
test('Center Pin with Title Lot-Pot, 20 pages: 1, 2, 19, 20 first, pages 3–18 nested inside', () => {
  const result = plan(20, { lotPotPosition: 'title' });
  assert.deepEqual(plates(result), [
    '19, 2 / 20, 1',
    '15, 6 / 18, 3',
    '5, 16 / 4, 17',
    '11, 10 / 14, 7',
    '9, 12 / 8, 13',
  ]);
  assert.equal(result.sheets[0].lotPot, true);
  assert.equal(physicalSheetCount(result), 3);
});

// docs/samples/Fixed Centre Pin - Inner Lot Pot - 20 Page.pdf
test('Center Pin with Inner Lot-Pot, 20 pages: outer sheets nested, innermost 4 pages last', () => {
  const result = plan(20, { lotPotPosition: 'inner' });
  assert.deepEqual(plates(result), [
    '17, 4 / 20, 1',
    '3, 18 / 2, 19',
    '13, 8 / 16, 5',
    '7, 14 / 6, 15',
    '11, 10 / 12, 9',
  ]);
  assert.equal(result.sheets[4].lotPot, true);
});

test('every page appears exactly once, and Center Pin pages face their saddle partner', () => {
  for (const pageCount of [4, 8, 12, 16, 20, 28, 36]) {
    for (const patch of [{ centerPin: false }, { lotPotPosition: 'title' }, { lotPotPosition: 'inner' }]) {
      const result = plan(pageCount, patch);
      const pages = result.sheets.flatMap((sheet) => sheet.slots.map((slot) => slot.page)).sort((a, b) => a - b);
      assert.deepEqual(pages, Array.from({ length: pageCount }, (_, i) => i + 1), `${pageCount} ${JSON.stringify(patch)}`);
      if (patch.centerPin === false) continue;
      // In a saddle-stitched book the two pages side by side on a row add up to N + 1.
      for (const sheet of result.sheets) {
        for (const row of [0, 1]) {
          const y = [...new Set(sheet.slots.map((slot) => slot.y))].sort((a, b) => a - b)[row];
          const pair = sheet.slots.filter((slot) => slot.y === y).map((slot) => slot.page);
          assert.equal(pair[0] + pair[1], pageCount + 1, `${pageCount} ${sheet.label} row ${row}`);
        }
      }
    }
  }
});

test('a multiple of 8 has no Lot-Pot and plans as before', () => {
  const nestedPlan = plates(plan(16));
  assert.deepEqual(nestedPlan, ['13, 4 / 16, 1', '3, 14 / 2, 15', '9, 8 / 12, 5', '7, 10 / 6, 11']);
  assert.ok(plan(16).sheets.every((sheet) => !sheet.lotPot));
});

test('a page count that is not a multiple of 4 asks for blank pages', () => {
  const result = plan(18);
  assert.match(result.error, /multiple of 4.*Add 2 blank pages to make 20/);
});

test('the 8-page plate is unchanged: Center Pin still needs a multiple of 16', () => {
  assert.match(plan(20, { plateSetting: '8-page' }).error, /multiple of 16/);
  assert.equal(plan(32, { plateSetting: '8-page' }).error, null);
});

// ---------------------------------------------------------------------------
// N-up and Mix n Match
// ---------------------------------------------------------------------------

const EPS = 1e-6;
const rotationOf = (slot) => slot.rotation ?? (slot.rotated ? 180 : 0);
// The direction the head of the page points, on a sheet with y running down.
const UP = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] };
const sameRect = (a, b) =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS &&
  Math.abs(a.width - b.width) < EPS && Math.abs(a.height - b.height) < EPS;

/**
 * Turns the sheet over, left to right for a front and back pair or head to foot
 * for a Lot-Pot, and returns what prints behind each page: the page number, and
 * whether its head points the same way as the page in front of it.
 */
function behind(result, front, back, flip) {
  const W = result.sheetWidthMm;
  const H = result.sheetHeightMm;
  return front.slots.map((slot) => {
    const target = flip === 'turn'
      ? { x: W - slot.x - slot.width, y: slot.y, width: slot.width, height: slot.height }
      : { x: slot.x, y: H - slot.y - slot.height, width: slot.width, height: slot.height };
    const match = back.slots.filter((other) => sameRect(other, target));
    assert.equal(match.length, 1, `${front.label}: page ${slot.page} has exactly one page behind it`);
    const [ux, uy] = UP[rotationOf(slot)];
    const seen = flip === 'turn' ? [-ux, uy] : [ux, -uy];
    const [bx, by] = UP[rotationOf(match[0])];
    return { page: slot.page, back: match[0].page, headsAgree: seen[0] === bx && seen[1] === by };
  });
}

/** Which page backs which, read from a plan's own sheets. */
function leaves(result) {
  const pairs = new Set();
  for (let index = 0; index < result.sheets.length; index += 1) {
    const sheet = result.sheets[index];
    if (sheet.side === 'back') continue;
    const back = sheet.lotPot ? sheet : result.sheets[index + 1];
    for (const leaf of behind(result, sheet, back, sheet.lotPot ? 'tumble' : 'turn')) {
      assert.ok(leaf.headsAgree, `${sheet.label}: page ${leaf.page} and its back ${leaf.back} head the same way`);
      pairs.add(`${leaf.page}|${leaf.back}`);
    }
  }
  return pairs;
}

function inBoundsWithoutOverlap(result) {
  for (const sheet of result.sheets) {
    for (const [index, slot] of sheet.slots.entries()) {
      assert.ok(slot.x >= -EPS && slot.y >= -EPS, `${sheet.label} inside the sheet`);
      assert.ok(slot.x + slot.width <= result.sheetWidthMm + EPS && slot.y + slot.height <= result.sheetHeightMm + EPS);
      for (const other of sheet.slots.slice(index + 1)) {
        const overlap = slot.x < other.x + other.width - EPS && slot.x + slot.width > other.x + EPS &&
          slot.y < other.y + other.height - EPS && slot.y + slot.height > other.y + EPS;
        assert.ok(!overlap, `${sheet.label}: pages ${slot.page} and ${other.page} overlap`);
      }
    }
  }
}

const lithroneG37 = { offsetOutput: 'plate', plateWidthMm: 700, plateHeightMm: 945 };

test('N-up repeats whole signatures: four 6 × 9 in signatures fit a Lithrone G37 plate', () => {
  const result = plan(16, { ...lithroneG37, bookNUp: true });
  assert.equal(result.error, null);
  assert.equal(result.bookNUp.spreadsPerSheet, 4);
  inBoundsWithoutOverlap(result);
  for (const sheet of result.sheets) {
    assert.equal(sheet.slots.length, 16);
    assert.equal(sheet.bookSpreads.length, 4);
  }
  // Each copy carries the same 4 pages as the single-signature plate.
  const single = plan(16, lithroneG37).sheets;
  for (const [index, sheet] of result.sheets.entries()) {
    const pages = sheet.slots.map((slot) => slot.page).sort((a, b) => a - b);
    const once = single[index].slots.map((slot) => slot.page);
    assert.deepEqual(pages, [...once, ...once, ...once, ...once].sort((a, b) => a - b));
  }
});

test('Mix n Match adds quarter-turned signatures where more fit', () => {
  // 6 × 9 in signatures are 304.8 × 464.8 mm. On 1075 × 770 mm a row of three
  // upright ones leaves a band that takes two turned: 5, where either alone gives 4.
  const sheet = { sheetWidthMm: 1075, sheetHeightMm: 770 };
  const uniform = plan(16, { ...sheet, bookNUp: true });
  const mixed = plan(16, { ...sheet, bookNUp: true, bookMixMatch: true });
  assert.equal(uniform.bookNUp.spreadsPerSheet, 4);
  assert.equal(mixed.bookNUp.spreadsPerSheet, 5);
  assert.equal(mixed.bookNUp.mixed, true);
  inBoundsWithoutOverlap(mixed);
});

test('every back lands behind its own front, heads matching, for every N-up and Mix n Match layout', () => {
  const sheets = [
    lithroneG37,
    { sheetWidthMm: 914.4, sheetHeightMm: 635 },
    { sheetWidthMm: 635, sheetHeightMm: 914.4 },
    { sheetWidthMm: 1000, sheetHeightMm: 1000 },
    { sheetWidthMm: 1075, sheetHeightMm: 770 },
  ];
  let mixedLayouts = 0;
  const jobs = [
    [16, {}],
    [20, { lotPotPosition: 'title' }],
    [20, { lotPotPosition: 'inner' }],
    [20, { centerPin: false }],
    [32, { plateSetting: '8-page' }],
  ];
  for (const size of sheets) {
    for (const [pageCount, patch] of jobs) {
      // The single-signature plate is the reference for which page backs which.
      const reference = leaves(plan(pageCount, { ...size, ...patch }));
      for (const bookMixMatch of [false, true]) {
        const result = plan(pageCount, { ...size, ...patch, bookNUp: true, bookMixMatch });
        assert.equal(result.error, null, `${pageCount} ${JSON.stringify({ ...size, ...patch, bookMixMatch })}`);
        inBoundsWithoutOverlap(result);
        if (result.bookNUp.mixed) mixedLayouts += 1;
        for (const pair of leaves(result)) assert.ok(reference.has(pair), `leaf ${pair} exists in the 1-up plan`);
      }
    }
  }
  assert.ok(mixedLayouts > 0, 'at least one layout mixes upright and turned signatures');
});

test('a Lot-Pot stays upright under N-up, even with Mix n Match', () => {
  const result = plan(20, { ...lithroneG37, bookNUp: true, bookMixMatch: true });
  const lotPot = result.sheets.find((sheet) => sheet.lotPot);
  assert.ok(lotPot.slots.every((slot) => rotationOf(slot) === 0 || rotationOf(slot) === 180));
  assert.equal(lotPot.bookSpreads.length, 4);
});

test('N-up reports a signature that fits nowhere as an error, not a warning', () => {
  const result = plan(16, { sheetWidthMm: 210, sheetHeightMm: 297, bookNUp: true });
  assert.match(result.error, /does not fit/);
  assert.match(plan(16, { sheetWidthMm: 210, sheetHeightMm: 297 }).warnings.join(' '), /larger than/);
});
