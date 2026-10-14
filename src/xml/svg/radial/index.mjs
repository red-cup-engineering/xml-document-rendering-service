/**
 * svg/radial - a settlement's cells as concentric rings.
 *
 * A dataform holds a finite element-set that varies with the settling ordinal,
 * so it is drawn as rings, one per ordinal, each ring's segments its cells with
 * their told evidence. Placement is svg/layout's; each segment's paint is svg/visual-valuation's
 * (hue for the truth order, opacity and lightness for the knowledge order, a
 * hatch for contradiction). Names in titles, descriptions and data attributes
 * are the point's name in the `options.reading` family when the caller says which
 * order the diagram shows, and its knowledge name otherwise.
 */
import { restrict } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { evidenceOf } from "@red-cup-engineering/signcell/cell";
import { coincides } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { document, element, serialize } from "../../index.mjs";
import { affirmedEvidence, background, group, readingAttributes, readingOf, svgProjector, svgRoot } from "../index.mjs";
import { layout, segmentPoint } from "../layout.mjs";
import { readingColorPalette, readingToColor, readingToSvgPattern, readingToVisual } from "../visual-valuation.mjs";

/** One fill per point, plus the center disc and the segment outline stroke. */
export const radialPalette = Object.freeze({ ...readingColorPalette, center: "#1f2937", stroke: "#cbd2da" });

const fixed = (value) => value.toFixed(2);

function describe(dataform, reading) {
  const readings = new Map();
  let segments = 0, diagonal = 0;
  for (const ring of dataform.rings) {
    for (const segment of ring.segments) {
      segments += 1;
      if ((segment.orbit ?? "off-diagonal") === "diagonal") diagonal += 1;
      const name = readingOf(segmentPoint(segment), reading);
      readings.set(name, (readings.get(name) ?? 0) + 1);
    }
  }
  const byReading = [...readings].sort(([left], [right]) => left.localeCompare(right)).map(([name, count]) => `${name} ${count}`).join(", ");
  return `${dataform.rings.length} rings, ${segments} segments (${diagonal} diagonal). By reading${reading === undefined ? "" : ` (${reading})`}: ${byReading}.`;
}

function renderSegment(placed, palette, reading) {
  const segment = placed.segment;
  const point = segmentPoint(segment);
  const visual = readingToVisual(point, undefined, reading);
  const pattern = readingToSvgPattern(point);
  const attrs = {
    d: placed.shape.path,
    fill: pattern === undefined ? readingToColor(point, palette) : `url(#${pattern.id})`,
    "fill-opacity": visual.opacity,
    stroke: palette.stroke,
    "stroke-width": 1,
    ...(placed.shape.full ? { "fill-rule": "evenodd" } : {}),
    "data-e": segment.e,
    "data-orbit": placed.orbit,
    "data-visual-hue": visual.hue,
    "data-visual-lightness": visual.lightness,
    "data-visual-opacity": visual.opacity,
    "data-visual-saturation": visual.saturation,
    "data-visual-pattern": visual.pattern,
    ...readingAttributes(point, reading),
  };
  if (segment.a !== undefined) attrs["data-a"] = segment.a;
  if (segment.v !== undefined) attrs["data-v"] = segment.v;
  const label = segment.title ?? (segment.label ?? segment.e).replace(/\n/g, " ");
  return group({}, [element("title", {}, [label]), element("path", attrs)]);
}

function renderRing(ring, palette, reading) {
  return group({ "data-ordinal": ring.ordinal, ...(ring.label === undefined ? {} : { "data-ring": ring.label }) },
    ring.segments.map((segment) => renderSegment(segment, palette, reading)));
}

/** The hatch the knowledge top is filled with, over the stable fill. */
function contradictionPattern(palette) {
  const pattern = readingToSvgPattern("stable");
  return element("defs", {}, [
    element("pattern", { id: pattern.id, patternUnits: "userSpaceOnUse", width: pattern.width, height: pattern.height }, [
      element("rect", { width: pattern.width, height: pattern.height, fill: readingToColor("stable", palette) }),
      element("path", { d: pattern.path, stroke: pattern.stroke, "stroke-width": pattern.strokeWidth, opacity: pattern.strokeOpacity }),
    ]),
  ]);
}

/** Project a radial dataform into a deterministic, self-describing SVG. */
export function projectRadial(dataform, options = {}) {
  const palette = options.palette ?? radialPalette;
  const reading = options.reading;
  const size = dataform.size ?? 480;
  const radial = layout(dataform, { kind: "radial", center: options.center ?? "apex", margin: options.margin ?? 24, holeRatio: options.holeRatio ?? 0.14 });
  const centerDisc = element("circle", { cx: radial.cx, cy: radial.cy, r: fixed(radial.holeRadius), fill: palette.center, stroke: palette.stroke, "stroke-width": 1 });
  const root = svgRoot(
    { width: size, height: size, title: dataform.title ?? "radial diagram", desc: dataform.desc ?? describe(dataform, reading) },
    [
      contradictionPattern(palette),
      background(size, size, dataform.background ?? "#1c1c1e"),
      group({ "data-codec": "radial", ...(reading === undefined ? {} : { "data-reading": reading }) }, [centerDisc, ...radial.rings.map((ring) => renderRing(ring, palette, reading))]),
    ],
  );
  return document(root, { ...(options.declaration ? { declaration: true } : {}) }).trimEnd();
}

export { serialize };

/* ── adapters ───────────────────────────────────────────────────────────── */

const label = (term) => (typeof term === "string" ? term : JSON.stringify(term));

/** A cell as a segment, its told evidence carried: orbit from subject/object identity. */
export function segmentOfCell(at) {
  const subject = label(at.subject), object = label(at.object), predicate = label(at.predicate);
  const orbit = coincides(at.subject, at.object) ? "diagonal" : "off-diagonal";
  return Object.freeze({
    e: `${subject} ${predicate} ${object}`, a: predicate, v: object,
    label: orbit === "diagonal" ? `${subject} ${predicate}` : `${subject} ${predicate} ${object}`,
    orbit, evidence: evidenceOf(at),
  });
}

/** One ring per predicate of a valuation (a cell list), each ring that predicate's cells. */
export function radialFromValuation(valuation, dataform = {}) {
  const predicates = [];
  for (const at of valuation) if (!predicates.some((p) => coincides(p, at.predicate))) predicates.push(at.predicate);
  const rings = predicates.map((predicate, index) => Object.freeze({ ordinal: index, label: label(predicate), segments: Object.freeze(valuation.filter((at) => coincides(at.predicate, predicate)).map(segmentOfCell)) }));
  return Object.freeze({ ...dataform, rings: Object.freeze(rings) });
}

/** One ring per settlement stage, each ring that stage's cells (the knowledge order read as it settles). */
export function radialFromClosureStages(stages, dataform = {}) {
  const rings = stages.map((stage, index) => Object.freeze({ ordinal: index, segments: Object.freeze(stage.valuation.map(segmentOfCell)) }));
  return Object.freeze({ ...dataform, rings: Object.freeze(rings) });
}

export { affirmedEvidence };

/** Classify radial carriers through the native SVG and typed-resource owners. */
export const radialProjector = restrict(svgProjector, {
  type: "svg.radial",
  recognize: (resource) => /data-codec="radial"/.test(resource.content),
});
