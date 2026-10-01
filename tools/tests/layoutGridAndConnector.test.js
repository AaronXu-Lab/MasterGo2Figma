const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const path = require('node:path');
function load(file) {
  const result = esbuild.buildSync({entryPoints:[path.resolve(__dirname,file)],bundle:true,platform:'node',format:'cjs',write:false});
  const mod={exports:{}};
  new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
  return mod.exports;
}
const {normalizeLayoutGrids}=load('../../shared/layoutGridUtils.ts');
const {createConnectorRoutePoints}=load('../../shared/connectorUtils.ts');
test('MasterGo grids retain visibility, colour, sizing, alignment and zero offsets',()=>{
  const color={r:1,g:61/255,b:0,a:0.12};
  assert.deepEqual(normalizeLayoutGrids([{gridType:'COLUMNS',alignment:'STRETCH',count:24,gutterSize:20,sectionSize:8,offset:0,isVisible:false,color}]),[{pattern:'COLUMNS',alignment:'STRETCH',count:24,gutterSize:20,offset:0,visible:false,color}]);
  assert.equal(normalizeLayoutGrids([{gridType:'ROWS',alignment:'RIGHT',count:3,gutterSize:8,sectionSize:40}])[0].alignment,'MAX');
  assert.equal(normalizeLayoutGrids([{gridType:'GRID',sectionSize:16}])[0].sectionSize,16);
});
test('outward-facing ports use native bounds for turnaround instead of reversing at the port',()=>{
  assert.deepEqual(createConnectorRoutePoints({x:0,y:190},{x:176,y:0},{magnet:'BOTTOM'},{magnet:'LEFT'},'ELBOWED',{width:176,height:220}),[
    {x:0,y:190},{x:0,y:220},{x:88,y:220},{x:88,y:0},{x:176,y:0}
  ]);
  assert.deepEqual(createConnectorRoutePoints({x:0,y:328},{x:176,y:30},{magnet:'RIGHT'},{magnet:'TOP'},'ELBOWED',{width:176,height:328}),[
    {x:0,y:328},{x:88,y:328},{x:88,y:0},{x:176,y:0},{x:176,y:30}
  ]);
  assert.deepEqual(createConnectorRoutePoints({x:0,y:0},{x:0,y:40},{magnet:'BOTTOM'},{magnet:'TOP'},'ELBOWED',{width:1,height:40}),[{x:0,y:0},{x:0,y:40}]);
});

test('turnaround paths use the gap between attached node edges',()=>{
  const left=createConnectorRoutePoints({x:0,y:190},{x:176,y:0},{magnet:'BOTTOM',width:224},{magnet:'LEFT'},'ELBOWED',{width:176,height:220});
  assert.equal(left[2].x,144);
  const right=createConnectorRoutePoints({x:0,y:328},{x:176,y:30},{magnet:'RIGHT'},{magnet:'TOP',width:224},'ELBOWED',{width:176,height:328});
  assert.equal(right[1].x,32);
});
test('grid colors are detached from host objects before selection changes',()=>{
  const color={r:1,g:0,b:0,a:.12};
  const result=normalizeLayoutGrids([null,{gridType:'GRID',sectionSize:10,color}]);
  color.a=0;assert.equal(result[0].color.a,.12);
});
