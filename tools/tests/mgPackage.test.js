const test = require("node:test");
const assert = require("node:assert/strict");
const { __test } = require("../../ReceiveFromMasterGo/src/ui/mgPackage.js");

test("instance visibility precedence preserves explicit scalar values", () => {
  assert.equal(__test.resolveInstanceVisibility(0, 0x04, 1, true), 0);
  assert.equal(__test.resolveInstanceVisibility(1, 0x00, 0, true), 1);
});

test("shallow visibility mask resolves omitted scalar to visible", () => {
  assert.equal(__test.resolveInstanceVisibility(undefined, 0x04, 0, true), 1);
  assert.equal(__test.resolveInstanceVisibility(undefined, undefined, 0, true), 1);
});

test("non-visibility masks and synthesized children inherit the slot", () => {
  assert.equal(__test.resolveInstanceVisibility(undefined, 0x80, 0, true), 0);
  assert.equal(__test.resolveInstanceVisibility(undefined, 0x80, 1, true), 1);
  assert.equal(__test.resolveInstanceVisibility(undefined, undefined, 0, false), 0);
});

test("an explicit empty stroke override clears the template stroke", () => {
  assert.equal(__test.shouldInheritStroke(null, 0x20000, true), false);
  assert.equal(__test.shouldInheritStroke(null, 0x34080, true), false);
  assert.equal(__test.shouldInheritStroke(null, 0x10000, true), true);
  assert.equal(__test.shouldInheritStroke(null, undefined, false), true);
  assert.equal(__test.shouldInheritStroke("stroke-ref", 0x20000, true), false);
});

test("styled text run parser preserves sparse starts and paint references", () => {
  const bytes = Uint8Array.from([
    0x09, 0x02,
    0x02, 0x02, 0x03, ...Buffer.from("2:0537"), 0x00, 0x00,
    0x01, 0x02, 0x02, 0x03, 0x03, ...Buffer.from("2:844"), 0x00, 0x00
  ]);
  assert.deepEqual(__test.parseTextRuns(bytes, 0, bytes.length, 3), [
    { start: 0, end: 2, paintRef: "2:0537" },
    { start: 2, end: 3, paintRef: "2:844" }
  ]);
});

test("Boolean leaf sizes distinguish natural, already-scaled, and slot-sourced values", () => {
  const scale = 0.8406118750572205;
  assert.equal(__test.resolveBooleanLeafSize(18, 18, scale, 0x4000), 18 * scale);
  assert.equal(__test.resolveBooleanLeafSize(18 * scale, 18, scale, 0x4000), 18 * scale);
  assert.equal(__test.resolveBooleanLeafSize(38.58, 18, scale, 0x14080), 18 * scale);
});

test("instance constraints resize from the uniformly scaled template parent", () => {
  assert.deepEqual(__test.scaleByConstraint(0, 20, 30, 100, 140), { pos: 20, size: 30 });
  assert.deepEqual(__test.scaleByConstraint(1, 60, 30, 100, 140), { pos: 100, size: 30 });
  assert.deepEqual(__test.scaleByConstraint(2, 20, 30, 100, 140), { pos: 20, size: 70 });
  assert.deepEqual(__test.scaleByConstraint(3, 20, 30, 100, 140), { pos: 40, size: 30 });
  assert.deepEqual(__test.scaleByConstraint(4, 20, 30, 100, 140), { pos: 28, size: 42 });
});

test("only an exact full-bleed GROUP inherits the resized parent box", () => {
  const parent = { w: 580, h: 1050 };
  assert.equal(__test.coversTemplateParent({
    x: 0,
    y: 0,
    w: 580,
    h: 1050,
    containerMeta: { subtype: "GROUP" }
  }, parent), true);
  assert.equal(__test.coversTemplateParent({
    x: 0,
    y: 0,
    w: 580,
    h: 1049,
    containerMeta: { subtype: "GROUP" }
  }, parent), false);
  assert.equal(__test.coversTemplateParent({
    x: 0,
    y: 0,
    w: 580,
    h: 1050,
    containerMeta: { subtype: "FRAME" }
  }, parent), false);
});

