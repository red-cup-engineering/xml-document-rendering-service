import assert from "node:assert/strict";
import test from "node:test";
import { xmlSourceCodec } from "@red-cup-engineering/xml-document-rendering-service/source-codec";
import { readingMark, readingOf } from "@red-cup-engineering/xml-document-rendering-service/svg";
import { element, serialize } from "@red-cup-engineering/xml-document-rendering-service/core";
import { dataCarrierMetadata, readSvgDataCarrier } from "@red-cup-engineering/xml-document-rendering-service/svg/data-carrier";
import { normalizeDeltaPacket, renderDeterministicReportGraphic } from "@red-cup-engineering/xml-document-rendering-service/svg/report-graphic";

test("UTF-8 source identity, SVG evidence and content-addressed claim order survive supplier upgrades", () => {
  const bytes = new TextEncoder().encode('<game score="42">海</game>');
  assert.equal(xmlSourceCodec.read(bytes).source.ni, "ni:///sha-256;FMOZ8brk2q_6J3o2GJ6qPJ8Bd2W4zuhRNucmNrIvVzc");
  const testimony = { for: ["turn"], against: [] };
  assert.equal(readingOf(testimony), "potential");
  assert.equal(readingMark(testimony), "t");
  const claim = claimId => ({
    settlement: "round", claimId, classification: "refused",
    evidence: { positiveEvidence: false, negativeEvidence: true },
  });
  const packet = {
    type: "HarmoniousUnionDeltaPacket", period: "round", subscriptionDigest: "score",
    currentManifestDigest: "game", previousSuccessfulPublicationDigest: null,
    claims: [claim("pantry"), claim("depot")],
  };
  const ordered = normalizeDeltaPacket(packet).claims;
  assert.deepEqual(normalizeDeltaPacket({ ...packet, claims: packet.claims.toReversed() }).claims, ordered);
  assert.deepEqual(ordered.map(row => row.claimId).sort(), ["depot", "pantry"]);
});

test("SVG metadata round-trips the original nine bytes", () => {
  const carrier = { mediaType: "text/plain", contentBase64: "U2NvcmU6IDQy" };
  const svg = serialize(element("svg", { xmlns: "http://www.w3.org/2000/svg" }, [
    dataCarrierMetadata({ carrier }),
  ]));
  assert.deepEqual(readSvgDataCarrier(svg), {
    carrier, byteLength: 9, ni: "ni:///sha-256;c1FSYkRPKMtmBGyWM_1cMEGvWopAU2smMThgTdUvszk",
  });
});

test("the published SVG and PNG report retain their original byte identities", () => {
  const report = renderDeterministicReportGraphic({
    type: "HarmoniousUnionDeltaPacket", period: "round", subscriptionDigest: "score",
    currentManifestDigest: "game", previousSuccessfulPublicationDigest: null,
    claims: [{
      settlement: "round", claimId: "pantry", classification: "refused",
      evidence: { positiveEvidence: false, negativeEvidence: true },
    }],
  });
  assert.equal(report.svgDigest, "ni:///sha-256;CHwNjUAl54R2dCC7KsnlzKfX29mvQJ75JT53q-k_1N0");
  assert.equal(report.rasterizedFromExactSvgDigest, report.svgDigest);
  assert.equal(report.pngDigest, "sha256:4021c9cd6f78b3497fde79f84d069a3a4b3a32ad1e3e5fc17bfe2f16d7d90a64");
});
