const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('../../SendToFigma/node_modules/esbuild');
const root = path.resolve(__dirname, '../..');
const out = esbuild.buildSync({stdin:{contents:`export { enrichEllipseArcExport, needsEllipseArcSvg } from './SendToFigma/src/nodeSerializer'; export { state } from './SendToFigma/src/state';`,resolveDir:root},bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent'});
const mod = {exports:{}};
new Function('module','exports','require',out.outputFiles[0].text)(mod,mod.exports,require);
const {enrichEllipseArcExport,needsEllipseArcSvg,state} = mod.exports;
const arc = () => ({sourceType:'ELLIPSE',arcData:{startingAngle:-Math.PI/2,endingAngle:Math.PI,innerRadius:.8}});

test('only partial ellipse arcs need native geometry evidence', () => {
  assert.equal(needsEllipseArcSvg(arc()),true);
  assert.equal(needsEllipseArcSvg({...arc(),arcData:{startingAngle:0,endingAngle:-Math.PI}}),true);
  for(const endingAngle of [0,Math.PI*2,-Math.PI*2,undefined,NaN]) {
    assert.equal(needsEllipseArcSvg({...arc(),arcData:{startingAngle:0,endingAngle}}),false);
  }
  assert.equal(needsEllipseArcSvg({...arc(),sourceType:'RECTANGLE'}),false);
});

test('arc SVG is cloned as plain evidence without overriding editable arc properties', async () => {
  state.totalNodes=1;
  const props=arc(),original=structuredClone(props);
  const markup='<svg width="20" height="20"><path d="M1 1L10 10"/></svg>';
  let exports=0;
  await enrichEllipseArcExport({width:20,height:20,children:[],exportAsync:async settings=>{assert.equal(settings.format,'SVG');exports++;return markup;}},props);
  assert.equal(exports,1);
  assert.equal(props.arcSvgMarkup,markup);
  delete props.arcSvgMarkup;
  assert.deepEqual(props,original);
});

test('unavailable SVG leaves the original ellipse usable', async () => {
  state.totalNodes=1;
  const props=arc();
  await enrichEllipseArcExport({width:20,height:20,children:[],exportAsync:async()=>''},props);
  assert.equal(props.arcSvgMarkup,undefined);
  assert.ok(props.arcData);
});
