/**
 * svg/layout - geometry-agnostic placement of valuation segments, each carrying its told evidence.
 */
import { sidesOf } from "@red-cup-engineering/signcell/cell";
import { readingOfSides } from "@red-cup-engineering/computer-data-engineering-services-section/four";

/** The orbit class of a segment cell: self-pair or cross-pair. */

/** One visual segment, with its told evidence, in an ordinal band. */

/** One ordinal band in the visual valuation lattice. */

/** The geometry-agnostic ordinal segment set. */

/** Where ordinal 0 sits in radial geometry. */

const TAU = Math.PI * 2;
const START = -Math.PI / 2;

const fixed = (value) => value.toFixed(2);
const pointX = (cx, r, a) => cx + r * Math.cos(a);
const pointY = (cy, r, a) => cy + r * Math.sin(a);
const segmentKey = (segment) => `${segment.e} ${segment.a ?? ""} ${segment.v ?? ""}`;

/** A segment's point: its told evidence, or the name of a reading. */
export const segmentPoint = (segment) => segment.evidence ?? segment.reading;

/** The reading of a segment's evidence preserved by every geometry: its knowledge name and told sides. */
export function readingSemantics(point) {
  const [positive, negative] = sidesOf(point);
  return Object.freeze({ value: readingOfSides("knowledge", positive, negative), positive, negative });
}

function normalizeGeometry(geometry) {
  if (geometry === "radial") return Object.freeze({ kind: "radial" });
  if (geometry === "annular") return Object.freeze({ kind: "annular" });
  if (geometry === "document-flow") return Object.freeze({ kind: "document-flow" });
  return geometry;
}

function annularSector(cx, cy, ri, ro, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const ox0 = fixed(pointX(cx, ro, a0)), oy0 = fixed(pointY(cy, ro, a0));
  const ox1 = fixed(pointX(cx, ro, a1)), oy1 = fixed(pointY(cy, ro, a1));
  const ix1 = fixed(pointX(cx, ri, a1)), iy1 = fixed(pointY(cy, ri, a1));
  const ix0 = fixed(pointX(cx, ri, a0)), iy0 = fixed(pointY(cy, ri, a0));
  return `M${ox0},${oy0} A${fixed(ro)},${fixed(ro)} 0 ${large} 1 ${ox1},${oy1} L${ix1},${iy1} A${fixed(ri)},${fixed(ri)} 0 ${large} 0 ${ix0},${iy0} Z`;
}

function annulus(cx, cy, ri, ro) {
  const ox = fixed(cx + ro), oxb = fixed(cx - ro);
  const ix = fixed(cx + ri), ixb = fixed(cx - ri);
  const yc = fixed(cy);
  return (
    `M${ox},${yc} A${fixed(ro)},${fixed(ro)} 0 1 1 ${oxb},${yc} A${fixed(ro)},${fixed(ro)} 0 1 1 ${ox},${yc} Z ` +
    `M${ix},${yc} A${fixed(ri)},${fixed(ri)} 0 1 0 ${ixb},${yc} A${fixed(ri)},${fixed(ri)} 0 1 0 ${ix},${yc} Z`
  );
}

