import { serialize } from "./core.mjs";

const MAX_JSON = 1048576;

export function xmlDocumentJsonByteLength(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > MAX_JSON) throw new RangeError("XML node representation exceeds 1048576 JSON UTF-8 bytes");
  return bytes;
}

function admitDocument(value) {
  if (!value || value.kind !== "document") throw new TypeError("document must be a document node");
  let count = 0, queuedNodes = 1, attributes = 0; const stack = [{ node: value, depth: 0 }], ancestors = new Set();
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
      // Cap the full pending frontier BEFORE pushing siblings. The visited
      // count alone permits unbounded stack allocation from one huge array.
      if (queuedNodes + node.children.length > 8192) throw new RangeError("XML exceeds 8192 nodes before traversal");
      queuedNodes += node.children.length;
      ancestors.add(node); stack.push({ node, exit: true });
      for (let index = 0; index < node.children.length; index++)
        stack.push({ node: node.children[index], depth: item.depth + 1 });
    }
  }
  xmlDocumentJsonByteLength(value);
}
/** Admit the ordered XML document carrier before serializing it. */
export function writeXmlDocument(document) {
  admitDocument(document);
  return serialize(document);
}
