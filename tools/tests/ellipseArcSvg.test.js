const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const esbuild=require('../../ReceiveFromMasterGo/node_modules/esbuild');
const code=esbuild.transformSync(fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/ellipseArcSvg.ts'),'utf8').replace('export function','function'),{loader:'ts'}).code;
const localSvg=new Function(code+';return localEllipseArcSvg')();
const sample=()=>({sourceType:'ELLIPSE',arcSvgMarkup:'<svg viewBox="0 0 100 100"><path d="M50 0L100 50"/></svg>',layout:{width:100,height:100,relativeTransform:[[1,0,20],[0,-1,120]]},blend:{opacity:1,effects:[]}});
test('native arc SVG reflection is undone before source transform replay',()=>{
 const data=sample(),before=structuredClone(data);
 assert.match(localSvg(data),/matrix\(1,0,0,-1,0,100\)/);
 assert.deepEqual(data,before);
 data.layout.relativeTransform=[[-1,0,120],[0,1,20]];
 assert.match(localSvg(data),/matrix\(-1,0,0,1,100,0\)/);
});
test('ambiguous padded, rotated or opacity-baked SVG keeps normal ellipse fallback',()=>{
 const data=sample();
 assert.equal(localSvg({...data,layout:{...data.layout,width:101}}),null);
 assert.equal(localSvg({...data,blend:{opacity:.5}}),null);
 assert.equal(localSvg({...data,blend:{effects:[{type:'DROP_SHADOW'}]}}),null);
 assert.equal(localSvg({...data,layout:{...data.layout,relativeTransform:[[0,-1,0],[1,0,0]]}}),null);
 assert.equal(localSvg({...data,arcSvgMarkup:'<svg viewBox="0 0 100 100"><image href="asset"/></svg>'}),null);
 assert.equal(localSvg({...data,arcSvgMarkup:undefined}),null);
});
