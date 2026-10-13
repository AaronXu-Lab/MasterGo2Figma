const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const esbuild=require('../../SendToFigma/node_modules/esbuild');
const root=path.resolve(__dirname,'../..');
const code=esbuild.buildSync({stdin:{contents:`export * from './SendToFigma/src/serializers/svgImageTruth';export * from './SendToFigma/src/imageExporter';export * from './SendToFigma/src/imagePaintExporter';export {state} from './SendToFigma/src/state';`,resolveDir:root},bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent'}).outputFiles[0].text;
let createProbe;
function cloneNode(source) {
 return {type:'FRAME',opacity:1,width:805,height:138,...source,clone(){
  return Object.assign(createProbe(),{type:'FRAME',opacity:1,fills:source.fills,strokes:[],effects:[],children:[]});
 }};
}
const mg={document:{currentPage:{appendChild:()=>{}}}};
const mod={exports:{}};new Function('module','exports','require','mg',code)(mod,mod.exports,require,mg);const api=mod.exports;
const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const uri='data:image/png;base64,'+bytes.toString('base64');
const svg=`<svg><pattern x="42" y="33" width="805" height="138" patternUnits="userSpaceOnUse"><image x="0" y="0" width="1280" height="720" transform="translate(0,0) scale(.625,.625)" xlink:href="${uri}"/></pattern></svg>`;
const context=()=>({bySourceRef:{},assets:[],missingImageAssetCount:0});
test('crop window recovers from native image pattern without export padding',()=>{
 const p=api.parseSvgImageTruth(svg,805,138);assert.ok(p);
 assert.ok(Math.abs(p.imageTransform[0][0]-805/800)<1e-12);
 assert.ok(Math.abs(p.imageTransform[1][1]-138/450)<1e-12);
 assert.equal(Math.abs(p.imageTransform[0][2]),0);
 assert.equal(api.parseSvgImageTruth(svg+svg,805,138),null);
 assert.equal(api.parseSvgImageTruth(svg.replace('scale(.625,.625)','skewX(20)'),805,138),null);
});
test('stretch and explicit image matrices survive export without aliasing',()=>{
 api.state.activeImageAssetContext=context();
 const a=api.createImageFillJson({imageRef:'raw',scaleMode:'STRETCH'});
 assert.equal(a.scaleMode,'CROP');assert.deepEqual(a.imageTransform,[[1,0,0],[0,1,0]]);
 const matrix=[[2,0,-.2],[0,3,-.4]];
 const b=api.createImageFillJson({imageRef:'raw',scaleMode:'CROP',imageTransform:matrix});
 matrix[0][0]=9;assert.equal(b.imageTransform[0][0],2);
});
test('native adjusted asset clears all baked filters and keeps node geometry outside the paint',async()=>{
 api.state.activeImageAssetContext=context();
 const source={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1,exposure:.2}};
 const paint=api.createImageFillJson(source);
 const json={geometry:{fills:[paint]}};
 createProbe=()=>({exportAsync:async({format})=>{assert.equal(format,'PNG');return new Uint8Array(bytes);},remove:()=>{}});
 await api.enrichImagePaintTruth(cloneNode({id:'sample',width:805,height:138,fills:[source],exportAsync:async()=>svg}),json);
 assert.equal(paint.filters,undefined);assert.equal(paint.imageRef,'image-002');
 assert.deepEqual([...api.state.activeImageAssetContext.assets[1].bytes],[...bytes]);
 assert.deepEqual(paint.imageTransform,[[1,0,0],[0,1,0]]);
 assert.deepEqual([...api.decodeImageDataUri(uri,bytes.length)],[...bytes]);
 assert.equal(api.decodeImageDataUri(uri,bytes.length-1),null);
});
test('unsupported native image pattern preserves original fill and filters',async()=>{
 api.state.activeImageAssetContext=context();
 const paint=api.createImageFillJson({imageRef:'raw',scaleMode:'CROP',filters:{exposure:.2}});
 const before=JSON.stringify(paint);const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth({id:'sample',width:805,height:138,exportAsync:async()=>svg+svg},{geometry:{fills:[paint]}});}finally{api.state.logDiagnostic=old;}
 assert.equal(JSON.stringify(paint),before);assert.equal(api.state.activeImageAssetContext.assets.length,1);
});

