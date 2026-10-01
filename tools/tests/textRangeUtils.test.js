const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const vm = require('node:vm');
const result = esbuild.buildSync({entryPoints:[require.resolve('../../shared/textRangeUtils.ts')],bundle:true,write:false,platform:'node',format:'cjs'});
const sandbox = {module:{exports:{}},exports:{}};
vm.runInNewContext(result.outputFiles[0].text,sandbox);
const normalize = sandbox.module.exports.normalizeCompleteTextRanges;
test('complete MasterGo ranges account for emoji and private-use astral bullets', () => {
 const ranges=[{start:0,end:2,style:'bold'},{start:2,end:4,style:'regular'}];
 assert.equal(JSON.stringify(normalize('A📖\u{f0010}B',ranges)),JSON.stringify([{start:0,end:3,style:'bold'},{start:3,end:6,style:'regular'}]));
 assert.deepEqual(ranges,[{start:0,end:2,style:'bold'},{start:2,end:4,style:'regular'}]);
});
test('ASCII, UTF-16 and partial covers stay unchanged', () => {
 for(const [text,ranges] of [['abcd',[{start:0,end:4}]],['A📖B',[{start:0,end:4}]],['A📖B',[{start:1,end:3}]],['A📖B',[{start:0,end:1},{start:2,end:3}]]]) assert.equal(normalize(text,ranges),ranges);
});
