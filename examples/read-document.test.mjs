import assert from "node:assert/strict";
import test from "node:test";
import { addressContent } from "@red-cup-engineering/signcell/content-address/raw";
import { xmlSourceCodec } from "@red-cup-engineering/xml-document-rendering-service/source-codec";
import { xmlToJsonTree } from "@red-cup-engineering/xml-document-rendering-service/transformations";

test("the installed XML codec witnesses ordered source and validates its emitted document", () => {
  const text = '<?xml version="1.0" encoding="UTF-8"?><root xmlns:x="urn:sample">\r\n<x:a a="&#13;"/>É<![CDATA[<raw>]]></root>';
  const bytes = Buffer.from("\uFEFF" + text);
  const reading = xmlSourceCodec.read(bytes);
  assert.equal(reading.source.ni, addressContent(bytes).ni);
  assert.deepEqual(reading.value, xmlToJsonTree({ xml: text }).document);
  const written = xmlSourceCodec.write(reading.value);
  assert.deepEqual(written.reading.value, reading.value);
  assert.notEqual(written.reading.source.ni, reading.source.ni);
  assert.equal(written.reading.claim.object, reading.claim.object);
  assert.throws(() => xmlSourceCodec.read(Buffer.from([0xff])), { code: "ERR_ENCODING_INVALID_ENCODED_DATA" });
  assert.throws(() => xmlSourceCodec.read(Buffer.from('<?xml version="1.0" encoding="UTF-16"?><root/>')), /declare UTF-8/u);
  assert.throws(() => xmlSourceCodec.read(Buffer.from('<!DOCTYPE root><root/>')), /DTD processing/u);
});
