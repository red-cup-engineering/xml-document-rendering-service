/**
 * XML 1.0 (Fifth Edition) markup reader: the one parser of XML in the Group.
 *
 * `parseXml(text, options)` reads a well-formed document into ordered nodes and
 * refuses malformed markup with an `XmlError` that names the line and column.
 * It is non-validating: a document type declaration is recognised and kept as a
 * node, never processed, and entities it declares are not expanded (the caller's
 * `resolveUndefinedEntity` is asked instead).
 *
 * Nodes: `{type:"element", name, attributes, children}`, `{type:"text", text}`,
 * `{type:"cdata", text}`, `{type:"comment", content}`, `{type:"pi", name, content}`,
 * `{type:"xmldecl", version, encoding?, standalone?}`, `{type:"doctype", name, content}`.
 * Options: `preserveCdata`, `preserveComments`, `preserveDocumentType`,
 * `preserveXmlDeclaration` (all off by default), `resolveUndefinedEntity(reference)`.
 * Without `preserveCdata` a CDATA section is merged into the adjacent text.
 */
import { name as isName } from "./names.mjs";

export class XmlError extends Error {
  constructor(message, source, pos) {
    const before = source.slice(0, pos), lines = before.split("\n");
    const line = lines.length, column = lines.at(-1).length + 1;
    super(`${message} (line ${line}, column ${column})`);
    this.name = "XmlError";
    this.line = line;
    this.column = column;
    this.pos = pos;
  }
}

const PREDEFINED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const SPACE = /[ \t\r\n]/u;
const NOT_CHAR = /[^\u0009\u000a\u000d -퟿-�\u{10000}-\u{10ffff}]/u;

