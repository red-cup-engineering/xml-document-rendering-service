import assert from "node:assert/strict";
import test from "node:test";
import { xmlSourceCodec } from "@red-cup-engineering/xml-document-rendering-service/source-codec";
import { readingMark, readingOf } from "@red-cup-engineering/xml-document-rendering-service/svg";
import { normalizeDeltaPacket } from "@red-cup-engineering/xml-document-rendering-service/svg/report-graphic";

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
