/**
 * A deliberately small, read-only W3C SCXML 1.0 atomic statechart projection.
 *
 * This is NOT an SCXML interpreter. It admits a standard null/ECMAScript
 * graph whose unguarded transitions have one event and one target, and reads
 * literal JSON data without evaluating expressions, sending events, starting
 * services, authorizing effects or executing any XML content.
 *
 * Ownership: Red Cup XML Engineering for syntax and graph identity.
 * Customer payment, launch and publication authorization stay with the
 * independently sourced application and its actual incumbent.
 */
import { readXmlDocument } from "./document-read.mjs";

const SCXML = "http://www.w3.org/2005/07/scxml";
const SCXML_STATE = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const SCXML_EVENT = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const MAX_BYTES = 65_536;
const MAX_STATES = 256;
const MAX_TRANSITIONS = 2048;
const MAX_DATA = 64;
const fail = (message) => { throw new TypeError("SCXML atomic graph: " + message); };

function cleanChildren(node) {
  if (!Array.isArray(node?.children)) fail("XML children are required");
  const meaningful = [];
  for (const child of node.children) {
    if (child.kind === "comment" || child.kind === "pi") continue;
    if (child.kind === "text" && child.value.trim() === "") continue;
    if (child.kind !== "element") fail("unexpected executable or non-element content");
    meaningful.push(child);
  }
  return meaningful;
}

function attributes(node, accepted) {
  if (!node || node.kind !== "element" || !node.attributes ||
      Object.keys(node.attributes).some(key => !accepted.includes(key))) {
    fail("unsupported element attributes or SCXML feature");
  }
  return node.attributes;
}

function inlineJsonData(node) {
  const attr = attributes(node, ["id"]);
  if (typeof attr.id !== "string" || !SCXML_STATE.test(attr.id)) fail("data requires a lexical SCXML ID");
  if (!Array.isArray(node.children) || node.children.some(child =>
    child.kind !== "text" && child.kind !== "cdata" && child.kind !== "comment")) {
    fail("data may hold only inline JSON, not expressions, URLs or executable XML");
  }
  const text = node.children.filter(child => child.kind === "text" || child.kind === "cdata")
    .map(child => child.value).join("");
  let value;
  try { value = JSON.parse(text); }
  catch { fail("data " + attr.id + " must contain literal JSON, not a script"); }
  // The caller receives data as observations, not executable SCXML expressions.
  return Object.freeze({ id: attr.id, value });
}

function readState(node) {
  const final = node.name === "final";
  if (!final && node.name !== "state") fail("only atomic state/final elements are supported");
  const attr = attributes(node, ["id"]);
  if (typeof attr.id !== "string" || !SCXML_STATE.test(attr.id)) fail("state requires a lexical SCXML ID");
  if (final && cleanChildren(node).length) fail("a final state cannot contain transitions");
  const transitions = [];
  for (const child of cleanChildren(node)) {
    if (child.name !== "transition") fail("nested, parallel and executable SCXML are not in the atomic profile");
    const edge = attributes(child, ["event", "target"]);
    if (typeof edge.event !== "string" || !SCXML_EVENT.test(edge.event) ||
        typeof edge.target !== "string" || !SCXML_STATE.test(edge.target) ||
        cleanChildren(child).length) {
      fail("each atomic transition needs exactly one event and one target, without content or guards");
    }
    if (transitions.some(t => t.event === edge.event || t.target === edge.target)) {
      fail("ambiguous or duplicate transition for state " + attr.id);
    }
    transitions.push(Object.freeze({ event: edge.event, target: edge.target }));
  }
  return Object.freeze({
    id: attr.id, final,
    transitions: Object.freeze(transitions),
  });
}

/** Read the existing XML engine's parsed SCXML profile, not a second XML grammar. */
export function readAtomicScxmlGraph(xml) {
  if (typeof xml !== "string" || !xml.trim() ||
      new TextEncoder().encode(xml).byteLength > MAX_BYTES) {
    fail("bounded UTF-8 XML source text is required");
  }
  const doc = readXmlDocument(xml, {
    maximumNodes: 8192, maximumDepth: 16, maximumAttributes: 8192,
  });
  const roots = doc.children.filter(child => child.kind === "element");
  if (roots.length !== 1 || doc.children.some(child =>
    !["element", "comment", "xmldecl"].includes(child.kind) &&
    !(child.kind === "text" && child.value.trim() === ""))) {
    fail("one SCXML root document is required");
  }
  const root = roots[0];
  if (root.name !== "scxml") fail("SCXML root must have its standard element name");
  const attrs = attributes(root, ["xmlns", "version", "initial", "name", "datamodel"]);
  if (attrs.xmlns !== SCXML || attrs.version !== "1.0" ||
      !SCXML_STATE.test(attrs.initial ?? "") ||
      (attrs.name !== undefined && !SCXML_STATE.test(attrs.name)) ||
      !["null", "ecmascript"].includes(attrs.datamodel)) {
    fail("W3C SCXML 1.0 namespace, version, initial and datamodel are required");
  }
  const states = [];
  let datamodel = null, edgeCount = 0;
  for (const child of cleanChildren(root)) {
    if (child.name === "datamodel") {
      if (datamodel !== null || attrs.datamodel !== "ecmascript") {
        fail("only one literal ECMAScript data model is supported");
      }
      attributes(child, []);
      const data = new Map();
      for (const record of cleanChildren(child)) {
        if (record.name !== "data") fail("SCXML data model may only contain inline data");
        const entry = inlineJsonData(record);
        if (data.has(entry.id) || data.size >= MAX_DATA) fail("duplicate or oversized SCXML data model");
        data.set(entry.id, entry.value);
      }
      datamodel = data;
    } else {
      const state = readState(child);
      if (states.length >= MAX_STATES || states.some(x => x.id === state.id)) {
        fail("duplicate or excessive SCXML state identity");
      }
      states.push(state);
      edgeCount += state.transitions.length;
      if (edgeCount > MAX_TRANSITIONS) fail("too many SCXML transitions");
    }
  }
  if (states.length === 0 || !states.some(state => state.id === attrs.initial)) {
    fail("SCXML initial state must exist");
  }
  const ids = new Set(states.map(state => state.id));
  for (const state of states) for (const transition of state.transitions) {
    if (!ids.has(transition.target)) fail("unresolved target " + transition.target);
  }
  if (attrs.datamodel === "ecmascript" && datamodel === null) {
    fail("ECMAScript profile needs its explicit literal datamodel");
  }
  const values = Object.create(null);
  for (const [key, value] of datamodel ?? new Map()) values[key] = value;
  return Object.freeze({
    format: "W3C-SCXML-1.0/atomic-graph",
    name: attrs.name ?? null,
    initial: attrs.initial,
    states: Object.freeze(states),
    data: Object.freeze(values),
  });
}
