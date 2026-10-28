const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({entryPoints:[require('node:path').resolve(__dirname,'../../ReceiveFromMasterGo/src/appliers/booleanContours.ts')],bundle:true,format:'cjs',platform:'node',write:false});
const mod = {exports:{}};
new Function('module','exports',output.outputFiles[0].text)(mod,mod.exports);
const close = mod.exports.closeCoincidentBooleanContour;
const contour = () => ({vertices:[{x:21.051294,y:42.102539},{x:0,y:21.050797},{x:21.051353,y:0},{x:42.100994,y:21.050797},{x:21.051353,y:42.102539}],segments:[{start:0,end:1,tangentStart:{x:-11.6066,y:0}},{start:1,end:2},{start:2,end:3},{start:3,end:4}],regions:[]});
test('coincident open circle becomes an explicit editable boolean hole without moving vertices',()=>{
  const source=contour(), snapshot=JSON.stringify(source), result=close(source);
  assert.equal(JSON.stringify(source),snapshot);
  assert.equal(result.vertices,source.vertices);
  assert.deepEqual(result.segments.at(-1),{start:4,end:0});
  assert.deepEqual(result.regions,[{windingRule:'EVENODD',loops:[[0,1,2,3,4]]}]);
  assert.equal(close(result),result);
});
test('real gaps, branches, disconnected contours and existing regions remain unchanged',()=>{
  const gap=contour();gap.vertices[4].x+=0.01;assert.equal(close(gap),gap);
  const branch=contour();branch.segments.push({start:1,end:4});assert.equal(close(branch),branch);
  const disjoint=contour();disjoint.vertices.push({x:2,y:2},{x:3,y:3});disjoint.segments.push({start:5,end:6});assert.equal(close(disjoint),disjoint);
  const filled=contour();filled.regions=[{windingRule:'NONZERO',loops:[[0,1,2,3]]}];assert.equal(close(filled),filled);
  const line=contour();line.vertices=line.vertices.map(v=>({...v,y:0}));assert.equal(close(line),line);
});

test('actual boolean combination closes its operand before Figma computes the hole',async()=>{
  const bundle=esbuild.buildSync({entryPoints:[require('node:path').resolve(__dirname,'../../ReceiveFromMasterGo/src/appliers/container.ts')],bundle:true,format:'cjs',platform:'node',write:false});
  const loaded={exports:{}};
  const operand={type:'VECTOR',name:'inner',vectorNetwork:contour(),async setVectorNetworkAsync(value){this.vectorNetwork=value;}};
  const other={type:'RECTANGLE'};
  const result={type:'BOOLEAN_OPERATION',children:[],appendChild(child){this.children.push(child);}};
  const api={createBooleanOperation(){assert.equal(operand.vectorNetwork.regions.length,1);return result;}};
  new Function('module','exports','figma',bundle.outputFiles[0].text)(loaded,loaded.exports,api);
  const parent={children:[],insertChild(index,node){this.children.splice(index,0,node);}};
  const shell={parent,children:[operand,other],remove(){this.removed=true;}};
  parent.children.push(shell);
  assert.equal(await loaded.exports.combineBooleanShell(shell,{booleanOperation:'EXCLUDE'},async()=>{}),result);
  assert.deepEqual(result.children,[operand,other]);
  assert.equal(shell.removed,true);
});
