import test from "node:test";
import assert from "node:assert/strict";
import { MECHANICAL_CLASSIFICATIONS, renderDeterministicReportGraphic } from "../src/xml/svg/report-graphic.mjs";


const four = (index = 0) => ({ positiveEvidence: Boolean(index & 1), negativeEvidence: Boolean(index & 2) });
const packet = { type: "HarmoniousUnionDeltaPacket", period: "2026-07-18T23:00:00Z/PT1H", subscriptionDigest: "sha256:subscription",
  reportingWindow: { fromExclusive: "2026-07-18T22:47:00.000Z", toInclusive: "2026-07-18T23:51:00.000Z", baseline: false },
  previousSuccessfulPublicationDigest: null, currentManifestDigest: "sha256:current", claims: MECHANICAL_CLASSIFICATIONS.map((classification, index) => ({ settlement: `urn:ame:${index}`, claimId: `claim-${index}`, classification, evidence: four(index % 4) })),
  coverage: { admitted: 5, accepted: 4, refused: 0, unknownUnreported: 1 },
  metrics: [
    { settlement: "urn:ame:aagaard", claimId: "economy/hive", classification: "materially-changed", evidence: four(1), label: "Liquid HIVE", amount: "152.786", unit: "HIVE", domain: "economy", displayOrder: 10, previousAmount: "150", deltaAmount: "+2.786" },
    { settlement: "urn:ame:lmt", claimId: "politics/directions", classification: "added", evidence: four(3), label: "Leader directions", amount: "12", unit: "records", domain: "politics", displayOrder: 20, previousAmount: null, deltaAmount: null },
  ] };

test("equal packets produce byte-identical safe SVG and PNG", () => {
  const first = renderDeterministicReportGraphic(packet), reordered = renderDeterministicReportGraphic({ ...packet, claims: [...packet.claims].reverse() });
  assert.equal(first.type, "DeterministicReportGraphicArtifact"); assert.equal(first.svgDigest, reordered.svgDigest); assert.equal(first.pngDigest, reordered.pngDigest); assert.match(first.packetDigest, /^ni:\/\/\/sha-256;/u);
  const svg = Buffer.from(first.svgBase64, "base64").toString("utf8"), png = Buffer.from(first.pngBase64, "base64");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" version="1\.2" baseProfile="tiny"/u); assert.doesNotMatch(svg, /(?:script|style|href|url\(|foreignObject)/iu); assert.deepEqual(png.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(first.rasterizedFromExactSvgDigest, first.svgDigest);
});

test("FOUR evidence is explicit, rendered, and changes exact artifacts", () => {
  const svg = Buffer.from(renderDeterministicReportGraphic(packet).svgBase64, "base64").toString("utf8");
  const changed = renderDeterministicReportGraphic({ ...packet, claims: packet.claims.map((claim, index) => index === 0 ? { ...claim, evidence: four(3) } : claim) });
  assert.notEqual(renderDeterministicReportGraphic(packet).svgDigest, changed.svgDigest); assert.ok(svg.length > 0);
  assert.equal(renderDeterministicReportGraphic({ ...packet, claims: [{ settlement: "urn:ame:a", claimId: "x", classification: "added", state: "held" }] }).type, "DeterministicReportGraphicRefusal");
});

test("nonzero measurements outrank schema-order zero counters", () => {
  const zero = (index) => ({ settlement: "urn:ame:x", claimId: `zero-${index}`, classification: "added", evidence: four(0), label: `Zero ${index}`, amount: "0", unit: "events", domain: "work", displayOrder: index, previousAmount: null, deltaAmount: null });
  const crowded = { ...packet, metrics: [...Array.from({ length: 24 }, (_, index) => zero(index)), { settlement: "urn:ame:x", claimId: "economic-real", classification: "added", evidence: four(1), label: "HIVE earned", amount: "7.5", unit: "HIVE", domain: "economy", displayOrder: 999, previousAmount: null, deltaAmount: null }] };
  assert.notEqual(renderDeterministicReportGraphic(crowded).svgDigest, renderDeterministicReportGraphic({ ...crowded, metrics: crowded.metrics.slice(0, 24) }).svgDigest);
});

