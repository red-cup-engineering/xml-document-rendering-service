/** Bounded conversions on XML's ordered node carrier, not a lossy object map. */
import { serialize } from "./core.mjs";
import { readXmlDocument, XmlError, XmlNamespaceError } from "./document-read.mjs";
const MAX_XML = 65536, MAX_JSON = 1048576;
function request(body, field) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body,field) || Object.keys(body).some(key => key !== field)) throw new TypeError(`request requires only ${field}`);
}
function input(body) {
  request(body,"xml");
  if (typeof body.xml !== "string" || !body.xml.isWellFormed()) throw new TypeError("xml must be well-formed Unicode text");
  if (Buffer.byteLength(body.xml) > MAX_XML) throw new RangeError("XML input exceeds 65536 UTF-8 bytes");
  return body.xml;
}
function read(xml) {
  try { return readXmlDocument(xml); } catch (cause) {
    if (cause instanceof RangeError || cause instanceof TypeError || cause instanceof XmlError || cause instanceof XmlNamespaceError) throw cause;
    throw new TypeError(cause.message, { cause });
  }
}
function treeBytes(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > MAX_JSON) throw new RangeError("XML node representation exceeds 1048576 JSON UTF-8 bytes");
  return bytes;
}
function parseForConversion(xml) {
  try { return read(xml); } catch (cause) {
    if (cause instanceof XmlError || cause instanceof XmlNamespaceError) throw new TypeError(cause.message, { cause });
    throw cause;
  }
}
export function xmlToJsonTree(body) {
  const xml = input(body), document = parseForConversion(xml);
  return { document, byteLength: Buffer.byteLength(xml), jsonByteLength: treeBytes(document) };
}
function admitDocument(value) {
  if (!value || value.kind !== "document") throw new TypeError("document must be a document node");
  let count = 0, attributes = 0; const stack = [{ node: value, depth: 0 }], ancestors = new Set();
  while (stack.length) {
    const item = stack.pop(), node = item.node;
    if (item.exit) { ancestors.delete(node); continue; }
    if (++count > 8192 || item.depth > 64) throw new RangeError("XML exceeds 8192 nodes or depth 64");
    if (!node || Object.getPrototypeOf(node) !== Object.prototype || typeof node.kind !== "string") throw new TypeError("XML nodes must be plain objects with a kind");
    const fields = { document: ["kind","children"], element: ["kind","name","attributes","children"], text: ["kind","value"], cdata: ["kind","value"], comment: ["kind","value"], pi: ["kind","name","value"], xmldecl: ["kind","version","encoding","standalone"] };
    if (!Object.hasOwn(fields,node.kind) || Object.keys(node).some(k => !fields[node.kind].includes(k))) throw new TypeError("XML node has unknown kind or fields");
    if (node.kind === "document" && item.depth !== 0) throw new TypeError("only the outer node can be a document");
    if (["element","pi"].includes(node.kind) && typeof node.name !== "string") throw new TypeError("XML node name must be a string");
    if (["text","cdata","comment","pi"].includes(node.kind) && typeof node.value !== "string") throw new TypeError("XML node value must be a string");
    if (node.kind === "xmldecl" && ((node.encoding !== undefined && (typeof node.encoding !== "string" || !/^[A-Za-z][A-Za-z0-9._-]*$/u.test(node.encoding))) || (node.standalone !== undefined && !["yes","no"].includes(node.standalone)))) throw new TypeError("invalid XML declaration");
    if (node.kind === "element") {
      if (!node.attributes || Object.getPrototypeOf(node.attributes) !== Object.prototype || Object.values(node.attributes).some(v => typeof v !== "string")) throw new TypeError("XML attributes must map names to string values");
      attributes += Object.keys(node.attributes).length;
      if (attributes > 8192) throw new RangeError("XML exceeds 8192 attributes");
    }
    if (["document","element"].includes(node.kind)) {
      if (!Array.isArray(node.children)) throw new TypeError("XML node children must be an array");
      if (ancestors.has(node)) throw new TypeError("cyclic XML document");
      ancestors.add(node); stack.push({ node, exit: true });
      for (const child of node.children) stack.push({ node: child, depth: item.depth + 1 });
    }
  }
  treeBytes(value);
}
export function jsonTreeToXml(body) {
  request(body,"document"); admitDocument(body.document);
  const xml = serialize(body.document);
  if (Buffer.byteLength(xml) > MAX_XML) throw new RangeError("serialized XML exceeds 65536 UTF-8 bytes");
  parseForConversion(xml); // Validate the complete document and namespace bindings.
  return { xml, byteLength: Buffer.byteLength(xml) };
}
export function normalizeXml(body) {
  const xml = input(body), document = parseForConversion(xml);
  treeBytes(document);
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