export function parseXml(input, options = {}) {
  if (typeof input !== "string") throw new TypeError("parseXml expects a string");
  const source = input.replace(/^﻿/u, "");
  const {
    preserveCdata = false, preserveComments = false, preserveDocumentType = false,
    preserveXmlDeclaration = false, resolveUndefinedEntity,
  } = options;
  const fail = (message, at = pos) => { throw new XmlError(message, source, at); };
  const badChar = NOT_CHAR.exec(source);
  let pos = 0;
  if (badChar) fail("Illegal character", badChar.index);

  const document = { type: "document", children: [] };
  const stack = [document];
  let rootSeen = false;

  const spaces = () => { while (pos < source.length && SPACE.test(source[pos])) pos++; };
  const readName = () => {
    const start = pos;
    while (pos < source.length && !SPACE.test(source[pos]) && !"=/>?<&\"'[]".includes(source[pos])) pos++;
    const value = source.slice(start, pos);
    if (!isName(value)) fail(`Invalid name ${JSON.stringify(value)}`, start);
    return value;
  };
  const expect = (text) => {
    if (!source.startsWith(text, pos)) fail(`Expected ${JSON.stringify(text)}`);
    pos += text.length;
  };
  const until = (terminator, what) => {
    const end = source.indexOf(terminator, pos);
    if (end < 0) fail(`Unclosed ${what}`);
    const value = source.slice(pos, end);
    pos = end + terminator.length;
    return value;
  };
  const decode = (raw, at) => {
    let out = "", cursor = 0;
    const normalize = (text) => text.replace(/\r\n?/gu, "\n");
    for (const match of raw.matchAll(/&([^;&<\s]*);?/gu)) {
      out += normalize(raw.slice(cursor, match.index));
      cursor = match.index + match[0].length;
      const body = match[1];
      if (!match[0].endsWith(";")) fail("Unescaped ampersand or unterminated entity reference", at + match.index);
      if (body[0] === "#") {
        const code = /^#x[0-9a-fA-F]+$/u.test(body) ? parseInt(body.slice(2), 16)
          : /^#[0-9]+$/u.test(body) ? parseInt(body.slice(1), 10) : NaN;
        if (!Number.isInteger(code) || code > 0x10ffff || NOT_CHAR.test(String.fromCodePoint(code)))
          fail(`Invalid character reference &${body};`, at + match.index);
        out += String.fromCodePoint(code);
      } else if (Object.hasOwn(PREDEFINED, body)) {
        out += PREDEFINED[body];
      } else if (isName(body) && resolveUndefinedEntity) {
        out += resolveUndefinedEntity(`&${body};`) ?? "";
      } else {
        fail(`Named entity isn't defined: &${body};`, at + match.index);
      }
    }
    out += normalize(raw.slice(cursor));
    return out;
  };
  const push = (node) => {
    const parent = stack.at(-1);
    if (parent === document && node.type === "element") {
      if (rootSeen) fail("Only one root element is allowed");
      rootSeen = true;
    }
    parent.children.push(node);
  };
  const pushText = (type, text, at) => {
    const parent = stack.at(-1);
    if (parent === document) {
      if (/[^ \t\r\n]/u.test(text)) fail("Text is not allowed outside the root element", at);
      return;
    }
    if (text === "") return;
    const last = parent.children.at(-1);
    if (last && last.type === "text" && type === "text" || (last && last.type === "text" && type === "cdata" && !preserveCdata)) last.text += text;
    else parent.children.push({ type: type === "cdata" && !preserveCdata ? "text" : type, text });
  };

  while (pos < source.length) {
    const lt = source.indexOf("<", pos);
    const textEnd = lt < 0 ? source.length : lt;
    if (textEnd > pos) {
      const raw = source.slice(pos, textEnd);
      const cdataEnd = raw.indexOf("]]>");
      if (cdataEnd >= 0) fail("Text must not contain ']]>'", pos + cdataEnd);
      pushText("text", decode(raw, pos), pos);
      pos = textEnd;
    }
    if (lt < 0) break;
    const start = pos;
    if (source.startsWith("<!--", pos)) {
      pos += 4;
      const content = until("-->", "comment");
      if (content.includes("--") || content.endsWith("-")) fail("Comment must not contain '--'", start);
      if (preserveComments) push({ type: "comment", content: content.replace(/\r\n?/gu, "\n") });
    } else if (source.startsWith("<![CDATA[", pos)) {
      if (stack.length === 1) fail("CDATA is not allowed outside the root element");
      pos += 9;
      pushText("cdata", until("]]>", "CDATA section").replace(/\r\n?/gu, "\n"), start);
    } else if (source.startsWith("<!DOCTYPE", pos)) {
      if (rootSeen || document.children.some((node) => node.type === "doctype") || stack.length > 1) fail("Misplaced document type declaration");
      pos += 9;
      if (!SPACE.test(source[pos] ?? "")) fail("Expected whitespace after DOCTYPE", pos);
      let depth = 0, quote = null;
      const contentStart = pos;
      for (; pos < source.length; pos++) {
        const ch = source[pos];
        if (quote) { if (ch === quote) quote = null; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ">" && depth <= 0) break;
      }
      if (pos >= source.length) fail("Unclosed document type declaration", start);
      const content = source.slice(contentStart, pos).trim();
      pos++;
      if (preserveDocumentType) push({ type: "doctype", name: content.split(/\s/u)[0], content });
    } else if (source.startsWith("<?", pos)) {
      pos += 2;
      const target = readName();
      const content = until("?>", "processing instruction").replace(/^[ \t\r\n]+/u, "");
      if (target.toLowerCase() === "xml") {
        if (start !== 0 || target !== "xml") fail("XML declaration is only allowed at the start of the document", start);
        const declaration = { type: "xmldecl" };
        const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
        for (const match of content.matchAll(pattern)) {
          const key = match[1];
          if (!["version", "encoding", "standalone"].includes(key) || key in declaration) fail("Invalid XML declaration", start);
          declaration[key] = match[2] ?? match[3];
        }
        if (declaration.version === undefined || content.replace(pattern, "").trim() !== "")
          fail("Invalid XML declaration", start);
        if (declaration.standalone !== undefined && !["yes", "no"].includes(declaration.standalone)) fail("Invalid standalone value", start);
        if (preserveXmlDeclaration) push(declaration);
      } else {
        push({ type: "pi", name: target, content: content.replace(/\r\n?/gu, "\n") });
      }
    } else if (source.startsWith("</", pos)) {
      pos += 2;
      const closing = readName();
      spaces();
      expect(">");
      const open = stack.at(-1);
      if (stack.length === 1 || open.name !== closing)
        fail(`Close tag doesn't match the open tag${stack.length > 1 ? ` <${open.name}>` : ""}`, start);
      stack.pop();
    } else {
      pos++;
      const elementName = readName();
      const attributes = {};
      for (;;) {
        const before = pos;
        spaces();
        if (source[pos] === ">" || source.startsWith("/>", pos)) break;
        if (pos === before) fail("Expected whitespace between attributes");
        const attribute = readName();
        spaces();
        expect("=");
        spaces();
        const quote = source[pos];
        if (quote !== '"' && quote !== "'") fail("Attribute value must be quoted");
        pos++;
        const valueStart = pos;
        const end = source.indexOf(quote, pos);
        if (end < 0) fail("Unclosed attribute value", valueStart);
        const raw = source.slice(valueStart, end);
        const bad = raw.indexOf("<");
        if (bad >= 0) fail("Attribute value must not contain '<'", valueStart + bad);
        if (Object.hasOwn(attributes, attribute)) fail(`Attribute ${attribute} is repeated`, valueStart);
        attributes[attribute] = decode(raw.replace(/\r\n|[\t\n\r]/gu, " "), valueStart);
        pos = end + 1;
      }
      if (stack.length === 1 && rootSeen) fail("Only one root element is allowed", start);
      const element = { type: "element", name: elementName, attributes, children: [] };
      push(element);
      if (source[pos] === "/") { pos += 2; } else { pos++; stack.push(element); }
    }
  }
  if (stack.length > 1) fail(`Unclosed <${stack.at(-1).name}>`, source.length);
  if (!rootSeen) fail("Missing root element", source.length);
  return document;
}
