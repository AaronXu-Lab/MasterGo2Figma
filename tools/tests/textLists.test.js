const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('../../SendToFigma/node_modules/esbuild');
const root = path.resolve(__dirname, '../..');
const output = esbuild.buildSync({
  stdin: { contents: `
    export { transTextNode } from './SendToFigma/src/serializers/text';
    export { applyTextProperties, applyInstanceTextFormatting, applyStyledTextSegments, applyTextListRanges }
      from './ReceiveFromMasterGo/src/appliers/text';
    export { getFixedMixedTextLines } from './ReceiveFromMasterGo/src/appliers/multilineText';
  `, resolveDir: root }, bundle: true, format: 'cjs', platform: 'node', write: false
});
const loaded = { exports: {} };
const font = { family: 'Inter', style: 'Regular' };
const figma = {
  mixed: Symbol('mixed'),
  listAvailableFontsAsync: async () => [{ fontName: font }],
  loadFontAsync: async () => {}
};
new Function('module', 'exports', 'require', 'figma', output.outputFiles[0].text)(loaded, loaded.exports, require, figma);
const { transTextNode, applyTextProperties, applyInstanceTextFormatting, applyStyledTextSegments,
  applyTextListRanges, getFixedMixedTextLines } = loaded.exports;
const marker = '\u{F0010}';
const source = (characters, listStyles, textStyles = []) => ({ type: 'TEXT', characters, listStyles, textStyles });
const exportProps = (...args) => JSON.parse(JSON.stringify(transTextNode(source(...args))));
function textNode(characters = '') {
  return {
    name: 'Text', characters, fontName: font, fontSize: 12, width: 180, height: 240,
    lists: [], indents: [], sizes: [],
    getStyledTextSegments: () => [{ fontName: font }],
    setRangeListOptions(...args) { this.lists.push(args); },
    setRangeIndentation(...args) { this.indents.push(args); },
    setRangeFontSize(...args) { this.sizes.push(args); },
    setRangeFontName() {}
  };
}

test('seven ordered paragraphs export as editable native list options without private marker glyphs', async () => {
  const characters = Array.from({ length: 7 }, (_, i) => marker + 'Rule ' + (i + 1)).join('\n');
  const props = exportProps(characters, [{ start: 0, end: Array.from(characters).length, type: 'ORDERED', level: 0 }]);
  assert.equal(props.characters, Array.from({ length: 7 }, (_, i) => 'Rule ' + (i + 1)).join('\n'));
  const snapshot = JSON.stringify(props);
  const node = textNode();
  await applyTextProperties(node, props);
  assert.equal(node.characters, props.characters);
  assert.deepEqual(node.lists, [[0, props.characters.length, { type: 'ORDERED' }]]);
  assert.deepEqual(node.indents, [[0, props.characters.length, 0]]);
  assert.equal(JSON.stringify(props), snapshot);
  assert.equal(node.width, 180);
  assert.equal(node.height, 240);
});

test('marker removal translates mixed fonts and emoji from code points into UTF-16 once', async () => {
  const characters = marker + '甲😀\n' + marker + '乙';
  const listStyles = [{ start: 0, end: 4, type: 'ORDERED', level: 0 },
    { start: 4, end: 6, type: 'ORDERED', level: 1 }];
  const textStyles = [{ start: 0, end: 1, textStyle: { fontSize: 99 } },
    { start: 1, end: 4, textStyle: { fontSize: 18 } },
    { start: 4, end: 6, textStyle: { fontSize: 24 } }];
  const props = exportProps(characters, listStyles, textStyles);
  assert.equal(props.characters, '甲😀\n乙');
  assert.equal(props.textRangeUnit, 'UTF16');
  assert.deepEqual(props.styledTextSegments.map(({ start, end, fontSize }) => ({ start, end, fontSize })),
    [{ start: 0, end: 4, fontSize: 18 }, { start: 4, end: 5, fontSize: 24 }]);
  assert.deepEqual(props.textListRanges.map(({ start, end, indentation }) => ({ start, end, indentation })),
    [{ start: 0, end: 4, indentation: 0 }, { start: 4, end: 5, indentation: 1 }]);
  const node = textNode();
  await applyTextProperties(node, props);
  assert.deepEqual(node.sizes, [[0, 4, 18], [4, 5, 24]]);
  assert.deepEqual(node.indents, [[0, 4, 0], [4, 5, 1]]);
});

