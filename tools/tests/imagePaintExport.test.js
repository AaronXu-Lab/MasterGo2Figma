const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const esbuild=require('../../SendToFigma/node_modules/esbuild');
const root=path.resolve(__dirname,'../..');
const code=esbuild.buildSync({stdin:{contents:`export * from './SendToFigma/src/serializers/svgImageTruth';export * from './SendToFigma/src/imageExporter';export * from './SendToFigma/src/imagePaintExporter';export {state} from './SendToFigma/src/state';`,resolveDir:root},bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,require);const api=mod.exports;
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
 const paint=api.createImageFillJson({imageRef:'raw',scaleMode:'CROP',filters:{hue:.1,exposure:.2}});
 const json={geometry:{fills:[paint]}};
 await api.enrichImagePaintTruth({id:'sample',width:805,height:138,exportAsync:async()=>svg},json);
 assert.equal(paint.filters,undefined);assert.equal(paint.imageRef,'image-002');
 assert.deepEqual([...api.state.activeImageAssetContext.assets[1].bytes],[...bytes]);
 assert.ok(Math.abs(paint.imageTransform[0][0]-805/800)<1e-12);
 assert.deepEqual([...api.decodeImageDataUri(uri,bytes.length)],[...bytes]);
 assert.equal(api.decodeImageDataUri(uri,bytes.length-1),null);
});
test('unsupported native image pattern preserves original fill and filters',async()=>{
 api.state.activeImageAssetContext=context();
 const paint=api.createImageFillJson({imageRef:'raw',scaleMode:'CROP',filters:{hue:.1}});
 const before=JSON.stringify(paint);const old=api.state.logDiagnostic;api.state.logDiagnostic=()=>{};
 try{await api.enrichImagePaintTruth({id:'sample',width:805,height:138,exportAsync:async()=>svg+svg},{geometry:{fills:[paint]}});}finally{api.state.logDiagnostic=old;}
 assert.equal(JSON.stringify(paint),before);assert.equal(api.state.activeImageAssetContext.assets.length,1);
});
