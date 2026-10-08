import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {xmlToJsonTree,jsonTreeToXml,normalizeXml,checkXmlWellFormedness} from '../src/xml/transformations.mjs';
const wrap=(children)=>({kind:'document',children});
const root=(name='r',attributes={},children=[])=>({kind:'element',name,attributes,children});
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
