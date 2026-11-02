import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { document, element } from "../src/xml/core.mjs";
import { dataCarrierMetadata, readSvgDataCarrier, inspectPassiveSvg } from "../src/xml/svg/data-carrier.mjs";

const ns = "http://www.w3.org/2000/svg";
const carrier = { mediaType: "application/octet-stream", contentBase64: "AP+AJSY8Pj0NCg==" };
const svg = (children = [], attributes = {}) => document(element("svg", { xmlns: ns, width: 320, height: 120, viewBox: "0 0 320 120", ...attributes }, children));
const payloadSvg = () => svg([element("title", {}, ["Exact source bytes <&> remain data"]), dataCarrierMetadata({ carrier }), element("rect", { x: 0, y: 0, width: 320, height: 120, fill: "#126b62" })]);

test("generic SVG preserves the original byte carrier and independent byte identity through original XML", () => {
  const source = payloadSvg(), value = readSvgDataCarrier(source);
  assert.equal(source, payloadSvg());
  assert.deepEqual(value.carrier, carrier);
  assert.equal(value.ni, "ni:///sha-256;" + createHash("sha256").update(Buffer.from(carrier.contentBase64, "base64")).digest("base64url"));
  assert.equal(value.byteLength, 10);
  assert.deepEqual(inspectPassiveSvg(source), { width: 320, height: 120, byteLength: Buffer.byteLength(source), elementCount: 5, validation: "passive-svg-image" });
  assert.equal(readSvgDataCarrier(svg()), null);
  const prefixed = source.replaceAll("image:", "payload:").replace("xmlns:image=", "xmlns:payload=");
  assert.deepEqual(readSvgDataCarrier(prefixed), value, "namespace identity, not a hardcoded prefix, selects the payload");
});

test("one-MiB bytes fit the explicit two-MiB standalone XML admission", () => {
  const bytes = Buffer.alloc(1048576, 0xa7);
  const source = svg([dataCarrierMetadata({ carrier: { mediaType: "application/cbor", contentBase64: bytes.toString("base64") } })]);
  assert.ok(Buffer.byteLength(source) > 1048576);
  assert.ok(Buffer.byteLength(source) < 2097152);
  assert.equal(readSvgDataCarrier(source).byteLength, bytes.length);
  assert.equal(inspectPassiveSvg(source).width, 320);
});

test("SVG payload corruption, duplicate carriers and altered declarations fail closed", () => {
  const source = payloadSvg();
  const damaged = [
    source.replace("AP+AJSY8Pj0NCg==", "AP+AJSY8Pj0NCw=="),
    source.replace('byte-length="10"', 'byte-length="9"'),
    source.replace('byte-length="10"', 'byte-length="010"'),
    source.replace('byte-length="10"', 'byte-length="1048577"'),
    source.replace('encoding="base64"', 'encoding="base64url"'),
    source.replace("AP+AJSY8Pj0NCg==", "AP+AJSY8Pj0NCg==\n"),
    source.replace("AP+AJSY8Pj0NCg==", "<g/>"),
    svg([dataCarrierMetadata({ carrier }), dataCarrierMetadata({ carrier })]),
    svg([element("g", {}, [dataCarrierMetadata({ carrier })])]),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///should-not-open">]>' + source,
  ];
  for (const value of damaged) assert.throws(() => readSvgDataCarrier(value));
  const wrongNamespace = source.replace("https://561.group/ns/image-data/v1", "https://example.invalid/other-profile");
  assert.equal(readSvgDataCarrier(wrongNamespace), null);
});

test("media type remains an explicit claim, separate from exact-byte identity or authorship", () => {
  const before = readSvgDataCarrier(payloadSvg());
  const after = readSvgDataCarrier(payloadSvg().replace('media-type="application/octet-stream"', 'media-type="application/cbor"'));
  assert.equal(before.ni, after.ni);
  assert.equal(after.carrier.mediaType, "application/cbor");
  assert.equal(after.carrier.contentBase64, before.carrier.contentBase64);
});

