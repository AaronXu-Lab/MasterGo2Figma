const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({ entryPoints: [require('node:path').resolve(__dirname, '../../ReceiveFromMasterGo/src/appliers/maskFill.ts')], bundle:true, format:'cjs', platform:'node', write:false });
const mod = {exports:{}};
new Function('module','exports',output.outputFiles[0].text)(mod,mod.exports);
const {isBackdropCoverageMask} = mod.exports;
test('background blur coverage masks do not add a second black veil', () => {
  const fill = {type:'SOLID',color:{r:0,g:0,b:0},opacity:0.4};
  const effects = [{type:'BACKGROUND_BLUR',radius:5.33,visible:true}];
  assert.equal(isBackdropCoverageMask([fill],[],effects),true);
  assert.equal(isBackdropCoverageMask([fill],[],[]),false);
  assert.equal(isBackdropCoverageMask([fill],[],[{...effects[0],visible:false}]),false);
  assert.equal(isBackdropCoverageMask([{...fill,opacity:1}],[],effects),false);
  assert.equal(isBackdropCoverageMask([{...fill,color:{r:1,g:0,b:0}}],[],effects),false);
  assert.equal(isBackdropCoverageMask([fill],[{...fill,opacity:1}],effects),false);
  assert.equal(isBackdropCoverageMask([fill],[{type:'SOLID',visible:true,opacity:1,color:{r:1,g:1,b:1}}],effects),true);
});
