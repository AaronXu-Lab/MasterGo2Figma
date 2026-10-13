const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({
  entryPoints: ['ReceiveFromMasterGo/src/appliers/text.ts'],
  bundle: true, format: 'cjs', platform: 'node', write: false
});
const m = { exports: {} };
const figma = {
  listAvailableFontsAsync: async () => [{ fontName: { family: 'Inter', style: 'Regular' } }],
  loadFontAsync: async () => {}
};
new Function('module', 'exports', 'figma', output.outputFiles[0].text)(m, m.exports, figma);

test('MasterGo truncating modes keep the stored text in a fixed ellipsising box', async () => {
  for (const mode of ['TRUNCATE', 'TRUNCATE_AND_AUTO_HEIGHT']) {
    let resize = 'WIDTH_AND_HEIGHT';
    const node = {
      name: 'Long text', width: 110, height: 20,
      get textAutoResize() { return resize; },
      set textAutoResize(value) {
        if (!['NONE', 'HEIGHT', 'WIDTH_AND_HEIGHT'].includes(value)) throw Error('Invalid Figma mode');
        resize = value;
      }
    };
    await m.exports.applyTextProperties(node, {
      characters: 'Full stored text that must remain editable',
      fontName: { family: 'Inter', style: 'Regular' },
      textAutoResize: mode, fontSize: 14
    });
    assert.equal(node.textAutoResize, 'NONE');
    assert.equal(node.textTruncation, 'ENDING');
    assert.equal(node.width, 110);
    assert.equal(node.height, 20);
    assert.equal(node.characters, 'Full stored text that must remain editable');
  }
});
