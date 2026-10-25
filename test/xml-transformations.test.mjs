import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {xmlToJsonTree,jsonTreeToXml,normalizeXml,checkXmlWellFormedness} from '../src/xml/transformations.mjs';
import {readXmlDocument, XmlError, UnsupportedXmlFeatureError} from '../src/xml/document-read.mjs';
import xml2js from 'xml2js';
import {XMLParser, XMLValidator} from 'fast-xml-parser';
const wrap=(children)=>({kind:'document',children});
const root=(name='r',attributes={},children=[])=>({kind:'element',name,attributes,children});
// One exact representative corpus feeds native round-trip and real third-party
// compatibility assays; later additions cannot silently miss either gate.
const XML_INTEROP_VALID=Object.freeze([
  '<r/>','<r a="1"/>','<r xmlns="urn:r"/>',
  '<r xmlns:p="urn:p"><p:x/></r>','<r><x/><x/></r>',
  '<r>a<b/>c</r>','<r><![CDATA[a<b]]></r>','<r><!--a--></r>',
  '<r><?pi data?></r>','<猫>😀</猫>','<r a="&#9;">&#13;</r>',
  '<r xmlns:p="urn:p" p:x="1"/>','<r xml:lang="en"/>',
  '<r>line'+String.fromCharCode(10)+'break</r>',
  '<r a="&amp;"/>','<r>&#x1F600;</r>',
  '<r><a xmlns="urn:one"/><a xmlns="urn:two"/></r>',
  '<r xmlns:p="urn:p"><x xmlns:p="urn:q" p:n="v"/></r>',
  '<r>hello<![CDATA[world]]></r>',
  '<r a="one">x<item/>z<![CDATA[<y>]]></r>',
]);

