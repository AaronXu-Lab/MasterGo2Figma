const test=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('../../ReceiveFromMasterGo/node_modules/esbuild');
const fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/deferredLayout.ts'),'utf8');
const part=src.slice(src.indexOf('export function normalizeLayoutMode('),src.indexOf('function applyDeferredNodeAutoLayout('));
const js=esbuild.transformSync(part.replace(/export /g,''),{loader:'ts'}).code;
const preserve=new Function(js+';return preserveAbsoluteAlignedBox;')();
test('right-aligned absolute AUTO labels keep their source box instead of losing leading space',()=>{
 const layout={layoutPositioning:'ABSOLUTE',primaryAxisAlignItems:'MAX',primaryAxisSizingMode:'AUTO',width:113,x:-129};
 assert.deepEqual(preserve(layout),{...layout,primaryAxisSizingMode:'FIXED'});
 assert.equal(layout.primaryAxisSizingMode,'AUTO');
 for(const override of [{layoutPositioning:'AUTO'},{primaryAxisAlignItems:'MIN'},{primaryAxisSizingMode:'FIXED'}]) {
  const other={...layout,...override};assert.equal(preserve(other),other);
 }
});


const sizePart=src.slice(src.indexOf('export function absoluteStretchSize('),src.indexOf('function restoreAbsoluteStretchBox('));
const sizeJS=esbuild.transformSync(sizePart.replace(/export /g,''),{loader:'ts'}).code;
const stretch=new Function(js+sizeJS+';return absoluteStretchSize;')();
test('absolute plot preserves source insets after parent auto-layout settles',()=>{
 const layout={layoutPositioning:'ABSOLUTE',layoutMode:'NONE',width:679,height:362};
 assert.deepEqual(stretch(layout,{width:679,height:390},{width:516,height:390},{horizontal:'STRETCH',vertical:'STRETCH'}),{width:516,height:362});
 assert.equal(stretch({...layout,layoutPositioning:'AUTO'},{width:679,height:390},{width:516,height:390},{}),null);
 assert.deepEqual(stretch(layout,{width:679,height:390},{width:516,height:390},{horizontal:'MIN',vertical:'STRETCH'}),{width:null,height:362});
});