test('container image recovery isolates the paint while preserving editable children and other fills',async()=>{
 api.state.activeImageAssetContext=context();
 const source={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1,exposure:.2},alpha:.4,isVisible:true};
 const solid={type:'SOLID',color:{r:1,g:1,b:1,a:1}};
 const children=[{id:'text',characters:'Editable'}];
 const node={id:'card',width:805,height:138,children,fills:[solid,source],exportAsync:()=>{throw Error('Must not export descendants');}};
 const paint=api.createImageFillJson(source);const json={geometry:{fills:[{type:'SOLID'},paint]}};
 let removed=0;let probe;
 createProbe=()=>probe={exportAsync:async({format})=>{assert.equal(format,'PNG');return new Uint8Array(bytes);},remove:()=>removed++};
 await api.enrichImagePaintTruth(cloneNode(node),json);
 assert.equal(removed,1);assert.equal(probe.width,805);assert.equal(probe.height,138);
 assert.deepEqual(probe.strokes,[]);assert.deepEqual(probe.effects,[]);
 assert.equal(probe.fills.length,2);assert.equal(probe.fills[1].alpha,1);
 assert.equal(probe.fills[0].isVisible,false);
 assert.equal(source.alpha,.4);assert.deepEqual(source.filters,{hue:.1,exposure:.2});
 assert.equal(paint.opacity,.4);assert.equal(paint.filters,undefined);
 assert.equal(json.geometry.fills[0].type,'SOLID');assert.equal(node.children,children);
 assert.equal(children[0].characters,'Editable');
});

test('multiple image paints have independent derived assets and hidden paints stay untouched',async()=>{
 api.state.activeImageAssetContext=context();
 const sources=[
  {type:'IMAGE',imageRef:'raw1',scaleMode:'CROP',filters:{hue:.1},isVisible:true},
  {type:'IMAGE',imageRef:'raw2',scaleMode:'CROP',filters:{hue:.2},isVisible:false},
  {type:'IMAGE',imageRef:'raw3',scaleMode:'CROP',filters:{hue:.3},isVisible:true}
 ];
 const paints=sources.map(api.createImageFillJson);const hidden=JSON.stringify(paints[1]);
 const seen=[];let removed=0;
 createProbe=()=>({exportAsync:async function({format}){assert.equal(format,'PNG');seen.push(this.fills.find(p=>p.isVisible!==false).imageRef);return new Uint8Array(bytes);},remove:()=>removed++});
 await api.enrichImagePaintTruth(cloneNode({id:'multi',width:805,height:138,fills:sources}),{geometry:{fills:paints}});
 assert.deepEqual(seen,['raw1','raw3']);assert.equal(removed,2);
 assert.notEqual(paints[0].imageRef,paints[2].imageRef);
 assert.equal(JSON.stringify(paints[1]),hidden);
 assert.ok(api.state.activeImageAssetContext.bySourceRef['native-png:multi:fill:0']);
 assert.ok(api.state.activeImageAssetContext.bySourceRef['native-png:multi:fill:2']);
});

test('one native probe failure cleans up and does not discard a later image paint',async()=>{
 api.state.activeImageAssetContext=context();
 const sources=[1,2].map(n=>({type:'IMAGE',imageRef:'raw'+n,scaleMode:'CROP',filters:{hue:.1}}));
 const paints=sources.map(api.createImageFillJson);const first=JSON.stringify(paints[0]);
 let count=0,removed=0;
 createProbe=()=>{const index=count++;return {exportAsync:async()=>{if(index===0)throw Error('Native export failed');return new Uint8Array(bytes);},remove:()=>removed++};};
 const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth(cloneNode({id:'multi',width:805,height:138,children:[{}],fills:sources}),{geometry:{fills:paints}});}finally{api.state.logDiagnostic=old;}
 assert.equal(removed,2);assert.equal(JSON.stringify(paints[0]),first);
 assert.equal(paints[1].filters,undefined);
});

