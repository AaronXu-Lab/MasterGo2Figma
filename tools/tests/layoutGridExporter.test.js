const test=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('../../SendToFigma/node_modules/esbuild');
const result=esbuild.buildSync({entryPoints:[require.resolve('../../SendToFigma/src/layoutGridExporter.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
const {readResolvedLayoutGrids}=mod.exports;
const grids=[{gridType:'COLUMNS',count:24,gutterSize:20,alignment:'STRETCH'}];
test('grid getter resolves only after selection UI turn, then restores page and selection',async()=>{
 const original={id:'original'},otherPage={};let selection=[original],ready=false;
 const node={get layoutGrids(){return ready?grids:[];}};
 const page={get selection(){return selection;},set selection(v){selection=v;if(v[0]===node)setTimeout(()=>{ready=true;},0);}};
 const document={currentPage:otherPage};
 const actual=await readResolvedLayoutGrids(node,page,document);
 assert.equal(actual[0].count,24);assert.deepEqual(selection,[original]);assert.equal(document.currentPage,otherPage);
});
test('grid resolution failure restores selection and page',async()=>{
 const original={id:'original'},otherPage={};let selection=[original],selected=false;
 const node={get layoutGrids(){if(selected)throw Error('unavailable');return [];}};
 const page={get selection(){return selection;},set selection(v){selection=v;selected=v[0]===node;}};
 const document={currentPage:otherPage};
 await assert.rejects(readResolvedLayoutGrids(node,page,document),/unavailable/);
 assert.deepEqual(selection,[original]);assert.equal(document.currentPage,otherPage);
});
test('resolved grids need no selection or page changes',async()=>{
 const document={get currentPage(){throw Error('unneeded');}};
 assert.equal((await readResolvedLayoutGrids({layoutGrids:grids},{},document))[0].count,24);
});