test('bulleted, plain and nested paragraphs retain their type and level on instance descendants', async () => {
  const props = exportProps('标题\n😀项目\n子项\n尾', [
    { start: 0, end: 3, type: 'NONE', level: 0 },
    { start: 3, end: 7, type: 'BULLETED', level: 1 },
    { start: 7, end: 10, type: 'BULLETED', level: 2 },
    { start: 10, end: 11, type: 'NONE', level: 0 }
  ]);
  const node = textNode(props.characters);
  await applyInstanceTextFormatting(node, props);
  assert.deepEqual(node.lists, [[0, 3, { type: 'NONE' }], [3, 8, { type: 'UNORDERED' }],
    [8, 11, { type: 'UNORDERED' }], [11, 12, { type: 'NONE' }]]);
  assert.deepEqual(node.indents, [[0, 3, 0], [3, 8, 1], [8, 11, 2], [11, 12, 0]]);
  assert.equal(node.width, 180);
  assert.equal(node.height, 240);
});

test('literal private-use glyphs and unreadable or conflicting list metadata never authorize deletion', () => {
  const characters = marker + 'literal 😀';
  for (const lists of [undefined, [], [{ start: -1, end: 2, type: 'ORDERED', level: 0 }],
    [{ start: 0, end: 200, type: 'ORDERED', level: 0 }],
    [{ start: 0, end: 2, type: 'ORDERED', level: 0 }, { start: 1, end: 3, type: 'NONE', level: 0 }],
    [{ start: 0, end: 2, type: 'UNKNOWN', level: 0 }],
    [{ start: 0, end: 2, type: 'ORDERED', level: NaN }]]) {
    const props = exportProps(characters, lists);
    assert.equal(props.characters, characters);
    assert.equal(props.textListRanges, undefined);
  }
  const unreadable = source(characters);
  Object.defineProperty(unreadable, 'listStyles', { get() { throw Error('old host'); } });
  assert.equal(transTextNode(unreadable).characters, characters);
  assert.equal(exportProps('x' + marker, [{ start: 0, end: 2, type: 'ORDERED', level: 0 }]).characters, 'x' + marker);
  assert.equal(exportProps('\u{F0123}a', [{ start: 0, end: 2, type: 'ORDERED', level: 0 }]).characters, '\u{F0123}a');
});

test('empty list paragraphs and CRLF or paragraph separators preserve text boundaries', () => {
  const characters = marker + 'a\r\n' + marker + '\u2029' + marker;
  const props = exportProps(characters, [{ start: 0, end: Array.from(characters).length, type: 'ORDERED', level: 0 }]);
  assert.equal(props.characters, 'a\r\n\u2029');
  assert.deepEqual(props.textListRanges, [{ start: 0, end: 4, type: 'ORDERED', indentation: 0 }]);
  const empty = exportProps(marker, [{ start: 0, end: 1, type: 'ORDERED', level: 0 }]);
  assert.equal(empty.characters, '');
  assert.deepEqual(empty.textListRanges, [{ start: 0, end: 0, type: 'ORDERED', indentation: 0 }]);
});

test('explicit UTF-16 partial runs avoid legacy complete-cover code-point inference', async () => {
  const segments = [{ start: 0, end: 4, fontSize: 18 }];
  const node = textNode('😀abc');
  await applyStyledTextSegments(node, segments, 'UTF16');
  assert.deepEqual(node.sizes, [[0, 4, 18]]);
  const legacy = textNode('😀abc');
  await applyStyledTextSegments(legacy, segments);
  assert.deepEqual(legacy.sizes, [[0, 5, 18]]);
  const props = exportProps('😀abc', [], [
    { start: 1, end: 2, textStyle: { fontSize: 16 } },
    { start: 2, end: 3, textStyle: { fontSize: 18 } }
  ]);
  assert.deepEqual(props.styledTextSegments.map(({ start, end }) => [start, end]), [[2, 3], [3, 4]]);
});

test('one rejected list setter or malformed range does not discard later paragraphs', () => {
  const node = textNode('abc\ndef');
  node.setRangeListOptions = (...args) => {
    if (args[0] === 0) throw Error('locked range');
    node.lists.push(args);
  };
  applyTextListRanges(node, [null, { start: -1, end: 2, type: 'ORDERED' },
    { start: 0, end: 999, type: 'ORDERED' }, { start: 0, end: 3, type: 'ORDERED' },
    { start: 4, end: 7, type: 'UNORDERED', indentation: 2 }]);
  assert.deepEqual(node.lists, [[4, 7, { type: 'UNORDERED' }]]);
  assert.deepEqual(node.indents, [[4, 7, 2]]);
});

test('mixed-size numbered paragraphs remain one text node so counters stay continuous', () => {
  const data = { characters: 'A\nB', fontSize: 20, textAutoResize: 'WIDTH_AND_HEIGHT',
    layout: { width: 100, height: 40 }, lineHeight: { unit: 'PIXELS', value: 20 },
    styledTextSegments: [{ start: 0, end: 2, fontSize: 20 }, { start: 2, end: 3, fontSize: 14 }] };
  assert.ok(getFixedMixedTextLines(data));
  assert.equal(getFixedMixedTextLines({ ...data,
    textListRanges: [{ start: 0, end: 3, type: 'ORDERED', indentation: 0 }] }), null);
});
