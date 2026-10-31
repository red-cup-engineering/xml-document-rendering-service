/**
 * Deterministic SVG projections of finite Metrologic hyperbolic square patches.
 * Geometry, camera transforms and picking belong to Metrologic. This module
 * owns only the SVG coordinate/arc representation and its XML serialization.
 */
import {
  diskPoint, projectDisk, geodesicEdge, HYPERBOLIC_LIMITS,
} from '@red-cup-engineering/metrologic/articulation/predicating/geometry/spatial/hyperbolic';
import { element, document } from '../core.mjs';

const TAU = 2 * Math.PI;
const ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const DEFAULT_PALETTE = Object.freeze(['#153a4a', '#206075', '#288198', '#46a9b5', '#94d5d2']);
const finite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
};
const record = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
};
const identifier = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a bounded SVG identifier`);
  return value;
};
const freezePoint = (x, y) => Object.freeze({x, y});
const positiveAngle = value => ((value % TAU) + TAU) % TAU;
const formatter = precision => value => {
  finite(value, 'SVG coordinate');
  const rounded = Number(value.toFixed(precision));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

function arcExtrema(start, end, center, radius, sweep) {
  const from = Math.atan2(start.y - center.y, start.x - center.x);
  const to = Math.atan2(end.y - center.y, end.x - center.x);
  const amount = positiveAngle(sweep ? to - from : from - to);
  const values = [start, end];
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const offset = positiveAngle(sweep ? angle - from : from - angle);
    if (offset <= amount + 1e-12) values.push({x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle)});
  }
  return values;
}

/**
 * Snapshot a square scene in SVG x-right/y-down coordinates. The tile order is
 * the upstream finite traversal order. Every circle arc includes its extrema
 * in bounds; clients can normalize exactly the same path into a clipPath.
 */
export function projectHyperbolicScene(tiling, options = {}) {
  record(options, 'Scene options');
  if (!tiling || tiling.kind !== 'hyperbolic.square-tiling' || !Array.isArray(tiling.tiles) ||
      tiling.tiles.length < 1 || tiling.tiles.length > HYPERBOLIC_LIMITS.maximumTiles)
    throw new TypeError('Projection requires a bounded Metrologic hyperbolic square tiling');
  const size = finite(options.size ?? 1000, 'Scene size');
  const padding = finite(options.padding ?? 24, 'Scene padding');
  const precision = options.precision ?? 6;
  if (!(size >= 1 && size <= 16384)) throw new RangeError('Scene size must be in 1..16384');
  if (!(padding >= 0 && padding < size / 2)) throw new RangeError('Scene padding must be nonnegative and less than half its size');
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 12) throw new RangeError('Scene precision must be an integer in 0..12');
  const inputCamera = record(options.camera ?? {}, 'Scene camera');
  const camera = Object.freeze({center: diskPoint(inputCamera.center ?? {x: 0, y: 0}),
    rotation: finite(inputCamera.rotation ?? 0, 'Scene camera rotation')});
  const center = freezePoint(size / 2, size / 2), radius = size / 2 - padding;
  const screen = point => freezePoint(center.x + point.x * radius, center.y - point.y * radius);
  const number = formatter(precision), seen = new Set();
  const tiles = tiling.tiles.map(tile => {
    const id = identifier(tile.id, 'Tile id');
    if (seen.has(id)) throw new TypeError('Hyperbolic tile ids must be unique');
    seen.add(id);
    if (!Array.isArray(tile.vertices) || tile.vertices.length !== 4) throw new TypeError('Each hyperbolic square requires four vertices');
    const projected = tile.vertices.map(point => projectDisk(point, camera));
    const vertices = Object.freeze(projected.map(screen));
    const extrema = [...vertices];
    const commands = [`M ${number(vertices[0].x)} ${number(vertices[0].y)}`];
    for (let index = 0; index < 4; index += 1) {
      const next = (index + 1) % 4;
      const edge = geodesicEdge(projected[index], projected[next]);
      const end = vertices[next];
      if (edge.kind === 'line') commands.push(`L ${number(end.x)} ${number(end.y)}`);
      else {
        const arcRadius = edge.radius * radius, arcCenter = screen(edge.center), sweep = 1 - edge.sweep;
        commands.push(`A ${number(arcRadius)} ${number(arcRadius)} 0 0 ${sweep} ${number(end.x)} ${number(end.y)}`);
        extrema.push(...arcExtrema(vertices[index], end, arcCenter, arcRadius, sweep));
      }
    }
    commands.push('Z');
    // Canonicalize endpoints before subtraction or division. Rounding only
    // the final matrix still admits different results when adjacent raw
    // doubles straddle a decimal midpoint. Both DOM placement and SVG clips
    // consume these same canonical arithmetic inputs.
    const minX = Number(number(Math.min(...extrema.map(p => p.x))));
    const minY = Number(number(Math.min(...extrema.map(p => p.y))));
    const maxX = Number(number(Math.max(...extrema.map(p => p.x))));
    const maxY = Number(number(Math.max(...extrema.map(p => p.y))));
    if (!(maxX > minX && maxY > minY)) throw new RangeError('Projected tile collapses at scene precision');
    // Nearest rounding followed by an outward half-quantum guard preserves
    // containment. Each endpoint moves outward by at most one scene quantum.
    const guard = .5 * 10 ** -precision, endpoint = formatter(precision + 1);
    const x = Number(endpoint(minX - guard)), y = Number(endpoint(minY - guard));
    const width = Number(endpoint(maxX + guard)) - x, height = Number(endpoint(maxY + guard)) - y;
    return Object.freeze({id, depth: tile.depth, path: commands.join(' '),
      center: screen(projectDisk(tile.center, camera)), vertices,
      bounds: Object.freeze({x, y, width, height})});
  });
  return Object.freeze({kind: 'hyperbolic.svg-scene', size, padding, radius, center, precision, camera,
    tiles: Object.freeze(tiles), q: tiling.q, truncated: Boolean(tiling.truncated),
    limits: tiling.limits, reasons: tiling.reasons, boundaryEdges: tiling.boundaryEdges});
}

function paint(value) {
  if (typeof value !== 'string' || !/^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,32})$/i.test(value))
    throw new TypeError('SVG palette entries must be literal colors');
  return value;
}

/**
 * Render one deterministic SVG. Labels are plain text. Optional links name
 * local fragments only, so this image never introduces scripts or remote
 * resources. Prefixes belong to the containing document and must be unique
 * there. Normalized per-tile clip paths preserve the exact projected shape.
 */
export function renderHyperbolicSvg(scene, options = {}) {
  record(options, 'SVG options');
  if (!scene || scene.kind !== 'hyperbolic.svg-scene' || !Array.isArray(scene.tiles) ||
      scene.tiles.length < 1 || scene.tiles.length > HYPERBOLIC_LIMITS.maximumTiles)
    throw new TypeError('Rendering requires a projected bounded hyperbolic SVG scene');
  const prefix = identifier(options.prefix ?? 'hyperbolic', 'SVG prefix');
  const labels = record(options.labels ?? {}, 'SVG labels');
  const palette = options.palette ?? DEFAULT_PALETTE;
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 32) throw new TypeError('SVG palette requires 1..32 literal colors');
  palette.forEach(paint);
  const number = formatter(scene.precision), clips = [], drawings = [];
  let linked = false;
  for (const [index, tile] of scene.tiles.entries()) {
    const id = identifier(tile.id, 'Tile id'), bounds = tile.bounds;
    const clipId = `${prefix}-clip-${id}`;
    const w = finite(bounds.width, 'Tile width'), h = finite(bounds.height, 'Tile height');
    if (!(w > 0 && h > 0)) throw new RangeError('SVG clipping requires positive tile dimensions');
    // A normalized matrix coefficient error is amplified by both the SVG
    // coordinate (at most size) and the tile's displayed dimension. Retain
    // enough guard decimals that this adds <= half one scene-coordinate
    // quantum, while removing irrelevant transcendental last-bit noise.
    // Inputs have already been canonicalized by projectHyperbolicScene;
    // coefficient quantization alone cannot eliminate every raw-float tie.
    const matrixPrecision = Math.max(0, scene.precision + Math.ceil(Math.log10(Math.max(w, h) * (scene.size + 1))));
    const coefficient = formatter(matrixPrecision);
    const transform = `matrix(${coefficient(1 / w)} 0 0 ${coefficient(1 / h)} ${coefficient(-bounds.x / w)} ${coefficient(-bounds.y / h)})`;
    clips.push(element('clipPath', {id: clipId, clipPathUnits: 'objectBoundingBox'}, [
      element('path', {d: tile.path, transform}),
    ]));
    const entry = Object.hasOwn(labels, id) ? record(labels[id], 'Tile label') : {};
    const label = entry.label ?? id;
    if (typeof label !== 'string' || label.length > 4096) throw new TypeError('Tile labels must be bounded text');
    const children = [element('title', {}, [label]), element('path', {
      d: tile.path, fill: palette[index % palette.length], stroke: '#d4e9ed', 'stroke-width': 1.2,
      'vector-effect': 'non-scaling-stroke',
    })];
    if (entry.label !== undefined) {
      const labelClip = `${prefix}-label-${id}`;
      clips.push(element('clipPath', {id: labelClip, clipPathUnits: 'userSpaceOnUse'}, [element('path', {d: tile.path})]));
      children.push(element('text', {
        x: number(tile.center.x), y: number(tile.center.y), 'text-anchor': 'middle',
        'dominant-baseline': 'central', fill: '#ffffff', 'font-family': 'sans-serif',
        'font-size': number(Math.min(18, Math.max(4, Math.min(w, h) / 10))),
        'pointer-events': 'none', 'clip-path': `url(#${labelClip})`,
      }, [label]));
    }
    if (entry.href !== undefined) {
      if (typeof entry.href !== 'string' || !/^#[^\s\u0000-\u0020\u007f]+$/u.test(entry.href) || entry.href.length > 4096)
        throw new TypeError('Hyperbolic SVG links must be local fragment references');
      linked = true;
      drawings.push(element('a', {href: entry.href, 'data-hyperbolic-cell': id, 'aria-label': label}, children));
    } else drawings.push(element('g', {'data-hyperbolic-cell': id}, children));
  }
  const title = options.title ?? 'Hyperbolic square tiling';
  const description = options.description ?? `${scene.tiles.length} cells in a finite regular {4,${scene.q}} Poincare disk patch.`;
  if (typeof title !== 'string' || typeof description !== 'string') throw new TypeError('SVG title and description must be text');
  const root = element('svg', {xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${number(scene.size)} ${number(scene.size)}`, width: number(scene.size), height: number(scene.size),
    role: linked ? 'group' : 'img', 'aria-labelledby': `${prefix}-title ${prefix}-description`, 'data-hyperbolic-scene': 'true'}, [
    element('title', {id: `${prefix}-title`}, [title]),
    element('desc', {id: `${prefix}-description`}, [description]),
    element('defs', {}, clips),
    element('circle', {cx: number(scene.center.x), cy: number(scene.center.y), r: number(scene.radius), fill: '#081f2c', stroke: '#819fa8', 'stroke-width': 1}),
    element('g', {}, drawings),
  ]);
  return document(root).trimEnd();
}