function radialLayout(dataform, geometry) {
  const center = geometry.center ?? "apex";
  const size = dataform.size ?? 480;
  const margin = geometry.margin ?? 24;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - margin;
  const holeRadius = outerRadius * (geometry.holeRatio ?? 0.14);

  const byOrdinal = [...dataform.rings].sort((left, right) => left.ordinal - right.ordinal);
  const ordered = center === "apex" ? [...byOrdinal].reverse() : byOrdinal;
  const count = ordered.length || 1;
  const thickness = (outerRadius - holeRadius) / count;
  const gap = Math.min(1.5, thickness * 0.12);

  const rings = ordered.map((ring, ringIndex) => {
    const innerRadius = holeRadius + ringIndex * thickness + gap;
    const outerRingRadius = holeRadius + (ringIndex + 1) * thickness - gap;
    const segments = [...ring.segments].sort((left, right) => segmentKey(left).localeCompare(segmentKey(right)));
    const totalWeight = segments.reduce((sum, segment) => sum + (segment.weight ?? 1), 0) || 1;
    const full = segments.length === 1;
    let accumulated = 0;
    const laid = segments.map((segment, segmentIndex) => {
      const weight = segment.weight ?? 1;
      const startAngle = START + (TAU * accumulated) / totalWeight;
      accumulated += weight;
      const endAngle = START + (TAU * accumulated) / totalWeight;
      const orbit = segment.orbit ?? "off-diagonal";
      const seatedInnerRadius = orbit === "off-diagonal"
        ? innerRadius + (outerRingRadius - innerRadius) * 0.42
        : innerRadius;
      const anglePad = full ? 0 : (endAngle - startAngle) * 0.04;
      const path = full
        ? annulus(cx, cy, seatedInnerRadius, outerRingRadius)
        : annularSector(cx, cy, seatedInnerRadius, outerRingRadius, startAngle + anglePad, endAngle - anglePad);
      return Object.freeze({
        key: segmentKey(segment),
        ordinal: ring.ordinal,
        order: segmentIndex,
        orbit,
        reading: readingSemantics(segmentPoint(segment)),
        segment: segment,
        shape: Object.freeze({
          innerRadius,
          outerRadius: outerRingRadius,
          seatedInnerRadius,
          startAngle,
          endAngle,
          full,
          path,
        }),
      });
    });
    const projected = {
      ordinal: ring.ordinal,
      order: ringIndex,
      ...(ring.label === undefined ? {} : { label: ring.label }),
      innerRadius,
      outerRadius: outerRingRadius,
      segments: Object.freeze(laid),
    };
    return Object.freeze(projected);
  });

  return Object.freeze({
    kind: "radial",
    width: size,
    height: size,
    cx,
    cy,
    holeRadius,
    center,
    rings: Object.freeze(rings),
  });
}

const emphasisOf = (value) => {
  switch (value) {
    case "unknown": return "quiet";
    case "held": return "supporting";
    case "denied": return "opposing";
    case "contested": return "settled";
  }
};

function segmentLabel(segment) {
  return segment.title ?? segment.label ?? [segment.e, segment.a, segment.v].filter((part) => part !== undefined).join(" ");
}

function documentFlowLayout(dataform, geometry) {
  const width = geometry.width ?? Math.max(720, dataform.size ?? 0);
  const margin = geometry.margin ?? 24;
  const ordinalGap = geometry.ordinalGap ?? 14;
  const segmentGap = geometry.segmentGap ?? 8;
  const ordinalHeaderHeight = geometry.ordinalHeaderHeight ?? 30;
  const segmentHeight = geometry.segmentHeight ?? 42;
  const indent = geometry.indent ?? 28;
  const byOrdinal = [...dataform.rings].sort((left, right) => left.ordinal - right.ordinal);
  const placements = [];
  let y = margin;
  let order = 0;

  byOrdinal.forEach((ring, depth) => {
    const x = margin + depth * indent;
    const w = Math.max(160, width - margin - x);
    placements.push(Object.freeze({
      kind: "ordinal",
      key: `ordinal:${ring.ordinal}`,
      ordinal: ring.ordinal,
      depth,
      order: order++,
      box: Object.freeze({ x, y, w, h: ordinalHeaderHeight }),
      label: ring.label ?? `ordinal ${ring.ordinal}`,
    }));
    y += ordinalHeaderHeight + segmentGap;

    const segments = [...ring.segments].sort((left, right) => segmentKey(left).localeCompare(segmentKey(right)));
    for (const segment of segments) {
      const reading = readingSemantics(segmentPoint(segment));
      const orbit = segment.orbit ?? "off-diagonal";
      const segmentX = x + indent;
      const segmentWidth = Math.max(140, width - margin - segmentX);
      placements.push(Object.freeze({
        kind: "segment",
        key: `${ring.ordinal}:${segmentKey(segment)}`,
        ordinal: ring.ordinal,
        depth,
        order: order++,
        box: Object.freeze({ x: segmentX, y, w: segmentWidth, h: segmentHeight }),
        label: segmentLabel(segment),
        orbit,
        reading,
        emphasis: emphasisOf(readingOfSides("extremal", reading.positive, reading.negative)),
        segment: segment,
      }));
      y += segmentHeight + segmentGap;
    }

    y += ordinalGap;
  });

  return Object.freeze({
    kind: "document-flow",
    width,
    height: y + margin - ordinalGap,
    placements: Object.freeze(placements),
  });
}

