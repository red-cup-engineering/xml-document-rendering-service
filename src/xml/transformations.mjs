/** Bounded conversions on XML's ordered node carrier, not a lossy object map. */
import { encodeUtf8Source } from "@red-cup-engineering/signcell/source-codec";
import { writeXmlDocument, xmlDocumentJsonByteLength } from "./document-write.mjs";
import { readXmlDocument, XmlError, XmlNamespaceError } from "./document-read.mjs";
const MAX_XML = 65536;
function request(body, field) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body,field) || Object.keys(body).some(key => key !== field)) throw new TypeError(`request requires only ${field}`);
}
function input(body) {
  request(body,"xml");
  if (typeof body.xml !== "string") throw new TypeError("xml must be well-formed Unicode text");
  // UTF-8 bytes cannot be fewer than UTF-16 code units. A large caller
  // string is refused before traversing Unicode or allocating a parser tree.
  if (body.xml.length > MAX_XML) throw new RangeError("XML input exceeds 65536 UTF-8 bytes");
  if (!body.xml.isWellFormed()) throw new TypeError("xml must be well-formed Unicode text");
  if (encodeUtf8Source(body.xml).byteLength > MAX_XML) throw new RangeError("XML input exceeds 65536 UTF-8 bytes");
  return body.xml;
}
function read(xml) {
  try { return readXmlDocument(xml); } catch (cause) {
    if (cause instanceof RangeError || cause instanceof TypeError || cause instanceof XmlError || cause instanceof XmlNamespaceError) throw cause;
    throw new TypeError(cause.message, { cause });
  }
}
function parseForConversion(xml) {
  try { return read(xml); } catch (cause) {
    if (cause instanceof XmlError || cause instanceof XmlNamespaceError) throw new TypeError(cause.message, { cause });
    throw cause;
  }
}
export function xmlToJsonTree(body) {
  const xml = input(body), document = parseForConversion(xml);
  return { document, byteLength: Buffer.byteLength(xml), jsonByteLength: xmlDocumentJsonByteLength(document) };
}
export function jsonTreeToXml(body) {
  request(body,"document");
  const xml = writeXmlDocument(body.document);
  if (Buffer.byteLength(xml) > MAX_XML) throw new RangeError("serialized XML exceeds 65536 UTF-8 bytes");
  parseForConversion(xml); // Validate the complete document and namespace bindings.
  return { xml, byteLength: Buffer.byteLength(xml) };
}
export function normalizeXml(body) {
  const xml = input(body), document = parseForConversion(xml);
  xmlDocumentJsonByteLength(document);
  const result = jsonTreeToXml({ document });
  return { ...result, sourceByteLength: Buffer.byteLength(xml), changed: result.xml !== xml };
}
export function checkXmlWellFormedness(body) {
  const xml = input(body);
  try {
    read(xml);
    return { wellFormed: true, profile: "XML1.0+Namespaces1.0-noDTD", diagnostics: [] };
  } catch (cause) {
    if (!(cause instanceof XmlError || cause instanceof XmlNamespaceError)) throw cause;
    return { wellFormed: false, profile: "XML1.0+Namespaces1.0-noDTD", diagnostics: [{ message: String(cause.message).slice(0,1024), line: cause instanceof XmlError ? cause.line : null, column: cause instanceof XmlError ? cause.column : null }] };
  }
}
