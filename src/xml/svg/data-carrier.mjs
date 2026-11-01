/** Exact-byte metadata and a bounded passive SVG image profile. This is not an SVG sanitizer. */
import { element } from "../core.mjs";
import { readXmlDocument } from "../document-read.mjs";
import { imagePayload, IMAGE_PAYLOAD_PROFILE, IMAGE_PAYLOAD_LIMITS } from "@red-cup-engineering/computer-serialized-content-engineering-services-section/image-payload";

const SVG = "http://www.w3.org/2000/svg";
const XML = "http://www.w3.org/XML/1998/namespace";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const ACTIVE_NAMESPACES = new Set([SVG, "http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML"]);
export const PASSIVE_SVG_LIMITS = Object.freeze({ maximumInputBytes: 2097152, maximumNodes: 16384, maximumAttributes: 65536, maximumDepth: 64, maximumDimension: 8192, maximumPixels: 16777216 });
const read = source => readXmlDocument(source, PASSIVE_SVG_LIMITS);
function expanded(name, scope, attribute = false) {
  if (name === "xmlns") return { uri: XMLNS, local: "xmlns" };
  const at = name.indexOf(":"), prefix = at < 0 ? "" : name.slice(0, at), local = at < 0 ? name : name.slice(at + 1);
  return { uri: prefix ? scope.get(prefix) ?? "" : attribute ? "" : scope.get("") ?? "", local };
}
function records(document) {
  const result = [], stack = [{ node: document, parent: null, scope: new Map([["xml", XML], ["xmlns", XMLNS]]) }];
  while (stack.length) {
    const frame = stack.pop(), { node } = frame;
    const scope = new Map(frame.scope);
    if (node.kind === "element") {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key === "xmlns") scope.set("", value);
        else if (key.startsWith("xmlns:")) scope.set(key.slice(6), value);
      }
    }
    const record = { node, parent: frame.parent, scope, ...(node.kind === "element" ? expanded(node.name, scope) : {}) };
    result.push(record);
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--) stack.push({ node: node.children[index], parent: record, scope });
  }
  return result;
}

/** Original XML writer node containing the original JSON byte carrier, with derived size and ni. */
export function dataCarrierMetadata({ carrier } = {}) {
  const payload = imagePayload({ carrier });
  return element("metadata", { id: "image-payload" }, [element("image:payload", {
    "xmlns:image": IMAGE_PAYLOAD_PROFILE,
    "media-type": payload.carrier.mediaType,
    encoding: "base64",
    "byte-length": payload.byteLength,
    ni: payload.ni,
  }, [payload.carrier.contentBase64])]);
}

/** Reads bytes without rendering or executing the document. Use inspectPassiveSvg before image admission. */
export function readSvgDataCarrier(source) {
  const all = records(read(source)), found = all.filter(record => record.uri === IMAGE_PAYLOAD_PROFILE && record.local === "payload");
  if (found.length === 0) return null;
  if (found.length !== 1) throw new TypeError("SVG has ambiguous duplicate image payloads");
  const record = found[0], parent = record.parent, root = parent?.parent;
  if (parent?.uri !== SVG || parent.local !== "metadata" || root?.uri !== SVG || root.local !== "svg" || root.parent?.node.kind !== "document")
    throw new TypeError("SVG image payload must be a direct child of root SVG metadata");
  const attributes = {};
  for (const [name, value] of Object.entries(record.node.attributes)) {
    const attr = expanded(name, record.scope, true);
    if (attr.uri === XMLNS) continue;
    if (attr.uri || !["media-type", "encoding", "byte-length", "ni"].includes(attr.local)) throw new TypeError("SVG image payload has an unsupported attribute");
    attributes[attr.local] = value;
  }
  if (Object.keys(attributes).length !== 4 || attributes.encoding !== "base64" || !/^(?:0|[1-9][0-9]*)$/u.test(attributes["byte-length"]))
    throw new TypeError("SVG image payload requires canonical encoding, length, type and identity");
  if (!Number.isSafeInteger(Number(attributes["byte-length"])) || Number(attributes["byte-length"]) > IMAGE_PAYLOAD_LIMITS.maximumBytes)
    throw new RangeError("SVG image payload declares an oversized byte length before decoding");
  if (record.node.children.some(node => node.kind !== "text" && node.kind !== "cdata")) throw new TypeError("SVG image payload must contain only encoded bytes");
  const contentBase64 = record.node.children.map(node => node.value).join("");
  const payload = imagePayload({ carrier: { mediaType: attributes["media-type"], contentBase64 } });
  if (String(payload.byteLength) !== attributes["byte-length"] || payload.ni !== attributes.ni) throw new TypeError("SVG image payload size or sha-256 does not match its bytes");
  return Object.freeze({ carrier: payload.carrier, byteLength: payload.byteLength, ni: payload.ni });
}