test("radial-gradient axis scalar IS the Figma minor-axis ratio", () => {
  // The scalar is the render-truth ratio, stored directly. Baseline ZIPs carry
  // min(scalar, 2|major|/scalar) instead — MasterGo's plugin API folds the
  // ratio when building the gradient transform SendToFigma reads (settled
  // 2026-07-11 against the Tesla vignette screenshots: scalar 3.5696 renders
  // as the wide flat ellipse, not the folded 0.4117). Do NOT re-fit these
  // expectations to a ZIP baseline.
  const cases = [
    // scalar > fold bound: ZIPs fold these to 0.4117249 / 0.559487 / 0.765407
    [{ x: 0.49358985, y: 0.43939397 }, { x: 0.49358985, y: 1.1742425 }, 3.5695839],
    [{ x: 0.49425292, y: 0.30769229 }, { x: 0.49425292, y: 0.76923078 }, 1.6498741],
    [{ x: 0.50000006, y: 0.54166669 }, { x: 0.5, y: 1 }, 1.19762015],
    // scalar below the fold bound: ZIP and render truth agree
    [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, 0.3265306055545807],
    [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, 0.5714285969734192]
  ];
  for (const [p0, p1, scalar] of cases) {
    assert.ok(Math.abs(__test.radialAxisRatio(p0, p1, scalar) - scalar) < 0.00002);
  }
  assert.equal(__test.radialAxisRatio({ x: 0, y: 0 }, { x: 0, y: 0 }, 0), 1);
});

test("Boolean anchor rebasing preserves absolute child positions", () => {
  const node = {
    x: 10,
    y: 20,
    relativeTransform: [[0, -1, 10], [1, 0, 20]]
  };
  const children = [
    { x: 9, y: 6.5, relativeTransform: [[1, 0, 9], [0, 1, 6.5]] },
    { x: 0, y: -3.5, relativeTransform: [[1, 0, 0], [0, 1, -3.5]] }
  ];
  assert.equal(__test.rebaseContainerByAnchor(node, children, 9, 6.5), true);
  assert.deepEqual(node.relativeTransform, [[0, -1, 3.5], [1, 0, 29]]);
  assert.deepEqual([node.x, node.y], [3.5, 29]);
  assert.deepEqual(children.map(child => [child.x, child.y]), [[0, 0], [-9, -10]]);
  assert.deepEqual(children[1].relativeTransform, [[1, 0, -9], [0, 1, -10]]);
});

test("derived GROUP resize centers only evidenced native structures", () => {
  const parent = { w: 580, h: 600 };
  assert.equal(__test.usesCenteredGroupResize({ w: 213, h: 170, y: 0 }, parent, [
    { rawType: "VECTOR", geomHash: "same" },
    { rawType: "VECTOR", geomHash: "same", relativeTransform: [[-1, 0, 213], [0, 1, 0]] }
  ]), true);
  assert.equal(__test.usesCenteredGroupResize({ w: 560, h: 149, y: 60 }, parent, [
    { rawType: "TEXT", x: 0, y: 0, w: 560 },
    { rawType: "RECTANGLE", x: 10, y: 145, w: 540 }
  ]), false);
});

// Twisted-float encoder (inverse of mgDecFloat): ieee bits rotated left by 1,
// bytes laid out as [S>>>24, S, S>>>8, S>>>16].
function twist(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  const ieee = view.getUint32(0, false);
  const S = ((ieee << 1) | (ieee >>> 31)) >>> 0;
  return [(S >>> 24) & 0xff, S & 0xff, (S >>> 8) & 0xff, (S >>> 16) & 0xff];
}
const VARINT_NEG1 = [0xff, 0xff, 0xff, 0xff, 0x0f];

test("geometry blob point floats are zero-compressed", () => {
  // One straight segment [v0 → v1]; v0 = (0, 5) stores x as the single-byte
  // zero form. A fixed 4-byte read would swallow the `02` y-tag and derail.
  const blob = Uint8Array.from([
    0x02, 0x01, // 1 segment record
    0x01, 0x04, 0x00, ...VARINT_NEG1, ...VARINT_NEG1, 0x01, // refs [0,-1,-1,1]
    0x02, 0x00, // segment index 0
    0x00,
    0x05, 0x02, // 2 vertex records
    0x01, 0x00, 0x02, ...twist(5), 0x03, 0x00, 0x05, 0x00, 0x00, // v0 = (0, 5)
    0x01, ...twist(7), 0x02, 0x00, 0x03, 0x00, 0x05, 0x01, 0x00, // v1 = (7, 0)
    0x06, 0x01, 0x00 // trailer
  ]);
  const vn = __test.decodeGeometryBlob(blob, 0);
  assert.ok(vn, "blob with zero-compressed floats must decode");
  assert.deepEqual(vn.vertices.map(v => [v.x, v.y]), [[0, 5], [7, 0]]);
  assert.deepEqual(vn.segments, [{
    start: 0, end: 1,
    tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 }
  }]);
});

