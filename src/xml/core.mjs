/** XML node construction and serialization; HTML may reuse lexical escaping. */
import { define } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { parseXml } from "@rgrove/parse-xml";
import { name as validName } from "xml-name-validator";

/** Lexical escaping only; XML character admission belongs to the writer. */
export function escapeXmlText(value) {
  return value.replace(/[&<>]/g, character => character === "&" ? "&amp;" : character === "<" ? "&lt;" : "&gt;");
}
export function escapeXmlAttr(value) {
  return escapeXmlText(value).replace(/["']/g, character => character === '"' ? "&quot;" : "&#39;");
}
export function isXmlName(name) { return validName(name); }
export function requireXmlName(name) {
  if (!isXmlName(name)) throw new TypeError(`xml: ${JSON.stringify(name)} is not a well-formed XML name`);
  return name;
}
/** W3C XML 1.0 Fifth Edition Char production; no substitution or normalization. */
export function requireXmlCharacters(value) {
  if (typeof value !== "string" || /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value)) throw new TypeError("xml: text contains a character outside XML 1.0");
  return value;
}
export function element(name, attributes = {}, children = []) {
  const kids = [];
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    kids.push(typeof child === "string" ? text(child) : child);
  }
  return { kind: "element", name: requireXmlName(name), attributes, children: kids };
}
export function text(value) { return { kind: "text", value: requireXmlCharacters(value) }; }
export function comment(value) {
  requireXmlCharacters(value);
  if (value.includes("\r")) throw new TypeError("xml: comments cannot retain carriage return");
  if (value.includes("--") || value.endsWith("-")) throw new TypeError("xml: a comment may not contain '--' or end with '-'");
  return { kind: "comment", value };
}
function attributes(values) {
  let result = "";
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    const escaped = escapeXmlAttr(requireXmlCharacters(String(value))).replace(/[\t\n\r]/g, ch => `&#${ch.charCodeAt(0)};`);
    result += ` ${requireXmlName(name)}="${escaped}"`;
  }
  return result;
}
/** Iterative writer preserves child order and admits existing XML node carriers. */
export function serialize(node) {
  const out = [], ancestors = new Set(), stack = [{ node }];
  while (stack.length) {
    const item = stack.pop();
    if (item.exit) { ancestors.delete(item.node); continue; }
    if (item.literal !== undefined) { out.push(item.literal); continue; }
    const current = item.node;
    if (!current || typeof current !== "object") throw new TypeError("xml: a node must be an object");
    if (ancestors.has(current)) throw new TypeError("xml: cyclic node carrier");
    switch (current.kind) {
      case "text": out.push(escapeXmlText(requireXmlCharacters(current.value)).replaceAll("\r", "&#13;")); break;
      case "comment": out.push(`<!--${comment(current.value).value}-->`); break;
      case "cdata": {
        const value = requireXmlCharacters(current.value);
        // CDATA cannot represent CR without XML's line-ending normalization.
        if (value.includes("]]>") || value.includes("\r")) throw new TypeError("xml: CDATA cannot contain ']]>' or carriage return; use text nodes");
        out.push(`<![CDATA[${value}]]>`); break;
      }
      case "pi": {
        const target = requireXmlName(current.name), value = requireXmlCharacters(current.value);
        if (String(target).toLowerCase() === "xml" || value.includes("?>")) throw new TypeError("xml: invalid processing instruction");
        if (value.includes("\r")) throw new TypeError("xml: processing instructions cannot retain carriage return");
        out.push(`<?${target}${value ? " " + value : ""}?>`); break;
      }
      case "xmldecl": {
        if (current.version !== "1.0" || ![undefined, null, "yes", "no"].includes(current.standalone)) throw new TypeError("xml: declaration requires XML 1.0 and optional yes/no standalone");
        out.push(`<?xml version="1.0" encoding="UTF-8"${current.standalone ? ` standalone="${current.standalone}"` : ""}?>`); break;
      }
      case "document":
      case "element": {
        if (!Array.isArray(current.children)) throw new TypeError("xml: node children must be an array");
        ancestors.add(current); stack.push({ node: current, exit: true });
        if (current.kind === "element") {
          const name = requireXmlName(current.name), attrs = attributes(current.attributes);
          if (!current.children.length) { out.push(`<${name}${attrs}/>`); break; }
          out.push(`<${name}${attrs}>`); stack.push({ literal: `</${name}>` });
        }
        for (let i = current.children.length - 1; i >= 0; i--) stack.push({ node: current.children[i] });
        break;
      }
      default: throw new TypeError(`xml: unsupported node kind ${current.kind}`);
    }
  }
  return out.join("");
}
export function document(root, options = {}) {
  const declaration = options.declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : "";
  const doctype = options.doctype ? `${options.doctype}\n` : "";
  const result = `${declaration}${doctype}${serialize(root)}\n`;
  // Validate the actual document carrier, retaining the existing opaque doctype
  // option. This is non-validating XML parsing, not DTD/schema validation.
  try { parseXml(result); } catch (cause) { throw new TypeError(`xml: ${cause.message}`, { cause }); }
  return result;
}
export const xmlProjector = define({
  type: "xml", corner: "data", rung: "strict",
  recognize: resource => {
    try {
      let unresolved = false;
      const parsed = parseXml(resource.content, { preserveDocumentType: true, resolveUndefinedEntity: () => { unresolved = true; return ""; } });
      // Preserve recognition of opaque DTD documents. Recognition is distinct
      // from processing their entity declarations or validating their schema.
      if (unresolved && !parsed.children.some(node => node.type === "doctype")) parseXml(resource.content);
      return true;
    } catch { return false; }
  },
  write: nodes => nodes.map(serialize).join(""),
});
