const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const { __test } = require('../../ReceiveFromMasterGo/src/ui/mgPackage.js');
const source = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/text.ts'), 'utf8');
const start = source.indexOf('export async function applyInstanceTextFormatting(');
const end = source.indexOf('function trySetRange(', start);
const js = esbuild.transformSync(source.slice(start,end).replace('export ',''), {loader:'ts',target:'es2017'}).code;

test('slim text overrides restore 14/20 typography over an 11/16 master without resizing it', async () => {
  const font = {family:'Inter',style:'Regular'};
  const loaded = [];
  const node = {fontName:font,fontSize:11,lineHeight:{unit:'PIXELS',value:16},width:55,height:16,
    getStyledTextSegments:()=>[{fontName:font}]};
  const apply = new Function('figma','loadFontCached','ensureAvailableFontsLoaded','resolveAvailableFontName',
    'trySetText','applyStyledTextSegments',js+';return applyInstanceTextFormatting;')(
      {mixed:Symbol()},async f=>loaded.push(f),async()=>{},()=>font,fn=>fn(),async()=>{});
  const props = __test.slimInstanceDescendantProps({type:'TEXT',fontName:font,fontSize:14,
    lineHeight:{unit:'PIXELS',value:20}});
  await apply(node,props);
  assert.equal(loaded.length,2);
  assert.equal(node.fontSize,14);
  assert.deepEqual(node.lineHeight,{unit:'PIXELS',value:20});
  assert.equal(node.width,55);
  assert.equal(node.height,16);
});

test('missing requested font still restores size and line height using the loaded master font', async () => {
  const font = {family:'Inter',style:'Regular'};
  const node = {fontName:font,fontSize:11,lineHeight:{unit:'PIXELS',value:16},
    getStyledTextSegments:()=>[{fontName:font}]};
  const apply = new Function('figma','loadFontCached','ensureAvailableFontsLoaded','resolveAvailableFontName',
    'trySetText','applyStyledTextSegments',js+';return applyInstanceTextFormatting;')(
      {mixed:Symbol()},async()=>{},async()=>{},()=>null,fn=>fn(),async()=>{});
  await apply(node,{fontName:{family:'Unavailable',style:'Regular'},fontSize:14,lineHeight:{unit:'PIXELS',value:20}});
  assert.deepEqual(node.fontName,font);
  assert.equal(node.fontSize,14);
  assert.equal(node.lineHeight.value,20);
});