test("clean four-section empty geometry blob is an empty vector network", () => {
  // Share exports store one canonical empty blob (hash = MD5 of "") for
  // flattened Boolean-result leaves; the ZIP baseline carries {[],[],[]}.
  const empty = Uint8Array.from([0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x01, 0x00]);
  assert.deepEqual(__test.decodeGeometryBlob(empty, 0), { segments: [], vertices: [], regions: [] });
  // A derailed parse (garbage tag inside a section) still fails.
  const derailed = Uint8Array.from([0x02, 0x01, 0x77, 0x00]);
  assert.equal(__test.decodeGeometryBlob(derailed, 0), null);
});

test("radial gradient extended 06 sub-object encodes the exact axis ratio", () => {
  // Extended form: 06 carries floats 01/02/04/05 plus 06 = 2×|p1−p0|. The 03
  // scalar and field06 form the ratio branch pair {scalar, field06/scalar};
  // render truth is the LARGER branch (same-design fixtures store opposite
  // branches: 0710-2 scalar 0.4117 ÷→ 3.5696, 0711-1 scalar 3.5696 direct).
  const record = Uint8Array.from([
    0x05, 0x02, // kind RADIAL
    0x0a,
    0x01, 0x02,
    0x03, ...twist(0.5), ...twist(0.25),
    0x04, ...twist(0.5), ...twist(0.75),
    0x05, 0x02,
    0x01, 0x00, 0x02, ...twist(1), 0x00, 0x00, 0x00, 0x00,
    0x01, ...twist(1), 0x02, ...twist(1), 0x00, 0x00, 0x00, 0x00,
    0x06,
    0x01, ...twist(0.79), 0x02, ...twist(-0.29), 0x03, ...twist(0.4),
    0x04, 0x00, 0x05, ...twist(-0.6), 0x06, ...twist(1.0),
    0x00,
    0x00, 0x0c, 0x01, 0x00
  ]);
  const doc = Uint8Array.from([
    ...Array.from("\x011:9\x00\x022:8\x00\x03a0\x00", c => c.charCodeAt(0)),
    ...record
  ]);
  const paints = __test.scanPaints(doc, new TextDecoder("latin1").decode(doc));
  const paint = paints["2:8"] && paints["2:8"][0];
  assert.ok(paint && paint.type === "GRADIENT_RADIAL", "extended 06 record must still decode");
  // ratio = max(0.4, 1.0/0.4) = 2.5; u = (0, 0.5) → a10 = -1/(2·|u|·ratio) = -0.4
  assert.ok(Math.abs(paint.gradientTransform[1][0] - (-0.4)) < 1e-6);
  assert.ok(Math.abs(paint.gradientTransform[0][1] - 1) < 1e-6);
});

test("container meta padding spellings: explicit, empty object, absent object", () => {
  // Explicit values.
  const explicit = Uint8Array.from([
    0x08, 0x01,
    0x09, ...twist(4),
    0x0a, 0x01, ...twist(1), 0x02, ...twist(2), 0x03, ...twist(3), 0x04, ...twist(4), 0x00
  ]);
  const m1 = __test.parseContainerMeta(explicit, 0);
  assert.deepEqual(m1.paddings, { top: 1, right: 2, bottom: 3, left: 4 });
  assert.ok(!m1.paddingsMissing);
  // Empty 0a object → missing (editor default 10 / share default 0).
  const emptyObj = Uint8Array.from([0x0a, 0x00]);
  assert.equal(__test.parseContainerMeta(emptyObj, 0).paddingsMissing, true);
  // Wholly absent 0a → same omitted-field default rule (测试集 0710-2 GROUP/BOOLEAN).
  const absent = Uint8Array.from([0x01, 0x01, 0x02, 0x01, 0x00]);
  const m3 = __test.parseContainerMeta(absent, 0);
  assert.equal(m3.subtype, "BOOLEAN_OPERATION");
  assert.equal(m3.paddingsMissing, true);
});