test('ambiguous isolated SVG cleans up without mutating the original image',async()=>{
 api.state.activeImageAssetContext=context();
 const source={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{exposure:.2}};
 const paint=api.createImageFillJson(source);const before=JSON.stringify(paint);let removed=0;
 createProbe=()=>({exportAsync:async()=>svg+svg,remove:()=>removed++});
 const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth(cloneNode({id:'card',width:805,height:138,children:[{}],fills:[source]}),{geometry:{fills:[paint]}});}finally{api.state.logDiagnostic=old;}
 assert.equal(removed,1);assert.equal(JSON.stringify(paint),before);
 assert.equal(api.state.activeImageAssetContext.assets.length,1);
});

test('an unadjusted SVG is never accepted as a baked hue image',async()=>{
 api.state.activeImageAssetContext=context();
 const source={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1}};
 const paint=api.createImageFillJson(source);const before=JSON.stringify(paint);let removed=0;
 createProbe=()=>({exportAsync:async()=>svg,remove:()=>removed++});
 const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth(cloneNode({id:'card',width:805,height:138,fills:[source]}),
  {geometry:{fills:[paint]}});}finally{api.state.logDiagnostic=old;}
 assert.equal(removed,1);assert.equal(JSON.stringify(paint),before);
});

test('unreadable source paints retain serialized data without aborting the node',async()=>{
 api.state.activeImageAssetContext=context();
 const paint=api.createImageFillJson({type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1}});
 const before=JSON.stringify(paint);let created=0;createProbe=()=>{created++;throw Error('Unexpected probe');};
 const node={id:'unreadable',width:805,height:138,children:[{}],get fills(){throw Error('Unavailable paint');}};
 const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth(node,{geometry:{fills:[paint]}});}finally{api.state.logDiagnostic=old;}
 assert.equal(created,0);assert.equal(JSON.stringify(paint),before);
});

test('native probe OOM is propagated after cleanup instead of continuing export',async()=>{
 api.state.activeImageAssetContext=context();
 const source={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1}};
 const paint=api.createImageFillJson(source);let removed=0;
 createProbe=()=>({exportAsync:async()=>{throw Error('out of memory');},remove:()=>removed++});
 await assert.rejects(api.enrichImagePaintTruth(cloneNode({id:'card',width:805,height:138,children:[{}],fills:[source]}),
  {geometry:{fills:[paint]}}),/out of memory/);
 assert.equal(removed,1);assert.equal(paint.imageRef,'image-001');
});

test('a sole visible image keeps private clone crop state and removes only cloned children',async()=>{
 api.state.activeImageAssetContext=context();
 const image={type:'IMAGE',imageRef:'raw',scaleMode:'CROP',filters:{hue:.1},alpha:1};
 const fills=[{type:'SOLID',isVisible:false},image];
 const child={id:'original',characters:'Editable'};let clonedChildRemoved=0,removed=0;
 const probe={type:'FRAME',opacity:.7,layoutMode:'VERTICAL',strokes:[{}],effects:[{}],
  children:[{remove:()=>clonedChildRemoved++}],
  get fills(){return fills;},set fills(value){throw Error('Crop would reset on reassignment');},
  exportAsync:async function({format}){assert.equal(format,'PNG');assert.equal(this.layoutMode,'NONE');
   assert.equal(this.width,272);assert.equal(this.height,130);assert.equal(this.opacity,1);return new Uint8Array(bytes);},
  remove:()=>removed++};
 const node={id:'card',width:272,height:130,children:[child],fills,clone:()=>probe};
 const paint=api.createImageFillJson(image);
 await api.enrichImagePaintTruth(node,{geometry:{fills:[{type:'SOLID',visible:false},paint]}});
 assert.equal(clonedChildRemoved,1);assert.equal(removed,1);assert.equal(paint.filters,undefined);
 assert.equal(child.characters,'Editable');assert.equal(node.children.length,1);
});
