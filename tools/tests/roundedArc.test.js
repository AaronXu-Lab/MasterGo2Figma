const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const esbuild=require('../../ReceiveFromMasterGo/node_modules/esbuild');
const js=esbuild.transformSync(fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/roundedArc.ts'),'utf8').replace('export function','function'),{loader:'ts'}).code;
const network=new Function(js+';return roundedArcNetwork')();

test('rounded rings produce a connected closed contour in both sweep directions',()=>{
 for(const innerRadius of [0,.8]) for(const sweep of [-Math.PI*1.6,Math.PI*.3]) {
  const data={layout:{width:200,height:120},arcCornerRadius:4,arcData:{innerRadius,startingAngle:-Math.PI/2,endingAngle:-Math.PI/2+sweep}};
  const n=network(data),loop=n.regions[0].loops[0];
  assert.equal(loop.length,n.segments.length);
  for(let i=0;i<loop.length;i++) assert.equal(n.segments[loop[i]].end,n.segments[loop[(i+1)%loop.length]].start);
  assert.equal(n.vertices.filter(v=>v.cornerRadius>0).length,innerRadius?4:3);
  assert.ok(n.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));
 }
});
test('unrounded and full ellipses retain native ellipse geometry',()=>{
 const data={layout:{width:200,height:200},arcCornerRadius:4,arcData:{innerRadius:.8,startingAngle:0,endingAngle:Math.PI*2}};
 assert.equal(network(data),null);
 assert.equal(network({...data,arcCornerRadius:0}),null);
});
