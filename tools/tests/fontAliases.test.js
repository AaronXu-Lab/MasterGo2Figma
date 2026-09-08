const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({
  stdin: { contents: 'export * from "./ReceiveFromMasterGo/src/fontLoader"; export { state } from "./ReceiveFromMasterGo/src/state";', resolveDir: require('node:path').resolve(__dirname, '../..') },
  bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent'
});
const moduleObject = { exports: {} };
new Function('module', 'exports', output.outputFiles[0].text)(moduleObject, moduleObject.exports);
const { state, rebuildAvailableFontIndex, resolveAvailableFontName } = moduleObject.exports;

test('localized PingFang names resolve the same installed face without crossing regional families', () => {
  const families = [['苹方-简', 'PingFang SC'], ['苹方-繁', 'PingFang TC'], ['苹方-港', 'PingFang HK'], ['苹方-澳', 'PingFang MO']];
  const styles = [['常规体', 'Regular'], ['中黑体', 'Medium'], ['中粗体', 'Semibold'], ['细体', 'Light'], ['纤细体', 'Thin'], ['极细体', 'Ultralight']];
  state.documentFonts = families.flatMap(([, family]) => styles.map(([, style]) => ({ fontName: { family, style } })));
  rebuildAvailableFontIndex();
  for (const [localizedFamily, family] of families) for (const [localizedStyle, style] of styles) {
    assert.deepEqual(resolveAvailableFontName({ family: localizedFamily, style: localizedStyle }), { family, style });
  }
  assert.equal(resolveAvailableFontName({ family: '不存在的字体', style: '常规体' }), null);
  assert.equal(resolveAvailableFontName({ family: '苹方-简', style: '不存在的字重' }), null);
  // An alias is not permission to substitute SC for a missing TC face.
  state.documentFonts = [{ fontName: { family: 'PingFang SC', style: 'Regular' } }];
  rebuildAvailableFontIndex();
  assert.equal(resolveAvailableFontName({ family: '苹方-繁', style: '常规体' }), null);
  assert.deepEqual(resolveAvailableFontName({ family: 'PingFang SC Regular', style: 'Pingfang sc regular' }), { family: 'PingFang SC', style: 'Regular' });
  assert.deepEqual(resolveAvailableFontName({ family: 'PingFang SC', style: 'Pingfang sc regular' }), { family: 'PingFang SC', style: 'Regular' });
  assert.equal(resolveAvailableFontName({ family: 'PingFang SC', style: 'Bold' }), null);
});