// The plugin UI converts .mg with { slimInstanceDescendants: true } to survive
// large files, so instance-descendant records reach applyInstanceChildOverrides
// STRIPPED. The compare tool converts unslimmed and is blind to that — this is
// the only check that the keep-list still covers what the matcher reads.
// (Regression: auto-layout spacing was dropped, so the 0806 tab bar rendered
// the component's gap 38 / padding 40 instead of the instance's 20 / 24.)
test("instance-descendant slimming keeps every field the override matcher reads", () => {
  const slim = __test.slimInstanceDescendantProps({
    type: "FRAME", sourceType: "FRAME", restoreType: "FRAME", name: "组 370",
    characters: "生活", booleanOperation: null, shellPlaceholder: true,
    scence: { visible: false, locked: false },
    blend: { opacity: 0.4, isMask: false, blendMode: "NORMAL", effects: [] },
    geometry: { fills: [{ type: "SOLID" }], strokes: [{ type: "SOLID" }], strokeWeight: 3 },
    layout: {
      x: 1, y: 2, width: 3, height: 4, relativeTransform: [[1, 0, 1], [0, 1, 2]], rotation: 0,
      itemSpacing: 20, paddingLeft: 24, paddingRight: 24, paddingTop: 24, paddingBottom: 0,
      layoutMode: "HORIZONTAL"
    },
    vectorNetwork: { segments: [], vertices: [] }
  });

  assert.equal(slim.scence.visible, false);
  assert.equal(slim.blend.opacity, 0.4);
  assert.equal(slim.characters, "生活");
  assert.equal(slim.geometry.fills.length, 1);
  assert.equal(slim.geometry.strokes.length, 1);
  for (const [key, want] of Object.entries({
    itemSpacing: 20, paddingLeft: 24, paddingRight: 24, paddingTop: 24, paddingBottom: 0,
    x: 1, y: 2, width: 3, height: 4
  })) {
    assert.equal(slim.layout[key], want, `layout.${key} must survive slimming`);
  }
  // Still slim: the payload that OOMs large files must NOT come back.
  assert.equal(slim.vectorNetwork, undefined);
  assert.equal(slim.geometry.strokeWeight, undefined);
});

test("page roots exclude sort-coded synced library copies but preserve canvas components", () => {
  const master = { type: "FRAME", parent: "page", code: "a1", containerMeta: { subtype: "COMPONENT_SET", libraryKey: "library+node" } };
  assert.equal(__test.isPageRootNode(master, {}), false);
  assert.equal(__test.isPageRootNode({ ...master, containerMeta: { subtype: "COMPONENT_SET" } }, {}), true);
  assert.equal(__test.isPageRootNode({ ...master, code: "", containerMeta: { subtype: "COMPONENT" } }, {}), false);
  assert.equal(__test.isPageRootNode({ ...master, parent: "frame" }, { frame: { type: "FRAME" } }), true);
  assert.equal(__test.isPageRootNode({ type: "FRAME", containerMeta: { subtype: "FRAME" } }, {}), true);
});

test("off-canvas component dependencies include nested masters without unrelated library content", () => {
  const node = (id, subtype, templateRef, parent) => ({ id, type: "FRAME", containerMeta: { subtype }, templateRef, parent });
  const nodes = {
    canvas: node("canvas", "FRAME"),
    instance: node("instance", "INSTANCE", "master"),
    master: node("master", "COMPONENT"),
    nested: node("nested", "INSTANCE", "icon", "master"),
    icon: node("icon", "COMPONENT"),
    unused: node("unused", "COMPONENT"),
    cycle: node("cycle", "INSTANCE", "master", "icon")
  };
  const children = { canvas: ["instance"], master: ["nested"], icon: ["cycle"] };
  const canvasIds = { canvas: true, instance: true };
  assert.deepEqual(__test.collectPageComponentDependencies(["canvas"], nodes, children, canvasIds), ["master", "icon"]);
  // The same dependencies must also be available when a second page is
  // selected on its own; discovery must not mutate the global canvas set.
  assert.deepEqual(__test.collectPageComponentDependencies(["canvas"], nodes, children, canvasIds), ["master", "icon"]);
  assert.deepEqual(canvasIds, { canvas: true, instance: true });
});

