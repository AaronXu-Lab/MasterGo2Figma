const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const esbuild=require('../../ReceiveFromMasterGo/node_modules/esbuild');
const source=fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/code.ts'),'utf8');
function extract(start,end){return esbuild.transformSync(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),{loader:'ts',target:'es2017'}).code;}
test('local text styles resolve PostScript aliases against available fonts',async()=>{
 const session={figmaStyleIdByRef:{}};const made=[];const loaded=[];
 const code=extract('async function importSessionStyles(','// Solid/gradient paints');
 const run=new Function('requireImportSession','figma','ensureAvailableFontsLoaded','resolveAvailableFontName','loadFontCached',code+';return importSessionStyles;')(()=>session,{createTextStyle(){const s={id:'S1'};made.push(s);return s;}},async()=>{},()=>({family:'PingFang SC',style:'Semibold'}),async f=>loaded.push(f));
 await run({styles:[{id:'source',name:'Heading',styleType:'TEXT',fontName:{family:'PingFangSC',style:'Semibold'},fontSize:64}]});
 assert.equal(made[0].fontName.family,'PingFang SC');assert.equal(made[0].fontSize,64);assert.equal(session.figmaStyleIdByRef.source,'S1');assert.equal(loaded[0].family,'PingFang SC');
});
test('mixed typography binds only named ranges and leaves local overrides intact',async()=>{
 const calls=[];const session={figmaStyleIdByRef:{body:'S1'}};
 const code=extract('async function applyImportedStyleBindings(','function startImportAsset(');
 const run=new Function('activeImportSession',code+';return applyImportedStyleBindings;')(session);
 const node={type:'TEXT',characters:'BodyCost',setTextStyleIdAsync(){throw Error('must not bind entire mixed text');},async setRangeTextStyleIdAsync(...a){calls.push(a);}};
 await run(node,{textStyleRanges:[{start:0,end:4,styleRef:'body'},{start:4,end:8,styleRef:'missing'}]});
 assert.deepEqual(calls,[[0,4,'S1']]);
});
test('merged files namespace range style references',()=>{
 const engine=fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/ui-src/engine.js'),'utf8');
 const code=engine.slice(engine.indexOf('function prepareRecordForImport('),engine.indexOf('// Cheap pre-flight'));
 const run=new Function('prepareImportProps',code+';return prepareRecordForImport;')(()=>{});
 const record={id:'text',textStyleRanges:[{start:0,end:4,styleRef:'style'}]};run(record,'file:',{});
 assert.equal(record.textStyleRanges[0].styleRef,'file:style');
});
