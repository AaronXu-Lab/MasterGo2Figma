const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const esbuild = require("../../ReceiveFromMasterGo/node_modules/esbuild");

const source = fs.readFileSync(
  require.resolve("../../ReceiveFromMasterGo/src/code.ts"),
  "utf8"
);

function loadCreateRestoredPageName() {
  const start = source.indexOf("function createRestoredPageName(");
  const end = source.indexOf("async function maybeReportRestoreProgress(", start);
  const code = esbuild.transformSync(source.slice(start, end), {
    loader: "ts",
    target: "es2017"
  }).code;
  return new Function(`${code}; return createRestoredPageName;`)();
}

test("page names use a Figma-safe slash instead of becoming %2F", () => {
  const createRestoredPageName = loadCreateRestoredPageName();
  assert.equal(
    createRestoredPageName("车机体验度量/车机体验度量"),
    "车机体验度量∕车机体验度量"
  );
});

test("page name fallback and ordinary names are unchanged", () => {
  const createRestoredPageName = loadCreateRestoredPageName();
  assert.equal(createRestoredPageName("Overview"), "Overview");
  assert.equal(createRestoredPageName(""), "Imported Page");
});