test("component dependencies retain only referenced variants and exclude canvas masters and unresolved refs", () => {
  const nodes = {
    a: { id: "a", type: "FRAME", templateRef: "variant" },
    b: { id: "b", type: "FRAME", templateRef: "local" },
    c: { id: "c", type: "FRAME", templateRef: "absent" },
    variant: { id: "variant", type: "FRAME", parent: "set", containerMeta: { subtype: "COMPONENT" } },
    set: { id: "set", type: "FRAME", containerMeta: { subtype: "COMPONENT_SET" } },
    local: { id: "local", type: "FRAME", containerMeta: { subtype: "COMPONENT" } }
  };
  // An unused sibling references another library: neither it nor that
  // transitive dependency should be visited when only `variant` is used.
  nodes.unused = { id: "unused", type: "FRAME", parent: "set", templateRef: "other", containerMeta: { subtype: "COMPONENT" } };
  nodes.other = { id: "other", type: "FRAME", containerMeta: { subtype: "COMPONENT" } };
  const children = { set: ["variant", "unused"] };
  assert.deepEqual(__test.collectPageComponentDependencies(["a", "b", "c"], nodes, children, { local: true }), ["variant"]);
  // Genuine canvas sets keep all children, and those children still discover
  // their own dependencies. Discovery must never prune the source tree.
  assert.deepEqual(__test.collectPageComponentDependencies(["set"], nodes, children, { set: true, variant: true, unused: true }), ["other"]);
  assert.deepEqual(children.set, ["variant", "unused"]);
});

test("materialized instanceRef records default visible without resurrecting ordinary hidden stubs", () => {
  assert.equal(__test.resolveInstanceVisibility(undefined, undefined, 0, true, true), 1);
  assert.equal(__test.resolveInstanceVisibility(undefined, 0x80, 0, true, true), 1);
  assert.equal(__test.resolveInstanceVisibility(0, 0x04, 1, true, true), 0);
  assert.equal(__test.resolveInstanceVisibility(undefined, undefined, 0, true, false), 0);
  assert.equal(__test.resolveInstanceVisibility(undefined, undefined, 0, false, true), 0);
});

test("shared masters get unique page-local ids and instance links for independently selected pages", () => {
  const master = { id: "master", parentId: null, index: 1, libraryMaster: true, childIds: ["leaf"], props: { id: "master", geometry: { fills: [{ type: "SOLID" }] } } };
  const leaf = { id: "leaf", parentId: "master", childIds: [], props: { id: "leaf", parentID: "master" } };
  const instance = id => ({ id, parentId: null, mainComponentId: "master", childIds: [], props: { id } });
  const used = new Set();
  const first = __test.scopePageDependencyRecords([instance("a"), master, leaf], ["a", "master"], used, 0);
  const second = __test.scopePageDependencyRecords([instance("b"), master, leaf], ["b", "master"], used, 1);
  assert.equal(new Set([...first.records, ...second.records].map(r => r.id)).size, 6);
  const byId = Object.fromEntries(second.records.map(r => [r.id, r]));
  const linked = byId[byId.b.mainComponentId];
  assert.equal(second.roots[1], linked.id);
  assert.equal(linked.libraryMaster, true);
  assert.equal(byId[linked.childIds[0]].parentId, linked.id);
  assert.equal(byId[linked.childIds[0]].props.parentID, linked.id);
  linked.props.geometry.fills[0].type = "IMAGE";
  assert.equal(master.props.geometry.fills[0].type, "SOLID");
});


test("full editor inactive image controls do not discard a solid paint", () => {
  // Color-only record from 杂记: no names, image bytes or document content.
  const bytes = Uint8Array.from(Buffer.from("013533353a3037383900023533353a3037383700036130000400050006010700087f0000007ceae9e97ceae9e97ceae9e9097f0000000a01000300000400000601000200037f000000047f0000000500060000000b0100027e00000003000401000200037f000000047f000000050006000005000600070008000900000c010d010002000300040005000600070008000000", "hex"));
  const paints = __test.scanPaints(bytes, new TextDecoder("latin1").decode(bytes));
  const paint = paints["535:0787"][0];
  assert.equal(paint.type, "SOLID");
  assert.equal(paint.visible, true);
  assert.ok(Math.abs(paint.color.r - 61 / 255) < 1e-7);
  assert.equal(paint.opacity, 1);
});

