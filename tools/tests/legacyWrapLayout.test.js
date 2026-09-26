const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const result = esbuild.buildSync({entryPoints:[require.resolve('../../ReceiveFromMasterGo/src/legacyWrapLayout.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const mod = {exports:{}};
new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
const {restoreLegacyWrapLayout} = mod.exports;
function fixture(points) {
  const children=points.map(([x,y,w=82,h=32],i)=>({id:String(i),props:{scence:{visible:true},layout:{x,y,width:w,height:h}}}));
  return Object.fromEntries([{id:'parent',childIds:children.map(c=>c.id),props:{layout:{layoutMode:'HORIZONTAL',width:172}}},...children].map(c=>[c.id,c]));
}
test('0920 legacy menus recover zero row gap; filter rows recover 16px gap',()=>{
  for(const gap of [0,16]) {
    const r=fixture([[0,0],[90,0],[0,32+gap],[90,32+gap],[0,64+gap*2]]);
    assert.equal(restoreLegacyWrapLayout(r),1);
    assert.equal(r.parent.props.layout.layoutWrap,'WRAP');
    assert.equal(r.parent.props.layout.counterAxisSpacing,gap);
    assert.equal(restoreLegacyWrapLayout(r),0);
  }
});
test('overflow, staggered alignment, absolute overlays and explicit NO_WRAP do not become wrapping',()=>{
  for(const points of [[[0,0],[90,0],[180,0]],[[0,0],[90,5],[180,0]],[[0,0],[0,32],[0,64]],[[0,0],[90,0],[0,20]]]) {
    assert.equal(restoreLegacyWrapLayout(fixture(points)),0);
  }
  const r=fixture([[0,0],[90,0],[0,32]]);
  r['2'].props.layout.layoutPositioning='ABSOLUTE';
  assert.equal(restoreLegacyWrapLayout(r),0);
  delete r['2'].props.layout.layoutPositioning;
  r.parent.props.layout.layoutWrap='NO_WRAP';
  assert.equal(restoreLegacyWrapLayout(r),0);
});
test('missing/slim geometry, hidden nodes and irregular row gaps are not inferred',()=>{
  const r=fixture([[0,0],[90,0],[0,32]]);
  delete r['1'].props.layout.width;
  assert.equal(restoreLegacyWrapLayout(r),0);
  const hidden=fixture([[0,0],[90,0],[0,32]]);
  hidden['2'].props.scence.visible=false;
  assert.equal(restoreLegacyWrapLayout(hidden),0);
  assert.equal(restoreLegacyWrapLayout(fixture([[0,0],[90,0],[0,32],[90,32],[0,80]])),0);
});

test('MasterGo nested flexWrap/crossAxisSpacing survive export, including zero',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(require.resolve('../../SendToFigma/src/serializers/universal.ts'),'utf8');
  const start=source.indexOf('export function getLayoutWrap(');
  const end=source.indexOf('export function getAxisAlign(',start);
  const js=esbuild.transformSync(source.slice(start,end).replace(/export /g,''),{loader:'ts'}).code;
  const read=(node,key,fallback)=>node[key] ?? node.autoLayout?.[key] ?? fallback;
  const get=new Function('readAutoLayoutProperty',js+';return {getLayoutWrap,getCounterAxisSpacing};')(read);
  for(const gap of [0,16]) {
    const node={autoLayout:{flexWrap:'WRAP',crossAxisSpacing:gap}};
    assert.equal(get.getLayoutWrap(node),'WRAP');
    assert.equal(get.getCounterAxisSpacing(node),gap);
  }
  assert.equal(get.getLayoutWrap({layoutWrap:'NO_WRAP'}),'NO_WRAP');
  assert.equal(get.getCounterAxisSpacing({autoLayout:{crossAxisSpacing:null}}),undefined);
  assert.equal(get.getLayoutWrap({}),undefined);
});
