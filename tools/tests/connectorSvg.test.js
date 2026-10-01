const test=require('node:test');const assert=require('node:assert/strict');
const esbuild=require('../../SendToFigma/node_modules/esbuild');
function load(file){const r=esbuild.buildSync({entryPoints:[require.resolve(file)],bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};new Function('module','exports',r.outputFiles[0].text)(m,m.exports);return m.exports;}
const {captureConnectorSvg,takeConnectorSvg,clearConnectorSvgCache}=load('../../SendToFigma/src/connectorSvgExporter.ts');
const {localConnectorSvg}=load('../../ReceiveFromMasterGo/src/appliers/connectorSvg.ts');
const markup='<svg viewBox="0 0 1078 118.8"><path d="M1 1L1077 1L1077 80L1 80L1 113"/></svg>';
test('native connector outline retains render offset and logical bounds without scaling',async()=>{
 clearConnectorSvgCache();const node={id:'c',type:'CONNECTOR',width:1076,height:112,opacity:1,absoluteTransform:[[1,0,2679],[0,1,6055]],absoluteRenderBounds:{x:2678,y:6054,width:1078,height:119},exportAsync:async()=>markup};
 await captureConnectorSvg(node);const connectorSvg=takeConnectorSvg('c');
 assert.deepEqual(connectorSvg.offset,{x:-1,y:-1});assert.equal(takeConnectorSvg('c'),undefined);
 const data={sourceType:'CONNECTOR',connectorSvg,layout:{width:1076,height:112}};
 const svg=localConnectorSvg(data);assert.match(svg,/viewBox="0 0 1076 112"/);assert.match(svg,/translate\(-1,-1\)/);assert.doesNotMatch(svg,/scale\(/);
 assert.equal(localConnectorSvg({...data,connectorSvg:{...connectorSvg,width:1200}}),null);
 assert.equal(localConnectorSvg({...data,blend:{opacity:.5}}),null);
});
test('straight and transformed connectors avoid expensive native SVG export',async()=>{
 let calls=0;const node={id:'s',type:'CONNECTOR',width:1,height:100,opacity:1,absoluteTransform:[[1,0,0],[0,1,0]],exportAsync:async()=>{calls++;return markup;}};
 await captureConnectorSvg(node);await captureConnectorSvg({...node,width:100,absoluteTransform:[[0,-1,0],[1,0,0]]});assert.equal(calls,0);
});
