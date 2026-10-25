import assert from 'node:assert/strict';
import test from 'node:test';
import { name, qname } from '../src/xml/names.mjs';
import { isXmlName, requireXmlName, element, serialize } from '../src/xml/index.mjs';
import { xmlToJsonTree, jsonTreeToXml, normalizeXml, checkXmlWellFormedness } from '../src/xml/transformations.mjs';
import { readXmlDocument, XmlNamespaceError } from '../src/xml/document-read.mjs';

// Independent test oracle from W3C XML 1.0 Fifth Edition [4], not a
// differential assertion against another implementation or Unicode category.
const starts = [
  [0x3a,0x3a],[0x41,0x5a],[0x5f,0x5f],[0x61,0x7a],
  [0xc0,0xd6],[0xd8,0xf6],[0xf8,0x2ff],[0x370,0x37d],
  [0x37f,0x1fff],[0x200c,0x200d],[0x2070,0x218f],
  [0x2c00,0x2fef],[0x3001,0xd7ff],[0xf900,0xfdcf],
  [0xfdf0,0xfffd],[0x10000,0xeffff],
];
const inStart = cp => starts.some(([lo,hi]) => lo <= cp && cp <= hi);

test('N1/N2: every normative start endpoint and adjacent gap has the specified role', () => {
  const probes = new Set([0,0x10ffff]);
  for (const [lo,hi] of starts) for (const cp of [lo-1,lo,hi,hi+1]) probes.add(cp);
  for (const cp of probes) {
    const s = String.fromCodePoint(cp), expected = inStart(cp);
    assert.equal(name(s), expected, 'Name start U+'+cp.toString(16));
    assert.equal(qname(s), expected && cp !== 0x3a, 'NCName start U+'+cp.toString(16));
    if (expected && cp !== 0x3a) assert.equal(qname(s+':'+s),true);
  }
});

test('N1/N2: continuation-only characters never become starts or QName local starts', () => {
  for (const cp of [0x2d,0x2e,0x30,0x39,0xb7,0x300,0x36f,0x203f,0x2040]) {
    const s=String.fromCodePoint(cp);
    assert.equal(name(s),false);
    assert.equal(qname('p:'+s),false);
    assert.equal(name('a'+s),true);
    assert.equal(qname('p:a'+s),true);
  }
  for (const cp of [0x2f,0xb6,0xb8,0x203e,0x2041]) {
    const s=String.fromCodePoint(cp);
    assert.equal(name('a'+s),false);
    assert.equal(qname('p:a'+s),false);
  }
});

test('N1/N2/N4: whole input, supplementary characters, malformed UTF-16 and colon boundaries', () => {
  for (const s of ['猫','a\u0300','\u{10000}','\u{effff}','a\u200c']) {
    assert.equal(name(s),true); assert.equal(qname(s),true);
  }
  for (const s of ['', '0a', ' a', 'a ', 'a\n', 'a\r', 'a\u2028', 'a\u2029', 'a b', 'a\u0000',
    '\ud800', '\udfff', 'a\ud800', 'a\udfff', '\u{10000}\ud800', '\ud800a', '\udfff\ud800',
    '\u{f0000}', '\u{10ffff}', '\ufffe', '\uffff', 'a\u037e']) {
    assert.equal(name(s),false,JSON.stringify(s));
    assert.equal(qname(s),false,JSON.stringify(s));
  }
  for (const s of [':',':a','a:','a:b:c','::']) {
    assert.equal(name(s),true); assert.equal(qname(s),false);
  }
  assert.equal(qname('猫:名'),true);
  assert.equal(qname('a:0'),false);
  assert.equal(qname('a:\u0300'),false);
});

test('N1/N2/N3: one abstract ToString, original return and exception identity are preserved', () => {
  for (const predicate of [name,qname,isXmlName]) {
    for (const value of [undefined,null,true,false,NaN,Infinity]) assert.equal(predicate(value),true);
    for (const value of [0,1n,42,[],Symbol('x'),Object(Symbol('x'))]) {
      if (typeof value === 'symbol' || Object.prototype.toString.call(value)==='[object Symbol]')
        assert.throws(()=>predicate(value),TypeError);
      else assert.equal(predicate(value),false);
    }
    let calls=0;
    const value={ [Symbol.toPrimitive](hint) { assert.equal(hint,'string'); calls++; return '猫'; } };
    assert.equal(predicate(value),true); assert.equal(calls,1);
    const failure=new Error('coercion sentinel');
    assert.throws(()=>predicate({[Symbol.toPrimitive](){throw failure;}}),e=>e===failure);
    assert.throws(()=>predicate({[Symbol.toPrimitive](){return {};}}),TypeError);
    assert.throws(()=>predicate(Object.create(null)),TypeError);
    const order=[];
    assert.equal(predicate({toString(){order.push('toString');return {};},
      valueOf(){order.push('valueOf');return 'name';}}),true);
    assert.deepEqual(order,['toString','valueOf']);
  }
  let calls=0;
  const original={toString(){calls++;return '猫';}};
  assert.equal(requireXmlName(original),original); assert.equal(calls,1);
  assert.equal(requireXmlName(null),null);
  assert.throws(()=>requireXmlName('bad name'),e=>e instanceof TypeError &&
    e.message==='xml: "bad name" is not a well-formed XML name');
  assert.equal(serialize(element('猫',{'名':'v'})),'<猫 名="v"/>');
});

test('N3: public four-operation Unicode receiving retains namespace error algebra', () => {
  const xml='<猫 xmlns:p="urn:p" p:名="v"><p:\u{10000}/></猫>';
  const parsed=xmlToJsonTree({xml}).document;
  assert.equal(jsonTreeToXml({document:parsed}).xml,xml);
  assert.equal(normalizeXml({xml}).changed,false);
  assert.equal(checkXmlWellFormedness({xml}).wellFormed,true);
  for (const invalid of ['<p:猫/>','<a:b:c/>','<猫 xmlns:p="urn:p" p:名:字="v"/>',
    '<猫 xmlns:xml="urn:wrong"/>','<猫 xmlns:p=""/>','<猫><?p:名 x?></猫>',
    '<猫 xmlns:a="urn:x" xmlns:b="urn:x" a:名="1" b:名="2"/>']) {
    assert.throws(()=>readXmlDocument(invalid),XmlNamespaceError);
    assert.equal(checkXmlWellFormedness({xml:invalid}).wellFormed,false);
    assert.throws(()=>xmlToJsonTree({xml:invalid}),e=>e instanceof TypeError &&
      e.cause instanceof XmlNamespaceError);
  }
  const bad={kind:'document',children:[{kind:'element',name:null,attributes:{},children:[]}]};
  assert.throws(()=>jsonTreeToXml({document:bad}),/name must be a string/);
});
