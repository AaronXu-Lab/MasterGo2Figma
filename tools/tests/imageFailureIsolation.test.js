const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
function compile(file) {
  const out = esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../..',file)],bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent',external:['heic-to/csp']});
  const m = {exports:{}};
  new Function('module','exports','require',out.outputFiles[0].text)(m,m.exports,require);
  return m.exports;
}
const {safeSetFills,safeSetStrokes,MISSING_IMAGE_PLACEHOLDER_COLOR} = compile('ReceiveFromMasterGo/src/appliers/universal.ts');
const {prepareImageAssetBytes} = compile('ReceiveFromMasterGo/ui-src/imageAssets.js');
for (const [target,setPaints] of [['fills',safeSetFills],['strokes',safeSetStrokes]]) {
  test(`a rejected image preserves valid sibling ${target} and subsequent nodes`, () => {
    let value = [{type:'SOLID',color:{r:1,g:0,b:0}}];
    const node = {name:'test'};
    Object.defineProperty(node,target,{get:()=>value,set:paints=>{
      if (paints.some(p=>p.type==='IMAGE'&&p.imageHash==='bad')) throw Error('invalid image');
      value = paints;
    }});
    const transform = [[1,0,.2],[0,1,.3]];
    setPaints(node,[{type:'SOLID',color:{r:0,g:0,b:0}},{type:'IMAGE',imageHash:'bad',scaleMode:'FILL'},
      {type:'GRADIENT_LINEAR',gradientTransform:transform,gradientStops:[]},
      {type:'IMAGE',imageHash:'good',scaleMode:'CROP',imageTransform:transform}]);
    assert.equal(value.length,4);
    assert.deepEqual(value[1].color,MISSING_IMAGE_PLACEHOLDER_COLOR);
    assert.deepEqual(value[2].gradientTransform,transform);
    assert.deepEqual(value[3].imageTransform,transform);
    const next = {[target]:[]};
    setPaints(next,[{type:'SOLID',color:{r:0,g:1,b:0}}]);
    assert.equal(next[target][0].color.g,1);
  });
}
test('HEIF conversion stays local to the asset and ordinary bytes pass through',async()=>{
  const heif = Uint8Array.from(Buffer.from('000000186674797068656963','hex'));
  const png = new Uint8Array([137,80,78,71]);
  assert.equal(await prepareImageAssetBytes(heif,'image',async()=>png),png);
  assert.equal(await prepareImageAssetBytes(png,'x.png',()=>{throw Error('must not decode');}),png);
  assert.equal(await prepareImageAssetBytes(heif,'x.heic',async()=>{throw Error('broken HEIF');}),heif);
  assert.equal(await prepareImageAssetBytes(heif,'next.heic',async()=>png),png);
});

test('WebP is recognized inside legacy .bin assets and failed conversion does not stop later assets', async () => {
  const webp = Uint8Array.from(Buffer.from('524946460400000057454250', 'hex'));
  const png = Uint8Array.from([137, 80, 78, 71]);
  const neverHeif = () => { throw Error('WebP is not HEIF'); };
  assert.equal(await prepareImageAssetBytes(webp, 'old.bin', neverHeif, async bytes => {
    assert.equal(bytes, webp);
    return png;
  }), png);
  assert.equal(await prepareImageAssetBytes(webp, 'bad.bin', neverHeif, async () => { throw Error('broken WebP'); }), webp);
  assert.equal(await prepareImageAssetBytes(webp, 'next.webp', neverHeif, async () => png), png);
  const wav = Uint8Array.from(Buffer.from('524946460400000057415645', 'hex'));
  assert.equal(await prepareImageAssetBytes(wav, 'audio.bin', neverHeif, neverHeif), wav);
});

test('WebP export extension uses the RIFF signature rather than RIFG', () => {
  const { detectImageExtension } = compile('SendToFigma/src/imageExporter.ts');
  assert.equal(detectImageExtension(Uint8Array.from(Buffer.from('524946460400000057454250', 'hex'))), 'webp');
  assert.equal(detectImageExtension(Uint8Array.from(Buffer.from('524946470400000057454250', 'hex'))), 'bin');
});

test('incomplete asset chunks are recorded and released without poisoning the next asset',()=>{
  // Compile the actual stream completion handler with a small host mock.
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname,'../../ReceiveFromMasterGo/src/code.ts'),'utf8');
  const finish = source.slice(source.indexOf('function finishImportAsset('),source.indexOf('function startImportPage('));
  const concat = source.slice(source.indexOf('function concatBytes('),source.indexOf('function clearPendingImportAssets('));
  const js = esbuild.transformSync(finish+'\n'+concat,{loader:'ts',target:'es2017'}).code;
  const pending = {bad:{size:4,chunks:[new Uint8Array([1])],keys:['bad']},good:{size:1,chunks:[new Uint8Array([2])],keys:['good']}};
  const state = {imageHashByAssetName:{}};
  const missing = [];
  const run = new Function('requireImportSession','pendingImportAssets','state','figma','addImportTiming','addImportTimingCount','recordStreamedMissingImage','console',js+'\nreturn finishImportAsset;')(
    ()=>({}),pending,state,{createImage:()=>({hash:'valid'})},()=>{},()=>{},key=>missing.push(key),{warn:()=>{}});
  assert.doesNotThrow(()=>run({transferId:'t',path:'bad'}));
  assert.deepEqual(missing,['bad']);
  assert.equal(pending.bad,undefined);
  run({transferId:'t',path:'good'});
  assert.equal(state.imageHashByAssetName.good,'valid');
  assert.equal(state.imageHashByAssetName.bad,undefined);
  assert.deepEqual(pending,{});
});