const assertFinitePositive = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
};

function annularLayout(dataform, geometry) {
  const byOrdinal = [...dataform.rings].sort((left, right) => left.ordinal - right.ordinal);
  const ordered = (geometry.ordinalAnchor ?? "inner") === "inner" ? byOrdinal : [...byOrdinal].reverse();
  const count = ordered.length || 1;
  const innerRadius = assertFinitePositive("annular innerRadius", geometry.innerRadius ?? 1);
  const outerRadius = assertFinitePositive("annular outerRadius", geometry.outerRadius ?? innerRadius + count);
  if (outerRadius <= innerRadius) throw new TypeError("annular outerRadius must be greater than innerRadius");
  const angularSpan = assertFinitePositive("annular angularSpan", geometry.angularSpan ?? TAU);
  const angularStart = geometry.angularStart ?? START;
  const radialGap = geometry.radialGap ?? 0;
  const angularGapRatio = geometry.angularGapRatio ?? 0.04;
  const orbitInsetRatio = geometry.orbitInsetRatio ?? 0.42;
  const thickness = (outerRadius - innerRadius) / count;

  const bands = ordered.map((ring, bandIndex) => {
    const radialStart = innerRadius + bandIndex * thickness + radialGap;
    const radialEnd = innerRadius + (bandIndex + 1) * thickness - radialGap;
    if (radialEnd <= radialStart) throw new TypeError("annular radialGap leaves no positive radial band");
    const segments = [...ring.segments].sort((left, right) => segmentKey(left).localeCompare(segmentKey(right)));
    const totalWeight = segments.reduce((sum, segment) => sum + (segment.weight ?? 1), 0) || 1;
    const full = segments.length === 1;
    let accumulated = 0;
    const laid = segments.map((segment, segmentIndex) => {
      const weight = segment.weight ?? 1;
      const rawThetaStart = angularStart + (angularSpan * accumulated) / totalWeight;
      accumulated += weight;
      const rawThetaEnd = angularStart + (angularSpan * accumulated) / totalWeight;
      const thetaPad = full ? 0 : (rawThetaEnd - rawThetaStart) * angularGapRatio;
      const thetaStart = rawThetaStart + thetaPad;
      const thetaEnd = rawThetaEnd - thetaPad;
      const orbit = segment.orbit ?? "off-diagonal";
      const seatedRadialStart = orbit === "off-diagonal"
        ? radialStart + (radialEnd - radialStart) * orbitInsetRatio
        : radialStart;
      const area = ((radialEnd ** 2 - seatedRadialStart ** 2) * (thetaEnd - thetaStart)) / 2;
      return Object.freeze({
        key: segmentKey(segment),
        ordinal: ring.ordinal,
        order: segmentIndex,
        orbit,
        reading: readingSemantics(segmentPoint(segment)),
        segment: segment,
        shape: Object.freeze({
          radialStart,
          radialEnd,
          seatedRadialStart,
          thetaStart,
          thetaEnd,
          full,
          area,
        }),
      });
    });
    const projected = {
      ordinal: ring.ordinal,
      order: bandIndex,
      ...(ring.label === undefined ? {} : { label: ring.label }),
      radialStart,
      radialEnd,
      segments: Object.freeze(laid),
    };
    return Object.freeze(projected);
  });

  return Object.freeze({
    kind: "annular",
    innerRadius,
    outerRadius,
    angularStart,
    angularSpan,
    ordinalAnchor: geometry.ordinalAnchor ?? "inner",
    bands: Object.freeze(bands),
  });
}

/** Project ordinal segments into positioned placements for one geometry. */

export function layout(dataform, geometry) {
  const normalized = normalizeGeometry(geometry);
  switch (normalized.kind) {
    case "radial": return radialLayout(dataform, normalized);
    case "annular": return annularLayout(dataform, normalized);
    case "document-flow": return documentFlowLayout(dataform, normalized);
  }
}
