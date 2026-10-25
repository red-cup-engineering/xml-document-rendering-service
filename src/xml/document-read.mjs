/** Ordered XML 1.0/Namespaces 1.0 nodes; DTD and XML 1.1 are explicit exclusions. */
import { parseXml, XmlError } from "@rgrove/parse-xml";
import { qname } from "./names.mjs";
export { XmlError };
export class XmlNamespaceError extends Error {}
export class UnsupportedXmlFeatureError extends TypeError {}
const XML = "http://www.w3.org/XML/1998/namespace", XMLNS = "http://www.w3.org/2000/xmlns/";
const OPTIONS = Object.freeze({ preserveCdata: true, preserveComments: true, preserveDocumentType: true, preserveXmlDeclaration: true });
function namespaceFail(message) { throw new XmlNamespaceError(message); }
function expanded(name, scope, attribute) {
  if (attribute && name === "xmlns") return [XMLNS, "xmlns"];
  if (!qname(name)) namespaceFail(`invalid namespace qualified name ${name}`);
  const at = name.indexOf(":"), prefix = at < 0 ? "" : name.slice(0, at), local = at < 0 ? name : name.slice(at + 1);
  if (prefix === "xmlns" && !attribute) namespaceFail("xmlns cannot prefix an element");
  const uri = prefix ? scope.get(prefix) : attribute ? "" : scope.get("") ?? "";
  if (prefix && !uri) namespaceFail(`undeclared namespace prefix ${prefix}`);
  return [uri ?? "", local];
}
// Admit byte budgets before the full-tree parser allocates. Existing Market
// conversions have their stricter independent 65536-byte admission.
const DIRECT_READER_MAX_BYTES = 1048576;
function admitBudget(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`XML ${label} budget must be a bounded safe integer`);
  }
}
// A conservative lexical *lower bound*, not a second XML parser. Refuse
// definitely excessive structural allocation before the full-tree parser runs.
// Malformed/unrecognised syntax is left to the native parser for diagnostics.
function admitLexicalStructure(xml, maximumNodes, maximumDepth, maximumAttributes) {
  let nodes = 1, depth = 0, attributes = 0;
  const node = () => {
    if (++nodes > maximumNodes)
      throw new RangeError(`XML exceeds ${maximumNodes} nodes before parsing`);
  };
  for (let offset = 0; offset < xml.length;) {
    const open = xml.indexOf("<", offset);
    if (open < 0) return;
    if (xml.startsWith("<!--", open) ||
        xml.startsWith("<![CDATA[", open) ||
        xml.startsWith("<?", open)) {
      const comment = xml.startsWith("<!--", open);
      const cdata = !comment && xml.startsWith("<![CDATA[", open);
      const terminator = comment ? "-->" : cdata ? "]]>" : "?>";
      const end = xml.indexOf(terminator, open + (comment ? 4 : cdata ? 9 : 2));
      if (end < 0) return; // Native markup error, not budget evidence.
      node();
      offset = end + terminator.length;
      continue;
    }
    // XML 1.0 requires S after the DOCTYPE keyword (space, tab, CR or LF).
    // A keyword prefix alone is malformed markup, not an excluded DTD.
    if (xml.startsWith("<!DOCTYPE", open) && /[ \t\r\n]/u.test(xml[open + 9] ?? ""))
      throw new UnsupportedXmlFeatureError("DTD processing is outside this XML conversion profile");
    if (xml.startsWith("<!", open)) return; // Native parser decides malformed markup.
    const closing = xml[open + 1] === "/";
    let quote = null, end = -1, equals = 0, lastNonSpace = "";
    for (let at = open + 1; at < xml.length; at++) {
      const character = xml[at];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        end = at;
        break;
      } else {
        if (character === "=" && !closing) equals++;
        if (!/\s/u.test(character)) lastNonSpace = character;
      }
    }
    if (end < 0) return; // Native parser diagnoses incomplete tags.
    if (closing) {
      depth = Math.max(0, depth - 1);
    } else {
      node();
      attributes += equals;
      if (attributes > maximumAttributes)
        throw new RangeError(`XML exceeds ${maximumAttributes} attributes before parsing`);
      depth++;
      if (depth > maximumDepth)
        throw new RangeError(`XML exceeds depth ${maximumDepth} before parsing`);
      if (lastNonSpace === "/") depth--;
    }
    offset = end + 1;
  }
}
export function readXmlDocument(xml, {
  maximumNodes = 8192, maximumDepth = 64, maximumAttributes = 8192,
  maximumInputBytes = DIRECT_READER_MAX_BYTES,
} = {}) {
  if (typeof xml !== "string") {
    throw new TypeError("XML input requires well-formed Unicode text");
  }
  admitBudget(maximumNodes, "node", 1, 65536);
  admitBudget(maximumDepth, "depth", 0, 1024);
  admitBudget(maximumAttributes, "attribute", 0, 65536);
  admitBudget(maximumInputBytes, "input byte", 1, DIRECT_READER_MAX_BYTES);
  // UTF-8 byte length is never below UTF-16 code-unit length, even for
  // malformed surrogate pairs. Reject massive input in O(1) before either
  // Unicode inspection or the bounded byte count.
  if (xml.length > maximumInputBytes || Buffer.byteLength(xml, "utf8") > maximumInputBytes) {
    throw new RangeError("XML input exceeds maximumInputBytes before parsing");
  }
  if (!xml.isWellFormed()) {
    throw new TypeError("XML input requires well-formed Unicode text");
  }
  admitLexicalStructure(xml, maximumNodes, maximumDepth, maximumAttributes);
  let unresolved = false;
  // The probe can identify DTD input before an unresolved DTD entity is
  // mislabeled a markup error. No probe with unresolved entities is returned.
  const source = parseXml(xml, { ...OPTIONS, resolveUndefinedEntity: () => { unresolved = true; return ""; } });
  if (source.children.some(node => node.type === "doctype")) throw new UnsupportedXmlFeatureError("DTD processing is outside this XML conversion profile");
  if (source.children.some(node => node.type === "xmldecl" && node.version !== "1.0")) throw new UnsupportedXmlFeatureError("only XML 1.0 is admitted");
  if (unresolved) parseXml(xml, OPTIONS); // Native exact original error and location.
  const result = { kind: "document", children: [] }, initial = new Map([["xml", XML], ["xmlns", XMLNS]]);
  const stack = [{ source, result, scope: initial, depth: 0 }]; let nodes = 0, attributeCount = 0;
  while (stack.length) {
    const frame = stack.pop();
    if (++nodes > maximumNodes || frame.depth > maximumDepth) throw new RangeError(`XML exceeds ${maximumNodes} nodes or depth ${maximumDepth}`);
    if (frame.source.type === "element") {
      const attrs = Object.entries(frame.source.attributes), scope = new Map(frame.scope);
      attributeCount += attrs.length;
      if (attributeCount > maximumAttributes) throw new RangeError(`XML exceeds ${maximumAttributes} attributes`);
      for (const [name, value] of attrs) {
        if (name !== "xmlns" && !name.startsWith("xmlns:")) continue;
        if (!qname(name)) namespaceFail(`invalid namespace declaration name ${name}`);
        const prefix = name === "xmlns" ? "" : name.slice(6);
        if (prefix === "xmlns" || value === XMLNS || (prefix === "xml" && value !== XML) || (prefix !== "xml" && value === XML)) namespaceFail("reserved XML namespace binding");
        if (prefix && !value) namespaceFail("prefix undeclaration is outside Namespaces 1.0");
        scope.set(prefix, value);
      }
      expanded(frame.source.name, scope, false);
      const keys = new Set();
      for (const [name] of attrs) {
        const key = JSON.stringify(expanded(name, scope, true));
        if (keys.has(key)) namespaceFail(`duplicate expanded attribute name ${name}`);
        keys.add(key);
      }
      frame.scope = scope;
    }
    for (const node of frame.source.children ?? []) {
      let child;
      switch (node.type) {
        case "element": child = { kind: "element", name: node.name, attributes: Object.fromEntries(Object.entries(node.attributes)), children: [] }; break;
        case "text": child = { kind: "text", value: node.text }; break;
        case "cdata": child = { kind: "cdata", value: node.text }; break;
        case "comment": child = { kind: "comment", value: node.content }; break;
        case "pi":
          if (node.name.includes(":")) namespaceFail("processing instruction targets cannot contain colons");
          child = { kind: "pi", name: node.name, value: node.content }; break;
        case "xmldecl": child = { kind: "xmldecl", version: node.version, ...(node.encoding ? { encoding: node.encoding } : {}), ...(node.standalone ? { standalone: node.standalone } : {}) }; break;
        default: throw new UnsupportedXmlFeatureError(`unsupported XML node ${node.type}`);
      }
      frame.result.children.push(child);
      stack.push({ source: node, result: child, scope: frame.scope, depth: frame.depth + 1 });
    }
  }
  return result;
}
