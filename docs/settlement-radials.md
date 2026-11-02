# Source-bearing settlement radials

`@red-cup-engineering/xml-document-rendering-service/svg/radial` projects an actual
Metrologic reading-settlement result through the existing radial layout and
visual-valuation owners. It does not implement another solver, evidence algebra,
content-address scheme or XML serializer.

```js
import { readingSettlement } from '@red-cup-engineering/metrologic/settlement';
import {
  settlementRadialProjection, projectSettlementRadial,
  readSettlementRadial, verifySettlementRadial,
} from '@red-cup-engineering/xml-document-rendering-service/svg/radial';

const result = readingSettlement.settle(
  () => ({ claim: 'active', derived: 'potential' }),
  { claim: 'potential', unknown: 'absurd' },
);
const projection = settlementRadialProjection(result);
const svg = projectSettlementRadial(result);
const received = readSettlementRadial(svg);

// Actual source facts, not estimates inferred from pixels:
result.state.claim === 'stable';      // both positive and negative value bits
result.iterations === 1;              // strict changes before quiescence
received.sourceId === projection.sourceId;
verifySettlementRadial(svg) === true; // source, text and paths reproduce exactly
```

## Source and projection are different things

The admitted source is `{ kind: 'metrologic.reading-settlement', result }`, with
optional `cells`, a map from existing result IDs to actual SignCells. The result
has exactly the original `{state, iterations}` shape. Its state is a finite
record of opaque cell IDs to the original knowledge-family readings. The
renderer does not fabricate triples from those IDs, run the caller's step,
invent intermediate stages or certify that a supplied result was computed by a
particular solver. Existing `radialFromClosureStages` still accepts explicitly
supplied SignCell stages; those are a separate input contract.

| Positive bit | Negative bit | Knowledge reading | Truth reading |
| --- | --- | --- | --- |
| absent | absent | `absurd` | `neither` |
| present | absent | `potential` | `true` |
| absent | present | `active` | `false` |
| present | present | `stable` | `both` |

These are the original Data/FOUR reading families. In particular, `stable` means
both bits are present. It does not mean that the solver has converged, that a
claim has been accepted, or that evidence has a particular confidence level.
Iteration count is a different fact supplied by the solver result.

The image gives cells equal angular allocations. The numbered key identifies
each cell and spells out its FOUR value; marks and a visible legend supplement
color. With at most 32 cells, sectors also carry their number and FOUR mark.
Above that density the complete key remains visible, but sector text is omitted
to avoid overlapping labels. No cells or source facts are omitted from metadata.
The existing diagonal/off-diagonal radial distinction is used only when an
actual SignCell supplies subject and object: equality is the original semantic
coincidence operation. Opaque IDs have `unclassified` orbit. Ring position,
area, opacity and palette values are presentation choices, not evidence strength
or confidence percentages.

## Actual SignCells retain their own evidence

```js
import { cell } from '@red-cup-engineering/signcell/cell';

const cells = {
  claim: cell('observer', 'reports', 'claim', {
    for: ['positive receipt'], against: ['negative receipt'], value: 'potential',
  }),
};
const svgWithEvidence = projectSettlementRadial(result, { cells });
```

The key distinguishes the final result's value from the source SignCell's value,
witness presence and positive/negative witness counts. A SignCell may have a
written value that differs from its witness presence. The adapter preserves
that distinction, including both witness sets, instead of replacing them with
synthetic witnesses that happen to match the settled value. Each actual cell's
triple address is retained separately from the source result's content address.

SignCell admission, witness deduplication and ordering remain SignCell's work.
Terms and witnesses may include supported byte strings and big integers within
the original CBOR owner's admitted integer range. They
are carried through the original semantic CBOR owner, not a lossy JSON
conversion. Non-text compound terms are labeled by their semantic identity;
their complete typed value remains recoverable.

## Source identity, carrier integrity and verification

`settlementRadialProjection` returns the immutable admitted `source`, `sourceId`,
source-derived `description`, FOUR `counts`, ordered `entries`, `dataform` and
admitted `view`. The source ID is the original `semanticId(source)`: an NI name
of canonical semantic CBOR. Changing size, title or identifier prefix changes
the image without changing the source ID. Canonical semantic identity includes
the original owner's NFC text normalization; it is not a claim to preserve
arbitrary JavaScript insertion order or original source-file bytes.

The SVG embeds `{kind: 'metrologic.settlement-radial/v1', source, view}` through
the original `svg/data-carrier` mechanism as `application/cbor`. That mechanism
binds media type, exact carried bytes, byte length and byte identity.
`readSettlementRadial` reads those bytes through the original semantic decoder
and readmits the profile. `verifySettlementRadial` additionally reconstructs the
SVG and requires exact byte equality, detecting text, path, style, source-ID and
metadata drift. This is content consistency. It is not a signature, proof of
origin, general SVG safety validator or proof of mathematical settlement.

Every visible source string passes through the original XML writer, which
escapes markup and refuses XML-forbidden characters. No source field is inserted
as executable markup, an external URL, a script or an event handler.

## Bounds and receiving checks

The finite view accepts a source within 1 MiB and integer plot size 320–1,600.
The number of complete visible cell keys is derived from the original passive
SVG owner's dimension and pixel budgets: at default size it fits 138 cells.
The generic image carrier also bounds the complete metadata payload, including
the view. Oversize inputs refuse instead of silently dropping cells or evidence.
A title has at most 4,096 characters. A caller may provide a
bounded XML `prefix` when several SVGs share a document. These are rendering
budgets, not mathematical limits of Metrologic.

Native tests receive a result produced by the actual `readingSettlement.settle`,
check all four values, compare source/value/presence separately, round-trip typed
witnesses, exercise reserved property names and canonical source permutations,
verify that inputs remain untouched, and reject changed source/geometry/text.
The existing valuation and explicitly supplied stage APIs remain covered. The
canonical layout comparator uses code-unit order rather than ambient locale.

## Original ownership

The source-maintenance record
`engineering-services-section/data/records/service-records/source-maintenance-service-records/legacy-revival/infography-codec-boundaries-receiving.json`
at `372301723c6c80faa330fc98071aa5b58dd118af` assigns the legacy
Infography/Infometrologia radial jobs to XML's original `svg/radial`, `svg/layout`
and `svg/visual-valuation` modules. The older Infometrologia standing-view
consumer rendered already-derived settlement JSON; it did not establish a new
settlement calculus. FeltOS's current agent `context-image` is a page/context
carrier, not a graphical radial renderer. This extension stays at the declared
XML boundary; living web and SHP consumers may present the admitted SVG without
pretending that an arbitrary Metrologic result is an SHP charged-cell packet.
