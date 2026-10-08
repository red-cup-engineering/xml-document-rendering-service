/** Ordered XML 1.0/Namespaces 1.0 nodes; DTD and XML 1.1 are explicit exclusions. */
import { parseXml, XmlError } from "@rgrove/parse-xml";
import { qname } from "xml-name-validator";
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
export function readXmlDocument(xml, { maximumNodes = 8192, maximumDepth = 64, maximumAttributes = 8192 } = {}) {
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
    if (++nodes > maximumNodes || frame.depth > maximumDepth) throw new RangeError("XML exceeds 8192 nodes or depth 64");
    if (frame.source.type === "element") {
      const attrs = Object.entries(frame.source.attributes), scope = new Map(frame.scope);
      attributeCount += attrs.length;
      if (attributeCount > maximumAttributes) throw new RangeError("XML exceeds 8192 attributes");
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