test("passive SVG accepts original SHP metadata, text, local clipping and bounded hatch paint", () => {
  const source = svg([
    element("metadata", { id: "shp-payload" }, [element("shp:packet", { "xmlns:shp": "https://561.group/ns/shp-svg/v1", format: "application/json" }, ['{"title":"</script><script>not markup</script>"}'])]),
    element("defs", {}, [
      element("clipPath", { id: "clip" }, [element("rect", { width: 20, height: 20 })]),
      element("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse" }, [element("path", { d: "M0 0L6 6", stroke: "#fff" })]),
    ]),
    element("g", { "clip-path": "url(#clip)", "data-cell-key": "<&>", role: "group" }, [element("rect", { width: 20, height: 20, fill: "url(#hatch)" }), element("text", { x: 10, y: 10, "font-size": 13, "font-family": "ui-monospace,Menlo,monospace", "pointer-events": "none", "xml:lang": "en" }, ["Visible source"])]),
  ]);
  assert.equal(inspectPassiveSvg(source).width, 320);
  assert.equal(readSvgDataCarrier(source), null, "the existing SHP semantic carrier remains its own profile");
  assert.deepEqual(Object.fromEntries(Object.entries(inspectPassiveSvg(`<s:svg xmlns:s="${ns}" viewBox="0 0 33 49"><s:title>Small</s:title></s:svg>`)).filter(([key]) => ["width", "height"].includes(key))), { width: 33, height: 49 });
});

test("passive SVG refuses active, external, cyclic, namespace-confused and unbounded image inputs", () => {
  const wrap = inner => `<svg xmlns="${ns}" width="320" height="120">${inner}</svg>`;
  const bad = [
    wrap('<script>globalThis.executed=true</script>'), wrap('<s:script xmlns:s="'+ns+'"/>'),
    wrap('<style>@import "https://example.invalid/style";</style>'), wrap('<rect style="fill:red"/>'),
    wrap('<g onload="globalThis.executed=true"/>'), wrap('<foreignObject/>'), wrap('<animate/>'),
    wrap('<image href="https://example.invalid/image.png"/>'), wrap('<use href="#x"/>'),
    wrap('<rect fill="url(https://example.invalid/paint)"/>'), wrap('<g xml:base="https://example.invalid/"/>'),
    '<?xml-stylesheet href="https://example.invalid/style"?>'+wrap(''),
    wrap('<metadata><h:script xmlns:h="http://www.w3.org/1999/xhtml">x</h:script></metadata>'),
    wrap('<metadata><x:data xmlns:x="urn:data" OnLoad="x">text</x:data></metadata>'),
    wrap('<metadata><x:data xmlns:x="urn:data"><g/></x:data></metadata>'),
    wrap('<rect id="same"/><g id="same"/>'), wrap('<rect fill="url(#missing)"/>'),
    wrap('<defs><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse"><rect fill="url(#p)"/></pattern></defs>'),
    wrap('<defs><pattern id="p" width="0.0001" height="6" patternUnits="userSpaceOnUse"/></defs>'),
    wrap('<circle r="1e999"/>'), wrap('<path d="M0 0L1e999 0"/>'),
    wrap('<svg width="20" height="20"/>'), wrap('<g unexpected="x"/>'),
    '<svg width="20" height="20"/>', `<svg xmlns="${ns}" width="100%" height="20"/>`,
    `<svg xmlns="${ns}" width="9000" height="20"/>`, `<svg xmlns="${ns}" viewBox="0 0 1e999 10"/>`,
    '<!DOCTYPE svg>'+wrap(''), wrap('<g></svg>'),
  ];
  for (const value of bad) assert.throws(() => inspectPassiveSvg(value), undefined, value.slice(0, 200));
  assert.throws(() => inspectPassiveSvg(wrap("a".repeat(2097152))), /before parsing/);
});