test('ordered XML round trip retains mixed content, Unicode names, namespace scopes and CR/attribute whitespace',()=>{
 const document=wrap([{kind:'xmldecl',version:'1.0',encoding:'UTF-8',standalone:'yes'},root('猫',{'xmlns':'urn:root','xmlns:p':'urn:p','p:a':'a\tb\nc\rd','__proto__':'ordinary'},[{kind:'text',value:'x\ry & z'},{kind:'cdata',value:'<raw>'},{kind:'comment',value:'note'},{kind:'pi',name:'pi',value:'data'},root('p:child',{'xmlns:p':'urn:other'},[]),root('plain',{'xmlns':''},[])])]);
 // JSON parse makes prototype-looking names ordinary own data properties.
 document.children[1].attributes=JSON.parse('{"xmlns":"urn:root","xmlns:p":"urn:p","p:a":"a\\tb\\nc\\rd","__proto__":"ordinary"}');
 const result=jsonTreeToXml({document});assert.match(result.xml,/a&#9;b&#10;c&#13;d/);assert.match(result.xml,/x&#13;y &amp; z/);assert.deepEqual(xmlToJsonTree({xml:result.xml}).document,document);
 assert.equal(checkXmlWellFormedness({xml:'<r xmlns="urn:x" xmlns:p="urn:x" a="1" p:a="2"/>'}).wellFormed,true);
 assert.equal(xmlToJsonTree({xml:'<r a="x\r\ny\tz">x\r\ny</r>'}).document.children[0].attributes.a,'x y z');
});
test('normalization retains parsed values and reports lexical changes without claiming C14N',()=>{
 const input={xml:"<?xml version='1.0' encoding='ISO-8859-1'?><r a='x&#13;y'>a&#xD;b<![CDATA[c]]><!--d--><?pi e?></r>"};
 const result=normalizeXml(input);assert.equal(result.changed,true);assert.match(result.xml,/encoding="UTF-8"/);const before=xmlToJsonTree(input).document,after=xmlToJsonTree({xml:result.xml}).document;before.children[0].encoding='UTF-8';assert.deepEqual(before,after);
 assert.equal(normalizeXml({xml:result.xml}).changed,false);
});
test('malformed markup and namespace failures are truthful check results but refused conversions',()=>{
 for(const xml of ['<r><a></r>','<p:r/>','<r xmlns:a="urn:x" xmlns:b="urn:x" a:n="1" b:n="2"/>','<r xmlns:xml="urn:wrong"/>','<r xmlns:p=""/>','<r><?p:target data?></r>','<r>\u0000</r>','<r>&unknown;</r>']){
  const result=checkXmlWellFormedness({xml});assert.equal(result.wellFormed,false,xml);assert.equal(result.diagnostics.length,1);assert(result.diagnostics[0].message.length<=1024);assert.throws(()=>xmlToJsonTree({xml}),TypeError);
 }
 const native=checkXmlWellFormedness({xml:'<r>\n<a></r>'});assert.equal(typeof native.diagnostics[0].line,'number');assert.equal(typeof native.diagnostics[0].column,'number');
});
test('unsupported features, unrepresentable nodes and structural/byte limits are refused',()=>{
 for(const xml of ['<!DOCTYPE r><r/>','<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>','<?xml version="1.1"?><r/>'])for(const fn of [xmlToJsonTree,normalizeXml,checkXmlWellFormedness])assert.throws(()=>fn({xml}),TypeError);
 for(const node of [{kind:'comment',value:'a\rb'},{kind:'comment',value:'--'},{kind:'cdata',value:'a\rb'},{kind:'cdata',value:']]>'},{kind:'pi',name:'xml',value:'x'},{kind:'pi',name:'p',value:'?>'},{kind:'text',value:'\ud800'},{kind:'text',value:'\u0000'}])assert.throws(()=>jsonTreeToXml({document:wrap([root('r',{},[node])])}),TypeError);
 assert.throws(()=>jsonTreeToXml({document:wrap([wrap([root()])])}),TypeError);assert.throws(()=>jsonTreeToXml({document:wrap([root()]),extra:true}),TypeError);
 const cycle=wrap([]);cycle.children.push(cycle);assert.throws(()=>jsonTreeToXml({document:cycle}),TypeError);
 const maximum='<r>'+'a'.repeat(65529)+'</r>';assert.equal(xmlToJsonTree({xml:maximum}).byteLength,65536);assert.equal(normalizeXml({xml:maximum}).byteLength,65536);assert.throws(()=>xmlToJsonTree({xml:maximum+' '}),RangeError);
 assert.throws(()=>xmlToJsonTree({xml:'<r>'+'<a/>'.repeat(8191)+'</r>'}),RangeError);
 assert.throws(()=>xmlToJsonTree({xml:'<r>'.repeat(65)+'</r>'.repeat(65)}),RangeError);
});
test('selected pinned W3C XML and namespace conformance fixtures retain their expected outcomes',()=>{
 const corpus=JSON.parse(fs.readFileSync(new URL('./fixtures/w3c-xml-and-namespaces.json',import.meta.url)));assert.equal(corpus.fixtures.length,62);
 for(const f of corpus.fixtures){assert.equal(createHash('sha256').update(f.xml).digest('hex'),f.sha256);assert.equal(checkXmlWellFormedness({xml:f.xml}).wellFormed,f.expected,f.path);}
});

test('direct XML reader enforces bounded preparse admission, never fake parser success',()=>{
 const giant='<r>'+('a'.repeat(1048576))+'</r>';
 assert.throws(()=>readXmlDocument(giant), /maximumInputBytes before parsing/);
 assert.throws(()=>readXmlDocument('<r/>',{maximumInputBytes:3}), /maximumInputBytes before parsing/);
 for(const options of [{maximumNodes:NaN},{maximumNodes:0},{maximumDepth:-1},
   {maximumAttributes:Infinity},{maximumInputBytes:Infinity},
   {maximumInputBytes:1048577},{maximumNodes:65537}])
   assert.throws(()=>readXmlDocument('<r/>',options), RangeError);
 for(const invalid of [42,null,'<r>'+String.fromCharCode(0xD800)+'</r>'])
   assert.throws(()=>readXmlDocument(invalid),TypeError);
 assert.equal(readXmlDocument('<r/>',{maximumInputBytes:4,maximumDepth:1,maximumNodes:2}).children[0].name,'r');
 assert.throws(()=>readXmlDocument('<r/>',{maximumNodes:1}), /exceeds 1 nodes/);
 assert.throws(()=>readXmlDocument('<r a="1"/>',{maximumAttributes:0}), /exceeds 0 attributes/);
});

test('direct reader rejects dense XML allocations before parse without mistaking literal markup for nodes',()=>{
 const excessive=[
   '<r>'+'<x/>'.repeat(10000)+'</r>',
   '<r>'+'<!---->'.repeat(10000)+'</r>',
   '<r>'+'<![CDATA[]]>'.repeat(10000)+'</r>',
   '<r>'+'<?p x?>'.repeat(10000)+'</r>',
   '<r>'.repeat(65)+'</r>'.repeat(65),
   '<r '+Array.from({length:8200},(_,i)=>'a'+i+'="v"').join(' ')+'/>',
 ];
 for(const xml of excessive) assert.throws(()=>readXmlDocument(xml),/before parsing/,
   'dense native tree must be refused before allocation');
 const pretend='<x/>'.repeat(10000);
 const mixed='<r><!--'+pretend+'--><![CDATA['+pretend+']]><?pi data?></r>';
 assert.deepEqual(readXmlDocument(mixed).children[0].children.map(x=>x.kind),
   ['comment','cdata','pi']);
 const entity='<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>';
 assert.doesNotThrow(()=>readXmlDocument('<r><!--'+entity+'--><![CDATA['+entity+']]></r>'),
   'literal DTD spellings do not make a document a DTD');
 assert.throws(()=>readXmlDocument(entity+'<r>&x;</r>'),/DTD processing/,
   'real declarations must refuse before full-tree parsing');
 assert.equal(checkXmlWellFormedness({xml:'<r><x></r>'}).wellFormed,false,
   'ordinary native malformed-markup diagnostics survive preflight');
});

test('raw input limits and JSON fanout refuse before unbounded traversal',()=>{
 // An oversize string may contain bad Unicode; resource rejection must happen
 // without calling the potentially expensive Unicode scanner at all.
 const original=String.prototype.isWellFormed;
 try {
  String.prototype.isWellFormed=function(){throw new Error('oversize Unicode scan was invoked');};
  assert.throws(()=>readXmlDocument('x'.repeat(1048577)), /maximumInputBytes before parsing/);
  for(const operation of [xmlToJsonTree,normalizeXml,checkXmlWellFormedness])
   assert.throws(()=>operation({xml:'x'.repeat(65537)}), /65536 UTF-8 bytes/);
 } finally {
  String.prototype.isWellFormed=original;
 }
 // Reject all queued JSON siblings before touching any child. This is a
 // tested allocation frontier, not a synthetic proof of native deployment.
 const siblings=Array(100000).fill(root('item'));
 siblings[Symbol.iterator]=()=>{throw new Error('wide child list was traversed');};
 assert.throws(()=>jsonTreeToXml({document:wrap(siblings)}), /8192 nodes before traversal/);
 assert.deepEqual(xmlToJsonTree({xml:'<r><x/><x/></r>'}).document.children[0].children.map(n=>n.kind),['element','element']);
});

test('the four authored XML Market operations preserve ordered semantics across 30 representative cases',()=>{

 for(const xml of XML_INTEROP_VALID) {
  const parsed=xmlToJsonTree({xml});
  assert.equal(checkXmlWellFormedness({xml}).wellFormed,true,xml);
  const fromNodes=jsonTreeToXml({document:parsed.document}).xml;
  assert.deepEqual(xmlToJsonTree({xml:fromNodes}).document,parsed.document,xml);
  assert.deepEqual(xmlToJsonTree({xml:normalizeXml({xml}).xml}).document,parsed.document,xml);
 }
 // Ordered nodes retain mixed text/repetition; NOT xml2js plain JS object output.
 const mixed=xmlToJsonTree({xml:'<r>x<item>1</item>y<item>2</item>z</r>'}).document.children[0];
 assert.deepEqual(mixed.children.map(n=>n.kind),['text','element','text','element','text']);
 assert.deepEqual(mixed.children.filter(n=>n.kind==='element').map(n=>n.name),['item','item']);
 const malformed=['<r><x></r>','<p:r/>',
  '<r xmlns:a="urn:x" xmlns:b="urn:x" a:n="1" b:n="2"/>',
  '<r>&undefined;</r>','<r>'+String.fromCharCode(0)+'</r>'];
 for(const xml of malformed) {
  assert.equal(checkXmlWellFormedness({xml}).wellFormed,false,xml);
  assert.throws(()=>xmlToJsonTree({xml}),TypeError);
 }
 const unsupported=[
  '<!DOCTYPE r><r/>',
  '<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>',
  '<!DOCTYPE r [<!ENTITY e SYSTEM "file:///etc/passwd">]><r>&e;</r>',
  '<?xml version="1.1"?><r/>',
 ];
 for(const xml of unsupported) {
  assert.throws(()=>xmlToJsonTree({xml}),TypeError);
  assert.throws(()=>normalizeXml({xml}),TypeError);
  assert.throws(()=>checkXmlWellFormedness({xml}),TypeError);
 }
 assert.throws(()=>xmlToJsonTree({xml:'<r>'.repeat(65)+'</r>'.repeat(65)}),RangeError);
 assert.throws(()=>xmlToJsonTree({xml:'<r>'+('a'.repeat(65531))+'</r>'}),RangeError);
});

test('real xml2js and maintained fast-xml-parser interoperability has explicit, bounded non-equivalence',async()=>{
 // These are real reference packages, not hand-authored approximations of their
 // output. No adapter may promise a drop-in xml2js object from ordered nodes.
 // Run actual reference parse against the *same* twenty diverse native
 // positive inputs, rather than citing old package descriptions as evidence.
 assert.equal(XML_INTEROP_VALID.length,20);
 const comparator=new XMLParser({
  preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'@_',
  removeNSPrefix:false,parseTagValue:false,parseAttributeValue:false,
  trimValues:false,cdataPropName:'#cdata',commentPropName:'#comment',
 });
 for(const xml of XML_INTEROP_VALID){
  const tree=xmlToJsonTree({xml}).document;
  const rootNode=tree.children.find(node=>node.kind==='element');
  const legacyParsed=await xml2js.parseStringPromise(xml,{explicitArray:true,trim:false});
  const modernParsed=comparator.parse(xml);
  assert.ok(Object.hasOwn(legacyParsed,rootNode.name),
    `xml2js loses the valid root ${rootNode.name} for ${xml}`);
  assert.ok(modernParsed.some(node=>Object.hasOwn(node,rootNode.name)),
    `fast-xml-parser loses the valid root ${rootNode.name} for ${xml}`);
 }
 const source='<r id="7">x<item>01</item>y<item>2</item>z</r>';
 const ours=xmlToJsonTree({xml:source}).document;
 const ownRoot=ours.children[0];
 const legacy=await xml2js.parseStringPromise(source,{explicitArray:true,trim:false});
 const maintained=new XMLParser({
  preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'@_',
  parseTagValue:false,parseAttributeValue:false,trimValues:false,
  cdataPropName:'#cdata',commentPropName:'#comment',
 }).parse(source);
 assert.deepEqual(legacy.r.item,['01','2']);
 assert.equal(legacy.r.$.id,'7');
 assert.deepEqual(ownRoot.children.map(node=>node.kind),['text','element','text','element','text']);
 assert.deepEqual(ownRoot.children.map(node=>node.value??node.name),['x','item','y','item','z']);
 assert.equal(ownRoot.attributes.id,'7');
 const maintainedRoot=maintained.find(node=>Object.hasOwn(node,'r'));
 assert.ok(maintainedRoot,'maintained reference must recognize the same root');
 assert.equal(maintainedRoot[':@']['@_id'],'7');
 assert.deepEqual(maintainedRoot.r.map(node=>Object.keys(node).find(key=>key!==':@')),
  ['#text','item','#text','item','#text']);
 assert.notDeepEqual(ours,legacy,'xml2js default schema is not the ordered carrier');
 assert.notDeepEqual(ours,maintained,'fast-xml-parser ordered schema also differs');

 // Neither competitor's default object carrier substitutes for the source
 // author's CDATA/comment/processing-instruction node identity.
 const decorated='<r>A<!--note--><![CDATA[<raw>]]><?pi data?>B</r>';
 const decoratedOwn=xmlToJsonTree({xml:decorated}).document.children[0];
 assert.deepEqual(decoratedOwn.children.map(node=>node.kind),
  ['text','comment','cdata','pi','text']);
 const decoratedLegacy=await xml2js.parseStringPromise(decorated);
 assert.equal(JSON.stringify(decoratedLegacy).includes('note'),false,
  'default xml2js omits comment identity');
 assert.equal(JSON.stringify(decoratedLegacy).includes('pi data'),false,
  'default xml2js omits processing-instruction identity');

 // A genuine maintained alternative preserves lexical prefixes when asked,
 // but its representation and parser policy are not ours.
 const namespaced='<r xmlns:p="urn:p"><p:item a="v"/></r>';
 const ownNs=xmlToJsonTree({xml:namespaced}).document.children[0];
 const parsedNs=new XMLParser({preserveOrder:true,ignoreAttributes:false,
  removeNSPrefix:false}).parse(namespaced);
 assert.equal(ownNs.children[0].name,'p:item');
 assert.ok(parsedNs[0].r.some(node=>Object.hasOwn(node,'p:item')));
 assert.equal(XMLValidator.validate(namespaced),true);

 // Safety is an independently stated contract, not inferred from a reference
 // package accepting markup or recovering from it. No external entity is read.
 for(const hostile of [
  '<!DOCTYPE r [<!ENTITY e SYSTEM "file:///etc/passwd">]><r>&e;</r>',
  '<!DOCTYPE r [<!ENTITY e "abc">]><r>&e;</r>',
  '<r><x></r>', '<p:r/>','<r>&missing;</r>',
 ])assert.throws(()=>xmlToJsonTree({xml:hostile}),TypeError);
 assert.throws(()=>xmlToJsonTree({xml:'<r>'+('x'.repeat(65536))+'</r>'}),RangeError);
});

test('DOCTYPE recognition requires XML whitespace, preserving malformed checker results',()=>{
 const malformed=['<!DOCTYPEfoo>','<!DOCTYPEfoo><r/>','<!DOCTYPE><r/>','<!DOCTYPE',
  '<!DOCTYPE\u00a0r><r/>','<!DOCTYPE\vr><r/>','<!DOCTYPE\fr><r/>'];
 for(const xml of malformed) {
  assert.throws(()=>readXmlDocument(xml),XmlError,xml);
  assert.equal(checkXmlWellFormedness({xml}).wellFormed,false,xml);
  for(const convert of [xmlToJsonTree,normalizeXml]) {
   assert.throws(()=>convert({xml}),error=>
    error instanceof TypeError && error.cause instanceof XmlError,xml);
  }
 }
 for(const space of [' ','\t','\r','\n']) {
  const xml='<!DOCTYPE'+space+'r [<!ENTITY e "x">]><r>&e;</r>';
  assert.throws(()=>readXmlDocument(xml),UnsupportedXmlFeatureError,xml);
  for(const operation of [xmlToJsonTree,normalizeXml,checkXmlWellFormedness])
   assert.throws(()=>operation({xml}),UnsupportedXmlFeatureError,xml);
 }
 const literal='<r><!--<!DOCTYPEfoo>--><![CDATA[<!DOCTYPE r>]]><?p <!DOCTYPEfoo>?></r>';
 assert.equal(checkXmlWellFormedness({xml:literal}).wellFormed,true);
});
