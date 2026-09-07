const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const source = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/propertyApplier.ts'),'utf8');
const js = esbuild.transformSync(source.slice(source.indexOf('function reapplyVectorStrokeGeometry(')),{loader:'ts'}).code;
const apply = new Function('safeSet','normalizeMasterGoStrokeCapForFigma',js+';return reapplyVectorStrokeGeometry;')((n,k,v)=>{n[k]=v;},v=>v);
test('stroke geometry reapplication preserves asymmetric vector endpoint arrows',()=>{
 const node={}; let sets=0;
 Object.defineProperty(node,'strokeCap',{set(){sets++;}});
 apply(node,{geometry:{strokeCap:'NONE',strokeWeight:2},vectorNetwork:{vertices:[{strokeCap:'NONE'},{strokeCap:'ARROW_LINES'}]}});
 assert.equal(sets,0);assert.equal(node.strokeWeight,2);
 apply(node,{geometry:{strokeCap:'ROUND'},vectorNetwork:{vertices:[{},{}]}});
 assert.equal(sets,1);
});
