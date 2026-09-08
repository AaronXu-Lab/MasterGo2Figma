const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({entryPoints:['ReceiveFromMasterGo/src/appliers/multilineText.ts'],bundle:true,format:'cjs',platform:'node',write:false});
const m = {exports:{}};
new Function('module','exports',output.outputFiles[0].text)(m,m.exports);
const {getFixedMixedTextLines} = m.exports;
const data = {characters:'您好，\n欢迎使用监管平台',fontSize:36,textAutoResize:'WIDTH_AND_HEIGHT',lineHeight:{unit:'PIXELS',value:40},layout:{width:144,height:80},styledTextSegments:[{start:0,end:3,fontSize:36},{start:3,end:12,fontSize:18}]};
test('fixed mixed lines retain editable characters and rebase style ranges across newline',()=>{
 const lines=getFixedMixedTextLines(data);
 assert.deepEqual(lines.map(l=>l.characters),['您好，','欢迎使用监管平台']);
 assert.deepEqual(lines.map(l=>l.styledTextSegments),[[{start:0,end:3,fontSize:36}],[{start:0,end:8,fontSize:18}]]);
});
test('ordinary text, wrapping, paragraph gaps and ambiguous line heights keep native text path',()=>{
 for(const patch of [{textAutoResize:'HEIGHT'},{layout:{width:144,height:100}},{paragraphSpacing:8},{characters:'您好，欢迎使用监管平台'},{lineHeight:{unit:'AUTO'}},{styledTextSegments:[{start:0,end:12,fontSize:18}]}]) assert.equal(getFixedMixedTextLines({...data,...patch}),null);
});
