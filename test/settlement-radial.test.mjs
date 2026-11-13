import test from "node:test";
import assert from "node:assert/strict";
import { parseXml } from "@rgrove/parse-xml";
import { readingSettlement } from "@red-cup-engineering/metrologic/settlement";
import { cell, address, presence, valueOf } from "@red-cup-engineering/signcell/cell";
import { coincides, semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address-system";
import { settlementRadialProjection, projectSettlementRadial, readSettlementRadialPayload, readSettlementRadial, verifySettlementRadial,
  projectRadial, radialFromValuation, radialFromClosureStages } from "@red-cup-engineering/xml-document-rendering-service/svg/radial";
import { readSvgDataCarrier } from "@red-cup-engineering/xml-document-rendering-service/svg/data-carrier";
import { encodePngRgba, readPngCarrier, writePngCarrier } from "@red-cup-engineering/computer-serialized-content-engineering-services-section/png-carrier";

function actualResult() {
  return readingSettlement.settle(() => ({ contested: "active", derived: "potential" }),
    { unanswered: "absurd", affirmed: "potential", denied: "active", contested: "potential" });
}

test("actual Metrologic result, visible FOUR key, accessible description and recovered source agree", () => {
  const result = actualResult();
  assert.equal(result.iterations, 1);
  assert.equal(result.state.contested, "stable");
  const projection = settlementRadialProjection(result);
  assert.deepEqual(projection.counts, { neither: 1, true: 2, false: 1, both: 1 });
  assert.deepEqual(projection.source.result, result);
  assert.equal(projection.sourceId, semanticId(projection.source));
  const svg = projectSettlementRadial(result);
  assert.doesNotThrow(() => parseXml(svg));
  for (const [id, reading] of Object.entries(result.state)) {
    const entry = projection.entries.find(entry => entry.id === id);
    assert.equal(entry.reading, reading);
    assert.ok(svg.includes(`data-cell="${id}" data-settled-value="${entry.truth}"`));
    assert.ok(svg.includes(entry.description));
  }
  assert.ok(svg.includes("neither: 1"));
  assert.ok(svg.includes("both: 1"));
  assert.ok(svg.includes('aria-labelledby="settlement-radial-title settlement-radial-description"'));
  assert.ok(svg.includes("No intermediate stages are inferred."));
  assert.ok(svg.includes("position and area are not confidence or evidence strength"));
  assert.ok(coincides(readSettlementRadial(svg).source, projection.source));
  assert.equal(verifySettlementRadial(svg), true);
});

test("PNG payload recovers original typed settlement source and regenerates the exact original SVG", () => {
  const result = actualResult();
  const cells = { contested: cell("observer", "reports", 9007199254740993n, { for: [Uint8Array.of(0, 255, 7)], value: "potential" }) };
  const svg = projectSettlementRadial(result, { cells, title: "Cross-format source", size: 640, prefix: "received" });
  const png = writePngCarrier({
    png: encodePngRgba({ width: 1, height: 1, rgba: Uint8Array.of(255, 255, 255, 255) }),
    carrier: readSvgDataCarrier(svg).carrier,
  });
  const received = readSettlementRadialPayload(readPngCarrier(png));
  assert.ok(coincides(received.source.cells, cells));
  assert.deepEqual(received.source.result, result);
  const regenerated = projectSettlementRadial(received.source.result, { ...received.view, cells: received.source.cells });
  assert.equal(regenerated, svg);
  assert.equal(verifySettlementRadial(regenerated), true);
  assert.throws(() => readSettlementRadialPayload({ carrier: { mediaType: "text/plain", contentBase64: "" } }), /CBOR required/u);
});

test("settled value, original SignCell value and witness presence are independent source facts", () => {
  const at = cell("claimant", "says", "claim", { for: ["positive receipt"], against: ["negative receipt"], value: "potential" });
  assert.equal(valueOf(at), "potential");
  assert.equal(presence(at), "stable");
  const result = { state: { claim: "active" }, iterations: 0 };
  const options = { cells: { claim: at } };
  const projection = settlementRadialProjection(result, options);
  const entry = projection.entries[0];
  assert.equal(entry.truth, "false");
  assert.equal(entry.sourceValue, "potential");
  assert.equal(entry.witnessPresence, "stable");
  assert.equal(entry.cellId, address(at));
  assert.equal(entry.positiveWitnesses, 1);
  assert.equal(entry.negativeWitnesses, 1);
  const svg = projectSettlementRadial(result, options);
  assert.ok(svg.includes("source true · presence both · +1/−1 witnesses"));
  const received = readSettlementRadial(svg);
  assert.equal(valueOf(received.source.cells.claim), "potential");
  assert.equal(presence(received.source.cells.claim), "stable");
  assert.equal(received.source.result.state.claim, "active");
  assert.equal(verifySettlementRadial(svg), true);
});

test("canonical CBOR preserves typed terms and witnesses while the original writer escapes visible labels", () => {
  const bytes = Uint8Array.of(0, 255, 9, 18);
  const at = cell("</text><script>blocked()</script>", "reports & checks", 9007199254740993n,
    { for: [bytes, 12345678901234567890n], against: [{ disputed: "&<" }] });
  const result = { state: { typed: "stable" }, iterations: 0 };
  const svg = projectSettlementRadial(result, { cells: { typed: at }, title: "Source <one> & <two>" });
  assert.ok(svg.includes("Source &lt;one&gt; &amp; &lt;two&gt;"));
  assert.ok(!svg.includes("<script>"));
  const received = readSettlementRadial(svg).source.cells.typed;
  assert.ok(coincides(at, received));
  assert.equal(received.object, 9007199254740993n);
  assert.ok(received.for.some(value => value instanceof Uint8Array && value[1] === 255));
  assert.ok(received.for.includes(12345678901234567890n));
  bytes[0] = 73;
  assert.ok(coincides(at, received));
  assert.equal(verifySettlementRadial(svg), true);
});

test("permutations and canonically coincident source representatives give identical SVG bytes", () => {
  const left = { state: { z: "active", "é": "potential", a: "absurd" }, iterations: 2 };
  const right = { iterations: 2, state: { a: "absurd", "e\u0301": "potential", z: "active" } };
  const first = projectSettlementRadial(left);
  assert.equal(first, projectSettlementRadial(left));
  assert.equal(first, projectSettlementRadial(right));
  assert.equal(projectSettlementRadial(left, { title: "é" }), projectSettlementRadial(left, { title: "e\u0301" }));
  assert.deepEqual(Object.keys(left.state), ["z", "é", "a"]);
  assert.deepEqual(Object.keys(right.state), ["a", "e\u0301", "z"]);
});

test("opaque IDs and sparse actual-cell metadata preserve reserved property names without invented triples", () => {
  const result = { state: Object.fromEntries([["__proto__", "stable"], ["constructor", "absurd"], ["toString", "active"]]), iterations: 0 };
  const cells = Object.fromEntries([["__proto__", cell("s", "p", "s")]]);
  const projection = settlementRadialProjection(result, { cells });
  assert.equal(projection.entries.find(x => x.id === "constructor").cellId, undefined);
  assert.equal(projection.entries.find(x => x.id === "constructor").segment.orbit, "unclassified");
  assert.equal(projection.entries.find(x => x.id === "__proto__").segment.orbit, "diagonal");
  const recovered = readSettlementRadial(projectSettlementRadial(result, { cells }));
  assert.ok(Object.hasOwn(recovered.source.result.state, "__proto__"));
  assert.equal(recovered.source.result.state.__proto__, "stable");
  assert.ok(!Object.hasOwn(recovered.source.cells, "constructor"));
});

test("source input and returned projection are detached; no solver or renderer state is mutated", () => {
  const result = { state: { a: "potential" }, iterations: 0 };
  const projection = settlementRadialProjection(result);
  result.state.a = "active";
  assert.equal(projection.source.result.state.a, "potential");
  assert.throws(() => { projection.source.result.state.a = "stable"; }, TypeError);
  assert.throws(() => { projection.dataform.rings[0].segments.push({}); }, TypeError);
});

test("verification rejects visually changed paths, text, identity and corrupt carrier bytes", () => {
  const svg = projectSettlementRadial(actualResult());
  const cases = [
    svg.replace('fill="#151c29"', 'fill="#ffffff"'),
    svg.replace("Metrologic settlement</title>", "Unrelated result</title>"),
    svg.replace('data-source-ni="ni:', 'data-source-ni="wrong:'),
    svg.replace(/d="M([0-9]+)\./, (_, n) => `d="M${Number(n) + 1}.`),
  ];
  for (const modified of cases) { assert.notEqual(modified, svg); assert.equal(verifySettlementRadial(modified), false); }
  assert.equal(verifySettlementRadial("<svg/>"), false);
});

test("source identity excludes presentation while exact carrier verification includes it", () => {
  const result = actualResult();
  const first = projectSettlementRadial(result);
  const second = projectSettlementRadial(result, { title: "Another view", size: 640, prefix: "view-two" });
  assert.notEqual(first, second);
  assert.equal(readSettlementRadial(first).sourceId, readSettlementRadial(second).sourceId);
  assert.equal(verifySettlementRadial(second), true);
});

test("empty actual result remains readable and is distinct from a missing or invalid source", () => {
  const result = readingSettlement.settle(state => state, {});
  const svg = projectSettlementRadial(result);
  assert.ok(svg.includes("No cells in this result."));
  assert.equal(readSettlementRadial(svg).source.result.iterations, 0);
  assert.equal(verifySettlementRadial(svg), true);
});

test("admission refuses incompatible families, hidden extra result fields, invalid source cells and finite view overflow", () => {
  const valid = { state: { a: "potential" }, iterations: 0 };
  for (const result of [null, { state: new Map(), iterations: 0 }, { state: {}, iterations: -1 }, { state: {}, iterations: 0.5 },
    { state: { a: "true" }, iterations: 0 }, { state: {}, iterations: 0, stages: [] },
    { state: { a: "high-confidence" }, iterations: 0 }]) assert.throws(() => projectSettlementRadial(result), TypeError);
  assert.throws(() => projectSettlementRadial(valid, { cells: { b: cell("s", "p", "o") } }), TypeError);
  assert.throws(() => projectSettlementRadial(valid, { cells: { a: { subject: "s", predicate: "p", object: "o" } } }), TypeError);
  assert.throws(() => projectSettlementRadial(valid, { size: Infinity }), RangeError);
  assert.throws(() => projectSettlementRadial(valid, { prefix: 'bad" id' }), TypeError);
  assert.throws(() => projectSettlementRadial(valid, { stages: [] }), TypeError);
  assert.throws(() => projectSettlementRadial({ state: Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [String(i), "absurd"])), iterations: 0 }), RangeError);
  assert.throws(() => projectSettlementRadial({ state: { "e\u0301": "potential", "é": "active" }, iterations: 0 }), TypeError);
});

test("original valuation and supplied-stage radial APIs still use their own SignCell evidence", () => {
  const cells = [cell("s", "p", "s", { for: ["w"] }), cell("s", "p", "o", { against: ["n"] })];
  const valuation = radialFromValuation(cells);
  assert.equal(valuation.rings.length, 1);
  const stages = radialFromClosureStages([{ valuation: [] }, { valuation: cells }]);
  assert.equal(stages.rings.length, 2);
  for (const dataform of [valuation, stages]) assert.doesNotThrow(() => parseXml(projectRadial(dataform)));
});
