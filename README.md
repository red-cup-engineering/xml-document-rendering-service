# XML document rendering

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

The root and `./core` exports retain the existing element/text/comment node API. XML is an ordered document carrier; mixed text and child order must survive conversion. SVG report graphics and RFCXML use this writer. HTML reuses its lexical escaping helpers while retaining its own HTML carrier behavior. The XML writer validates XML 1.0 names and characters, writes iteratively, and retains text carriage returns and attribute tab/LF/CR with character references. CDATA, comments and processing instructions cannot retain literal CR under XML normalization and refuse it; use text nodes where applicable.

`./document-read` reads XML 1.0 with Namespaces 1.0 into existing `kind` nodes, preserving CDATA, comments, processing instructions, declarations, qualified names and namespace attributes. It verifies bindings, reserved prefixes and expanded attribute uniqueness without fetching or URI-normalizing namespace names. Native `@rgrove/parse-xml` 5.0.0 performs markup parsing; `xml-name-validator` 5.0.0 supplies XML name predicates. DTD processing, custom entities and XML 1.1 are excluded from these converters. The root writer's existing opaque doctype option remains distinct from DTD validation.

`./transformations` exposes `xmlToJsonTree({xml})`, `jsonTreeToXml({document})`, `normalizeXml({xml})` and `checkXmlWellFormedness({xml})`. The document contains ordered element, text, cdata, comment, pi and xmldecl nodes. Element nodes require name, string-valued attributes and children; leaf nodes require value; processing instructions also require name. Declarations require version 1.0; encoding metadata is retained on read and serialized declarations explicitly use UTF-8. Unknown fields and nested documents are refused.

Limits are 65536 XML UTF-8 bytes, 1048576 JSON node bytes, 8192 nodes/attributes and depth 64. A conservative lexical preflight rejects definitely excessive elements, preserved comment/CDATA/processing-instruction nodes, tag attributes or nesting before the native full-tree parser allocates; quoted tag text and literal markup inside comments/CDATA are not structural counts. The original parser remains the markup and namespace authority. The x402 seller separately limits the JSON request envelope to 1048576 bytes. XML normalization preserves parsed values, not lexical spelling, and is not Canonical XML/C14N. Neither checking nor conversion validates DTD/XSD schemas. Malformed markup/namespace bindings yield a paid false result from the checker; conversion refuses them before payment. Unsupported features and resource limits are refused before payment by all four offers.

The fixture corpus retains primary W3C XMLTest and Edinburgh namespace cases from a pinned supplier revision, source URLs, hashes, expectations and redistribution notice. Its 62 selected cases exclude unsupported DTD and physical byte encodings; passing this subset does not establish complete W3C conformance.

## Direct-reader admission and migration

The direct `readXmlDocument(xml, options)` API now admits at most 1048576
UTF-8 input bytes before parsing. `maximumInputBytes` may tighten but not raise
that ceiling. All budgets must be safe integers: nodes 1..65536 (default
8192), depth 0..1024 (default 64), and attributes 0..65536 (default 8192).
Callers previously relying on larger input or unbounded/custom out-of-range
budgets must bound their documents before migrating; the four transformation
APIs retain their existing stricter limits. This is a breaking direct-reader
admission change, not merely a patch-compatible correction.

Preflight recognizes a DTD keyword only when `<!DOCTYPE` is followed by XML
whitespace (space, tab, CR or LF), and refuses it before native parsing.
Prefixes such as `<!DOCTYPEfoo>` and non-XML whitespace are left to the
native parser: the checker returns `wellFormed: false`, while conversions
refuse malformed markup. Literal spellings in comments, CDATA and processing
instructions remain data. This guard does not validate a DTD grammar.

## Reference-parser interoperability and sellable-operation boundary

The original 561 Group Market's four XML operations are **bounded, ordered
document conversions/checks**, not a hosted `xml2js` implementation or a
drop-in NPM replacement. `test/xml-transformations.test.mjs` executes real
**xml2js 0.6.2** and **fast-xml-parser 5.11.1** in addition to the original
W3C-source fixtures and native XML tests. Both reference tools are exact-pinned
development-only comparisons; neither is a new runtime parser dependency.

On `<r id="7">x<item>01</item>y<item>2</item>z</r>`:

- `xml2js` defaults expose a root keyed `r`, `$` attributes and an `item`
  array; that is useful for existing JS callers but **not** our ordered
  `{kind:"document",children:[...]}` node graph. `xml2js` can be configured
  with `explicitChildren`/`preserveChildrenOrder`, but its option-dependent
  representation is still not our typed carrier.
- The maintained `fast-xml-parser` with `preserveOrder:true` returns its own
  ordered array format and `:@` attribute grouping. Parsing equivalent XML
  does not imply compatible object keys, element/text carriers or security policy.
- Our carrier explicitly retains repeated child identity, mixed text placement,
  qualified names and separately typed CDATA, comments and processing
  instructions; default `xml2js` output does not retain comment or PI identity.
  Conversion is semantic XML-value normalization, **not C14N** or byte-stable
  reserialization, and neither parser promises all W3C XML/DTD/XSD semantics.

The source-authored conversion contract refuses DTDs, custom/external entities,
XML 1.1, undeclared namespace prefixes, malformed Unicode, oversized/deep
inputs and unrepresentable node carriers. A reference library returning some
output must never override these original negative tests. A caller needing
`xml2js`-shaped objects or full `fast-xml-parser` semantics requires a
separately specified, tested adapter; the seller must not imply compatibility.

The source package CI runs native tests with real references and installs the
**exact packed archive** into an independent consumer using the original house
registry. Its original four public import operations must pass independently
of their source checkout. The workflow retains resolved dependency selection
and the qualified archive. This establishes only a source/packaged-consumer
test, not a source-reviewed release, a production x402/MCP installation,
merchant payment permission, customer acceptance or economic settlement.

Market product declaration, payee, seller rights, source identity and price
remain with the **existing** Causeway Public Market, original Opportunity
[#73](https://github.com/561-group/561-group-opportunity-services-section/issues/73)
and the original Market [#4](https://github.com/causeway-services/market.561.group/issues/4).
The deterministic XML converter does not implement a Sign proof engine or
transfinite computation. This repository's separate SVG report-graphic does
reuse the typed FOUR evidence provider, but its finite tests are not a
mathematical proof of the wider research program.
