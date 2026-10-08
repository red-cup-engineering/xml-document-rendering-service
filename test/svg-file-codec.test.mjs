import assert from "node:assert/strict";
import test from "node:test";
import { projectSvg, svgProjector } from "../src/xml/svg/index.mjs";

test("projects and recognizes an SVG flatfile", () => {
  const content = projectSvg({ width: 10, height: 10, nodes: [], edges: [] });
  assert.match(content, /<svg/);
  assert.equal(svgProjector.recognize({ path: "proof.svg", content }), true);
});

import { comment, document, element, escapeXmlAttr, escapeXmlText, serialize } from '../src/xml/index.mjs';
import { evidence } from '@red-cup-engineering/signcell/cell';
import { readXmlDocument } from '../src/xml/document-read.mjs';
import { readingOf, rfc7996Profile } from '../src/xml/svg/index.mjs';
const placed = {
  "width": 100,
  "height": 80,
  "nodes": [
    {
      "e": "n<&",
      "a": "kind",
      "v": "value",
      "group": "entity",
      "label": "One\n<&",
      "focus": true,
      "href": "/x",
      "data": {
        "custom": "a&b\tline\nnext\rend"
      },
      "box": {
        "cx": 20,
        "cy": 20,
        "w": 20,
        "h": 10
      }
    }
  ],
  "edges": [
    {
      "from": "n<&",
      "to": "n2",
      "kind": "extends",
      "href": "/edge",
      "fromBox": {
        "cx": 20,
        "cy": 20,
        "w": 20,
        "h": 10
      },
      "toBox": {
        "cx": 20,
        "cy": 60,
        "w": 20,
        "h": 10
      }
    }
  ]
};
placed.nodes[0].evidence = evidence({ for: ["urn:proof:node"] });
placed.edges[0].evidence = evidence({ against: ["urn:proof:edge"] });

test('XML construction escapes text and attributes and refuses malformed names and comments', () => {
  assert.equal(escapeXmlText('<&>'), '&lt;&amp;&gt;');
  assert.equal(escapeXmlAttr('"<&>\''), '&quot;&lt;&amp;&gt;&#39;');
  assert.equal(serialize(element('a', { omitted: null, n: 0 }, ['<&>', false, null, comment('a-b')])), '<a n="0">&lt;&amp;&gt;<!--a-b--></a>');
  assert.equal(document(element('a'), { declaration: true }).startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
  assert.throws(() => element('bad name'), TypeError);
  assert.throws(() => serialize(element('a', { 'bad name': 1 })), TypeError);
  for (const value of ['--', 'x--y', '-', 'x-']) assert.throws(() => comment(value), TypeError);
  assert.equal(serialize(comment('')), '<!---->');
});

test('interactive SVG retains XML attribute values and RFC7996 omits every data attribute and anchor', () => {
  const parsed = readXmlDocument(projectSvg(placed));
  const nodes = [], queue = [parsed];
  while (queue.length) { const node = queue.pop(); nodes.push(node); queue.push(...(node.children ?? [])); }
  assert.equal(nodes.find(node => node.attributes?.['data-e'] === 'n<&').attributes['data-custom'], placed.nodes[0].data.custom);
  const svg = projectSvg(placed, { profile: rfc7996Profile });
  assert.doesNotMatch(svg, /\sdata-|<a[\s>]/);
  assert.deepEqual(rfc7996Profile.lint(svg), { ok: true, violations: [] });
  assert.equal(rfc7996Profile.lint('<svg><text> data-label="x"</text></svg>').ok, true);
  assert.equal(rfc7996Profile.lint('<svg title=" data-label=hello"/>').ok, true);
  for (const svg of ['<svg data-e="e"/>', "<svg data-extra = 'x'/>"]) {
    assert.equal(rfc7996Profile.lint(svg).ok, false);
    assert.equal(rfc7996Profile.lint(svg).violations[0].rule, 'no-data-attribute');
  }
});

test('custom evidence-reading policy supplies node and edge attributes and is not invoked in static profiles', () => {
  const custom = placed;
  const calls = [];
  const readingAttributes = point => { const reading = readingOf(point, 'extremal'); calls.push(reading); return { 'data-value': reading }; };
  const svg = projectSvg(custom, { readingAttributes });
  assert.deepEqual(calls, ['denied', 'held']);
  assert.match(svg, /data-value="held"/);
  assert.match(svg, /data-value="denied"/);
  calls.length = 0;
  assert.doesNotMatch(projectSvg(custom, { readingAttributes, profile: rfc7996Profile }), /\sdata-/);
  assert.deepEqual(calls, []);
});