test("synced text styles accept an empty 04 field and an unprefixed display name", () => {
  const bytes = Buffer.concat([Buffer.from('\x011:1\0\x02Heading\0\x03a0\0\x04\0\x05\x03\x03PingFangSC-Semibold\0'),Buffer.from([4,0x85,0,0,0,0])]);
  const str = new TextDecoder('latin1').decode(bytes);
  const fonts = __test.scanFontStyles(bytes,str);
  assert.equal(fonts['1:1'].fontSize,64);
  const defs = __test.scanStyleDefs(bytes,str,fonts);
  assert.equal(defs['1:1'].name,'Heading');
  assert.equal(defs['1:1'].category,'TEXT');
  assert.deepEqual(__test.scanStyleDefs(bytes,str,{}),{});
});

test("font overrides with empty family recover the PostScript name", () => {
  const bytes = Buffer.concat([Buffer.from('\x011:2\0\x02\0\x03\0\x04\0\x05\x03\x03\0'),Buffer.from([4,0x84,0,0,0x20]),Buffer.from('\x0cPingFangSC-Semibold\0\0')]);
  const fonts = __test.scanFontStyles(bytes,new TextDecoder('latin1').decode(bytes));
  assert.equal(fonts['1:2'].psName,'PingFangSC-Semibold');
  assert.equal(fonts['1:2'].fontSize,36);
});

test("mixed font runs retain order and style refs across explicit run flags", () => {
  const bytes=Buffer.from('\x06\x02\x01a0\0\x02Body\0\x031:1\0\0\x01a1\0\x02Cost\0\x031:2\0\x04\x01\0\0');
  const parsed=__test.parseFontRuns(bytes,0,bytes.length);
  assert.deepEqual(parsed.runs.map(r=>[r.text,r.styleRef,r.start,r.end]),[['Body','1:1',0,4],['Cost','1:2',4,8]]);
});


test("solid alpha survives default paint opacity without multiplying duplicate spellings", () => {
  const head = Buffer.from("\x011:2\0\x021:1\0\x03a0\0", "binary");
  // Twisted floats: 0.5 = 7e000000, 1 = 7f000000.
  for (const [alpha, opacity, expected] of [
    [0x7e, 0x7f, 0.5], [0x7e, null, 0.5],
    [0x7f, 0x7e, 0.5], [0x7e, 0x7e, 0.5], [0x7f, 0, 0]
  ]) {
    const bytes = Buffer.concat([head, Buffer.from([
      8, alpha, 0, 0, 0, 0x7f, 0, 0, 0, 0x7f, 0, 0, 0, 0x7f, 0, 0, 0,
      ...(opacity === null ? [] : opacity === 0 ? [9, 0] : [9, opacity, 0, 0, 0]), 0
    ])]);
    const paint = __test.scanPaints(bytes, bytes.toString("latin1"))["1:1"][0];
    assert.equal(paint.opacity, expected);
    assert.deepEqual(paint.color, { r: 1, g: 1, b: 1 });
  }
});

test("editor text header 05 zero preserves emoji and numeric characters", () => {
  for (const text of ['✅', '12', '👨‍👩‍👧‍👦']) {
    const bytes = Buffer.concat([Buffer.from([1,2,2,0,3,2,5,0,6,1]),
      Buffer.from('\x01a0\0\x02'+text+'\0\x031:1\0\x04\x01\0')]);
    const parsed = __test.parseFontRuns(bytes, 0, bytes.length);
    assert.equal(parsed.runs[0].text, text);
    assert.equal(parsed.runs[0].end, text.length);
  }
});

test("explicit inactive Boolean kind does not hide a frame's clipping flag", () => {
  for (const clips of [0,1]) {
    const meta = __test.parseContainerMeta(Uint8Array.from([1,1,2,0,3,clips,4,4,0,0,0,0,5,0,6,0,8,0,0]),0);
    assert.equal(meta.subtype,'FRAME');
    assert.equal(meta.clipsContent,!!clips);
  }
});

