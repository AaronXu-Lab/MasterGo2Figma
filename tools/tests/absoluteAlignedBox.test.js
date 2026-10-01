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


const rotatedPart=src.slice(src.indexOf('export function rotatedStretchSize('),src.indexOf('export function absoluteStretchSize('));
const rotatedJS=esbuild.transformSync(rotatedPart.replace(/export /g,''),{loader:'ts'}).code;
const rotated=new Function(rotatedJS+';return rotatedStretchSize;')();
test('quarter-turn stretch follows the parent logical axis without inflating the other axis',()=>{
 const layout={layoutAlign:'STRETCH',width:50,height:.01,relativeTransform:[[0,-1,25],[1,0,0]]};
 assert.deepEqual(rotated(layout,{layoutMode:'VERTICAL',width:23.75}),{width:23.75,height:.01});
 assert.deepEqual(rotated(layout,{layoutMode:'HORIZONTAL',height:80,paddingTop:5,paddingBottom:5}),{width:50,height:70});
 assert.equal(rotated({...layout,layoutPositioning:'ABSOLUTE'},{layoutMode:'VERTICAL',width:100}),null);
 assert.equal(rotated({...layout,relativeTransform:[[1,0,0],[0,1,0]]},{layoutMode:'VERTICAL',width:100}),null);
});

test('right-pinned positive-positioned containers retain hug sizing',()=>{
 const layout={layoutPositioning:'ABSOLUTE',primaryAxisAlignItems:'MAX',primaryAxisSizingMode:'AUTO',x:300,width:180};
 assert.equal(preserve(layout),layout);
});
const positionPart=src.slice(src.indexOf('export function absoluteConstrainedPosition('),src.indexOf('function restoreAbsoluteConstrainedPosition('));
const positionJS=esbuild.transformSync(positionPart.replace(/export /g,''),{loader:'ts'}).code;
const position=new Function(positionJS+';return absoluteConstrainedPosition;')();
test('absolute right-pinned header follows parent fill and child hug sizes',()=>{
 const layout={layoutPositioning:'ABSOLUTE',x:300,y:16,width:180,height:24};
 const node={width:123,height:24,constraints:{horizontal:'MAX',vertical:'CENTER'}};
 assert.deepEqual(position(layout,{width:480,height:56},{width:420,height:56},node),{x:297,y:16});
 assert.equal(position({...layout,layoutPositioning:'AUTO'},{width:480},{width:420},node),null);
});

test('ordinary frame stretch children recover source dimensions after parent assembly',()=>{
 const layout={layoutPositioning:'AUTO',layoutMode:'NONE',width:224,height:48};
 const parentLayout={layoutMode:'NONE',width:224,height:48};
 const constraints={horizontal:'STRETCH',vertical:'STRETCH'};
 assert.deepEqual(stretch(layout,parentLayout,{layoutMode:'NONE',width:224,height:48},constraints),{width:224,height:48});
 assert.deepEqual(stretch(layout,parentLayout,{layoutMode:'NONE',width:240,height:60},constraints),{width:240,height:60});
 assert.equal(stretch(layout,parentLayout,{layoutMode:'VERTICAL',width:224,height:48},constraints),null);
});

const refreshPart=src.slice(src.indexOf('export function refreshNativeGroupOffsets('),src.indexOf('function normalizeDeferredLayoutForNativeGroupParent('));
const refreshJS=esbuild.transformSync(refreshPart.replace(/export /g,''),{loader:'ts'}).code;
const refresh=new Function('isRemovedNode',refreshJS+';return refreshNativeGroupOffsets;')(n=>!n||n.removed);
test('nested native groups snapshot their final enclosing coordinates before layout restore',()=>{
 const inner={id:'inner',type:'GROUP',x:420,y:416};
 const outer={id:'outer',type:'GROUP',x:420,y:320};
 const offsets={inner:{x:0,y:96},outer:{x:420,y:320}};
 refresh([{node:{parent:inner}},{node:{parent:outer}},{node:{removed:true,parent:inner}},
  {node:{parent:{id:'rotated',type:'GROUP',x:10,y:20}}}],offsets);
 assert.deepEqual(offsets,{inner:{x:420,y:416},outer:{x:420,y:320}});
 // Later auto-layout changes must not mutate the source snapshot.
 inner.y=104;
 assert.deepEqual(offsets.inner,{x:420,y:416});
 assert.equal(967+offsets.inner.x,1387);
 assert.equal(8+offsets.inner.y,424);
});