const ELEMENTS = new Set(["svg", "g", "defs", "clipPath", "marker", "linearGradient", "radialGradient", "pattern", "stop", "title", "desc", "metadata", "path", "rect", "line", "circle", "ellipse", "polygon", "polyline", "text", "tspan"]);
const ATTRIBUTES = new Set(["id", "class", "role", "lang", "version", "baseProfile", "width", "height", "viewBox", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "dx", "dy", "d", "points", "transform", "fill", "stroke", "color", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "vector-effect", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "alignment-baseline", "letter-spacing", "word-spacing", "textLength", "lengthAdjust", "rotate", "visibility", "display", "clip-path", "clipPathUnits", "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient", "preserveAspectRatio", "gradientUnits", "gradientTransform", "spreadMethod", "offset", "stop-color", "stop-opacity", "fx", "fy", "fr", "shape-rendering", "text-rendering", "patternUnits", "patternContentUnits", "pointer-events"]);
const PAINT = new Set(["fill", "stroke", "color", "stop-color"]);
const REFERENCES = new Set(["clip-path", "marker-start", "marker-mid", "marker-end"]);
const RESOURCE_ELEMENTS = new Set(["pattern", "marker", "clipPath", "linearGradient", "radialGradient"]);
const NUMERIC_ATTRIBUTES = new Set(["width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "dx", "dy", "stroke-width", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity", "stroke-opacity", "font-size", "letter-spacing", "word-spacing", "textLength", "rotate", "markerWidth", "markerHeight", "refX", "refY", "offset", "stop-opacity", "fx", "fy", "fr"]);
const NUMBER = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;
const NUMBER_SCAN = /[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/gu;
function finiteNumbers(value) {
  return [...value.matchAll(NUMBER_SCAN)].every(match => Number.isFinite(Number(match[0])) && Math.abs(Number(match[0])) <= 1e9);
}
function dimension(value) {
  if (typeof value !== "string") return null;
  const numeric = value.endsWith("px") ? value.slice(0, -2) : value;
  return NUMBER.test(numeric) ? Number(numeric) : null;
}
function paint(value) {
  return /^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|[A-Za-z]{1,32})$/u.test(value) ||
    /^(?:rgb|rgba|hsl|hsla)\([0-9+.,%\s/-]+\)$/u.test(value);
}
function localReference(value) {
  const match = /^url\(#([A-Za-z_][A-Za-z0-9_.:-]{0,127})\)$/u.exec(value);
  return match?.[1] ?? null;
}
function inertMetadata(record) {
  return record.parent?.uri === SVG && record.parent.local === "metadata";
}

/** Throws on active/external/unknown presentation features; returns checked intrinsic image dimensions. */
export function inspectPassiveSvg(source) {
  const all = records(read(source)), roots = all.filter(record => record.node.kind === "element" && record.parent?.node.kind === "document");
  if (roots.length !== 1 || roots[0].uri !== SVG || roots[0].local !== "svg") throw new TypeError("passive SVG requires one namespaced svg root");
  const root = roots[0], ids = new Map(), references = [];
  for (const record of all) {
    const { node } = record;
    if (node.kind === "pi") throw new TypeError("passive SVG excludes processing instructions");
    if (node.kind === "xmldecl" && node.encoding && node.encoding.toUpperCase() !== "UTF-8") throw new TypeError("passive SVG requires UTF-8 text");
    if (node.kind !== "element") continue;
    const foreign = record.uri !== SVG;
    if (foreign) {
      if (!record.uri || ACTIVE_NAMESPACES.has(record.uri) || !inertMetadata(record) || node.children.some(child => !["text", "cdata", "comment"].includes(child.kind)))
        throw new TypeError("passive SVG permits foreign text-only data only inside metadata");
    } else if (!ELEMENTS.has(record.local) || (record.local === "svg" && record !== root)) {
      throw new TypeError(`passive SVG excludes element ${record.local}`);
    }
    for (const [name, value] of Object.entries(node.attributes)) {
      const attr = expanded(name, record.scope, true);
      if (attr.uri === XMLNS) continue;
      if (attr.uri === XML && attr.local === "lang") continue;
      if (attr.uri || /^on/iu.test(attr.local) || ["href", "style"].includes(attr.local)) throw new TypeError(`passive SVG excludes attribute ${name}`);
      if (!foreign && !ATTRIBUTES.has(name) && !/^data-[a-zA-Z0-9_.:-]+$/u.test(name) && !/^aria-[a-z-]+$/u.test(name)) throw new TypeError(`passive SVG excludes attribute ${name}`);
      if (name === "id") {
        if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u.test(value) || ids.has(value)) throw new TypeError("passive SVG requires bounded unique ids");
        ids.set(value, foreign ? "foreign" : record.local);
      }
      if (foreign) continue; // Foreign text attributes cannot select rendering features.
      if (name === "pointer-events" && value !== "none") throw new TypeError("passive SVG pointer-events admits only none");
      if (NUMERIC_ATTRIBUTES.has(name) && value !== "none" && (!/^[0-9+.,eE%px\s-]+$/u.test(value) || !finiteNumbers(value))) throw new TypeError("passive SVG numerical attribute is outside its finite numeric profile");
      if (PAINT.has(name) || REFERENCES.has(name)) {
        const target = localReference(value);
        if (target) {
          for (let ancestor = record; ancestor; ancestor = ancestor.parent) if (RESOURCE_ELEMENTS.has(ancestor.local)) throw new TypeError("passive SVG resource definitions cannot reference other resources");
          references.push({ target, attribute: name });
        }
        else if (REFERENCES.has(name) ? value !== "none" : !paint(value)) throw new TypeError("passive SVG paint/reference must be a color or same-document id");
      }
      if (["d", "points", "transform", "gradientTransform"].includes(name)) {
        const allowed = name === "d" ? /^[AaCcHhLlMmQqSsTtVvZz0-9+.,eE\s-]*$/u : name === "points" ? /^[0-9+.,eE\s-]*$/u : /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9+.,eE\s-]+\)\s*)*$/u;
        if (!allowed.test(value) || !finiteNumbers(value)) throw new TypeError("passive SVG geometry is outside its finite numeric profile");
      }
      if (name === "font-family" && !/^[A-Za-z0-9\s,'_-]{1,256}$/u.test(value)) throw new TypeError("passive SVG font family must be a bounded local family list");
      if (value.length > 262144) throw new RangeError("passive SVG attribute exceeds its byte profile");
    }
    if (record.local === "pattern") {
      const width = dimension(node.attributes.width), height = dimension(node.attributes.height);
      if (node.attributes.patternUnits !== "userSpaceOnUse" || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || (node.attributes.patternContentUnits !== undefined && node.attributes.patternContentUnits !== "userSpaceOnUse")) throw new TypeError("passive SVG patterns require bounded user-space tiles");
    }
  }
  for (const { target, attribute } of references) {
    const type = ids.get(target);
    const expected = attribute === "clip-path" ? ["clipPath"] : attribute.startsWith("marker-") ? ["marker"] : ["linearGradient", "radialGradient", "pattern"];
    if (!expected.includes(type)) throw new TypeError("passive SVG reference requires an existing compatible local definition");
  }
  const attributes = root.node.attributes;
  let width = dimension(attributes.width), height = dimension(attributes.height);
  if (attributes.viewBox !== undefined) {
    const pieces = attributes.viewBox.trim().split(/[\s,]+/u);
    if (pieces.length !== 4 || pieces.some(value => !NUMBER.test(value)) || !finiteNumbers(attributes.viewBox) || Number(pieces[2]) <= 0 || Number(pieces[3]) <= 0)
      throw new TypeError("passive SVG viewBox requires four finite numbers and positive size");
    if (attributes.width === undefined) width = Number(pieces[2]);
    if (attributes.height === undefined) height = Number(pieces[3]);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      width > PASSIVE_SVG_LIMITS.maximumDimension || height > PASSIVE_SVG_LIMITS.maximumDimension || width * height > PASSIVE_SVG_LIMITS.maximumPixels)
    throw new RangeError("passive SVG requires bounded positive intrinsic dimensions");
  return Object.freeze({ width, height, byteLength: new TextEncoder().encode(source).byteLength, elementCount: all.filter(record => record.node.kind === "element").length, validation: "passive-svg-image" });
}