test("explicit decoration zero remains undecorated", () => {
  const bytes = Buffer.from('\x011:1\0\x05\x03\x01\0\x03Inter\0\0');
  const fonts = __test.scanFontStyles(bytes,bytes.toString('latin1'));
  assert.equal(fonts['1:1'].decoration,'NONE');
});

test("native connector preserves local endpoints, manual elbow and arrow", () => {
  const bytes = Buffer.from('010002030301000202038500001c0400000401000200030004850000a8000501010103850000180006000700088200000009000000','hex');
  const connector = __test.parseConnector(bytes,0,bytes.length);
  const props = __test.connectorProps(connector);
  assert.deepEqual(props.connectorStartLocal,{x:71,y:0});
  assert.deepEqual(props.connectorEndLocal,{x:0,y:106});
  assert.deepEqual(props.vectorNetwork.vertices.map(v=>[v.x,v.y]),[[71,0],[71,70],[0,70],[0,106]]);
  assert.equal(props.vectorNetwork.vertices[3].strokeCap,'ARROW_LINES');
  assert.equal(props.vectorNetwork.vertices[1].cornerRadius,8);
});

test('UTF-8 font entries preserve localized names, point size and pixel line height', () => {
  const bytes = Uint8Array.from(Buffer.concat([
    Buffer.from('\x019:1\0\x05\x03\x03苹方-简\0', 'utf8'),
    Buffer.from([0x04,0x82,0,0,0xc0,0x05,0x83,0,0,0x60,0x06,1,0x0b,1]),
    Buffer.from('\x0cPingFangSC-常规体\0\x0e\0\x0fEMPTYHASHFFFFFFF\0\x12{"fontStyle":"常规体","opsz":"auto"}\0\0', 'utf8')
  ]));
  const entry = __test.scanFontStyles(bytes, Buffer.from(bytes).toString('latin1'))['9:1'];
  assert.equal(entry.family, '苹方-简');
  assert.equal(entry.styleName, '常规体');
  assert.equal(entry.fontSize, 14);
  assert.deepEqual(__test.lineHeightFromStyleEntry(entry, 1, false), {value:22,unit:'PIXELS'});
});

test('font entry percent flag overrides pixel flag and does not scale percentages', () => {
  const bytes = Uint8Array.from(Buffer.concat([
    Buffer.from('\x019:2\0\x05\x03\x03PingFang SC\0', 'utf8'),
    Buffer.from([0x05,0x85,0,0,0x90,0x06,1,0x07,1,0])
  ]));
  const entry = __test.scanFontStyles(bytes, Buffer.from(bytes).toString('latin1'))['9:2'];
  assert.deepEqual(__test.lineHeightFromStyleEntry(entry, 0.5, false), {value:100,unit:'PERCENT'});
  assert.deepEqual(__test.lineHeightFromStyleEntry({...entry,lineHeightPercent:false}, 0.5, false), {value:50,unit:'PIXELS'});
  assert.deepEqual(__test.lineHeightFromStyleEntry({lineHeight:22,lineHeightPx:false}, 1, true), {unit:'AUTO'});
  assert.deepEqual(__test.lineHeightFromStyleEntry({lineHeight:-1}, 1, false), {unit:'AUTO'});
});

test('painted masks accept the paired newer flags without enabling shape-only masks', () => {
  assert.equal(__test.maskRendersFill({t1e:1}), true);
  assert.equal(__test.maskRendersFill({t2f:1,t36:1}), true);
  for (const trailer of [null,{}, {t2f:1}, {t36:1}, {t2f:0,t36:1}]) {
    assert.equal(__test.maskRendersFill(trailer), false);
  }
});


test("effect scalar 16 preserves background blur and later fields", () => {
  const bytes = Buffer.concat([Buffer.from("\x019:1\x00\x029:2\x00\x03a0\x00"),
    Buffer.from([5,3,9,0x81,0x56,0x55,0x55,0x16,0x86,0xac,0xaa,0x0a,0x18,6,0,0,0])]);
  const effects = __test.scanEffects(bytes, bytes.toString("latin1"))["9:2"];
  assert.equal(effects.length, 1);
  assert.equal(effects[0].type, "BACKGROUND_BLUR");
  assert.ok(Math.abs(effects[0].radius - 5.33333349) < 1e-6);
});
