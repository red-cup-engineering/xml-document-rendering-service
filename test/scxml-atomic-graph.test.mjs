import assert from "node:assert/strict";
import test from "node:test";
import { readAtomicScxmlGraph } from "../src/xml/scxml-atomic-graph.mjs";

const NS = "http://www.w3.org/2005/07/scxml";
const source = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<scxml xmlns="' + NS + '" version="1.0" name="privateCustomerOffer" initial="understand" datamodel="ecmascript">',
  '<datamodel>',
  '<data id="customerQuestions">{"understand":"What does this mean?","decide":"Could doing nothing be better?"}</data>',
  '<data id="conditionallyPayableStages">["buy"]</data>',
  '</datamodel>',
  '<state id="understand"><transition event="advance.qualify" target="qualify"/></state>',
  '<state id="qualify"><transition event="advance.decide" target="decide"/><transition event="advance.closed" target="closed"/></state>',
  '<state id="decide"><transition event="advance.buy" target="buy"/></state>',
  '<state id="buy"><transition event="advance.closed" target="closed"/></state>',
  '<final id="closed"/>',
  '</scxml>',
].join("\n");

test("W3C SCXML namespace reader selects one typed graph and original literal data, without executing", () => {
  const graph = readAtomicScxmlGraph(source);
  assert.equal(graph.format, "W3C-SCXML-1.0/atomic-graph");
  assert.equal(graph.name, "privateCustomerOffer");
  assert.equal(graph.initial, "understand");
  assert.deepEqual(graph.states.map(s => s.id), ["understand", "qualify", "decide", "buy", "closed"]);
  assert.deepEqual(graph.states[1].transitions, [
    { event: "advance.decide", target: "decide" },
    { event: "advance.closed", target: "closed" },
  ]);
  assert.equal(graph.states[4].final, true);
  assert.equal(graph.data.customerQuestions.decide, "Could doing nothing be better?");
  assert.deepEqual(graph.data.conditionallyPayableStages, ["buy"]);
  assert.equal(Object.isFrozen(graph.data.customerQuestions), true);
  assert.equal(Object.isFrozen(graph.data.conditionallyPayableStages), true);
  assert.equal(Object.isFrozen(graph.states[1].transitions), true);
  assert.equal(typeof graph.emit, "undefined", "source admission is not an event engine");
  assert.equal(typeof graph.authorizePayment, "undefined", "SCXML state identity cannot authorize payment");
});

test("other legitimate state IDs and events remain data, not one vendor's hardcoded order", () => {
  const alternate = source.replace('initial="understand"', 'initial="qualify"')
    .replace('event="advance.decide"', 'event="quote.preview"');
  const graph = readAtomicScxmlGraph(alternate);
  assert.equal(graph.initial, "qualify");
  assert.equal(graph.states[1].transitions[0].event, "quote.preview");
});

test("foreign namespaces, unsupported SCXML semantics and unsafe transitions refuse", () => {
  const fail = xml => assert.throws(() => readAtomicScxmlGraph(xml),
    /SCXML|XML|namespace|unsupported|unexpected|target|DTD|invalid|undefined|root|data/i);
  fail(source.replace(NS, "https://attacker.invalid/scxml"));
  fail(source.replace('version="1.0"', 'version="2.0"'));
  fail(source.replace('initial="understand"', 'initial="missing"'));
  fail(source.replace('<state id="understand">', '<state id="qualify">'));
  fail(source.replace('target="qualify"', 'target="missing"'));
  fail(source.replace('event="advance.qualify"', 'event="advance.qualify" cond="true"'));
  fail(source.replace('event="advance.qualify"', 'event="advance.qualify" targetexpr="other"'));
  fail(source.replace('<state id="understand">', '<parallel id="understand">'));
  fail(source.replace('<state id="understand">', '<state id="understand"><script>chargeMoney()</script>'));
  fail(source.replace('<state id="understand">', '<state id="understand"><state id="nested"/>'));
  fail(source.replace('<final id="closed"/>', '<final id="closed"><transition event="back" target="buy"/></final>'));
  fail(source.replace('target="decide"/>', 'target="closed"/>'));
  fail(source.replace('{"understand":"What does this mean?","decide":"Could doing nothing be better?"}', 'doSomethingDangerous()'));
  fail(source.replace('<data id="customerQuestions">', '<data id="customerQuestions" src="https://foreign.invalid/data">'));
  fail(source.replace('<datamodel>', '<datamodel><data id="customerQuestions">{}</data>'));
  fail(source.replace('["buy"]', '{ "__proto__": { "paymentAuthorized": true } }'));
  fail(source.replace('<datamodel>', '<datamodel/><datamodel>'));
  fail(source.replace('datamodel="ecmascript"', 'datamodel="null"'));
  fail(source.replace('</scxml>', '<!DOCTYPE scxml SYSTEM "https://foreign.invalid/not-read.dtd"></scxml>'));
  fail(source.replace('<datamodel>', '<transition event="advance.buy" target="buy"/><datamodel>'));
  assert.throws(() => readAtomicScxmlGraph("x".repeat(70000)), /bounded/);
});

test("the XML reader does not infer a live purchase from a conditionally payable SCXML stage", () => {
  const graph = readAtomicScxmlGraph(source);
  assert.deepEqual(graph.data.conditionallyPayableStages, ["buy"]);
  assert.equal(graph.states.some(s => s.id === "buy"), true);
  assert.equal(graph.states.some(s => s.id === "buy" && s.final), false);
  assert.equal(graph.data.paymentAuthorized, undefined);
  assert.equal(graph.data.price, undefined);
});
