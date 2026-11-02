import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXml } from '@rgrove/parse-xml';
import { regularSquareTiling, chartPoint } from '@red-cup-engineering/metrologic/articulation/predicating/geometry/spatial/hyperbolic';
import { projectHyperbolicScene, renderHyperbolicSvg } from '../src/xml/svg/hyperbolic.mjs';

test('hyperbolic SVG and scene repeat exactly with explicit input and precision', () => {
  const tiling = regularSquareTiling({maxDepth: 2, maxTiles: 80});
  const options = {camera: {center: {x: .3, y: -.2}, rotation: .41}, size: 1000, padding: 24, precision: 6};
  const first = projectHyperbolicScene(tiling, options);
  const second = projectHyperbolicScene(tiling, options);
  assert.deepEqual(first, second);
  assert.equal(first.tiles.length, tiling.tiles.length);
  assert.equal(first.size, 1000);
  assert.equal(first.radius, 476);
  assert.deepEqual(first.center, {x: 500, y: 500});
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.tiles) && Object.isFrozen(first.tiles[0].bounds));
  assert.match(first.tiles[0].path, /^M .* A .* Z$/);
  assert.equal(renderHyperbolicSvg(first), renderHyperbolicSvg(second));
  assert.doesNotMatch(renderHyperbolicSvg(first), /NaN|Infinity/);
  parseXml(renderHyperbolicSvg(first));
});

test('SVG bounds contain independently sampled chart edges after pan and rotation', () => {
  const tiling = regularSquareTiling({maxDepth: 3, maxTiles: 100});
  for (const camera of [
    {center: {x: 0, y: 0}, rotation: 0},
    {center: {x: .3, y: .2}, rotation: .4},
    {center: {x: -.65, y: .12}, rotation: 2.3},
  ]) {
    const scene = projectHyperbolicScene(tiling, {camera});
    for (const [index, cell] of scene.tiles.entries()) {
      const bounds = cell.bounds;
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        for (const [u, v] of [[t, 0], [1, t], [t, 1], [0, t]]) {
          const point = chartPoint(tiling.tiles[index].vertices, u, v, camera);
          const x = scene.center.x + point.x * scene.radius, y = scene.center.y - point.y * scene.radius;
          assert.ok(x >= bounds.x - 1e-7 && x <= bounds.x + bounds.width + 1e-7, `${cell.id} x`);
          assert.ok(y >= bounds.y - 1e-7 && y <= bounds.y + bounds.height + 1e-7, `${cell.id} y`);
        }
      }
    }
  }
});

test('clip paths preserve displayed shapes and labels are XML text', () => {
  const scene = projectHyperbolicScene(regularSquareTiling({maxDepth: 1}));
  const id = scene.tiles[0].id;
  const svg = renderHyperbolicSvg(scene, {prefix: 'workspace',
    title: 'A < B & C', description: 'Camera "near" center',
    labels: {[id]: {label: '<script>alert(1)</script> & "label"', href: '#original-tile'}}});
  assert.match(svg, /clipPathUnits="objectBoundingBox"/);
  assert.ok(svg.includes(`id="workspace-clip-${id}"`));
  assert.ok(svg.includes(`<a href="#original-tile" data-hyperbolic-cell="${id}"`));
  assert.ok(svg.includes(`clip-path="url(#workspace-label-${id})"`));
  assert.match(svg, /role="group"/);
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp;/);
  assert.doesNotMatch(svg, /<script|onload=|<foreignObject/);
  for (const cell of scene.tiles) {
    const b = cell.bounds;
    const clip = svg.match(new RegExp(`<clipPath id="workspace-clip-${cell.id}"[^>]*><path[^>]*transform="matrix\\(([^)]+)\\)"`));
    assert.ok(clip, cell.id);
    const [a, , , d, e, f] = clip[1].split(' ').map(Number);
    for (const point of cell.vertices) {
      const dx = Math.abs(a * point.x + e - (point.x - b.x) / b.width) * b.width;
      const dy = Math.abs(d * point.y + f - (point.y - b.y) / b.height) * b.height;
      assert.ok(dx <= .5 * 10 ** -scene.precision + 1e-10, `${cell.id} normalized x error ${dx}`);
      assert.ok(dy <= .5 * 10 ** -scene.precision + 1e-10, `${cell.id} normalized y error ${dy}`);
    }
    assert.ok(svg.includes(`d="${cell.path}"`));
  }
  parseXml(svg);
});

test('scene bounds canonicalize geometry noise before clip matrix arithmetic', () => {
  const tiling = regularSquareTiling({maxDepth: 3, maxTiles: 128});
  const nearby = point => ({x: point.x * (1 + Number.EPSILON), y: point.y * (1 - Number.EPSILON)});
  const perturbed = {...tiling, tiles: tiling.tiles.map(tile => ({...tile,
    center: nearby(tile.center), vertices: tile.vertices.map(nearby),
  }))};
  // Independent real-file receiving found final-coefficient midpoint failures
  // at home and at cell8/+1 degree, in addition to the original cell4 case.
  for (const camera of [
    {center: {x: 0, y: 0}, rotation: 0},
    {center: tiling.tiles[4].center, rotation: .625},
    {center: tiling.tiles[8].center, rotation: Math.PI / 180},
  ]) {
    const scene = projectHyperbolicScene(tiling, {camera});
    const other = projectHyperbolicScene(perturbed, {camera});
    assert.deepEqual(scene.tiles.map(tile => tile.bounds), other.tiles.map(tile => tile.bounds));
    assert.equal(renderHyperbolicSvg(scene), renderHyperbolicSvg(other));
  }
});

test('label map insertion and inherited keys cannot change rendering order', () => {
  const scene = projectHyperbolicScene(regularSquareTiling({maxDepth: 1}));
  const [a, b] = scene.tiles;
  const first = {[a.id]: {label: 'A'}, [b.id]: {label: 'B'}};
  const second = {[b.id]: {label: 'B'}, [a.id]: {label: 'A'}};
  assert.equal(renderHyperbolicSvg(scene, {labels: first}), renderHyperbolicSvg(scene, {labels: second}));
  const inherited = Object.create({[a.id]: {label: 'Injected'}});
  assert.equal(renderHyperbolicSvg(scene, {labels: inherited}), renderHyperbolicSvg(scene));
});

test('projection refuses malformed geometry, sizes and finite resource violations', () => {
  const tiling = regularSquareTiling({maxDepth: 0});
  for (const options of [{size: NaN}, {size: 0}, {size: 20000}, {padding: -1}, {padding: 500},
    {precision: 1.5}, {precision: 13}, {camera: {center: {x: 1, y: 0}}}, {camera: {rotation: Infinity}}]) {
    assert.throws(() => projectHyperbolicScene(tiling, options));
  }
  assert.throws(() => projectHyperbolicScene({...tiling, tiles: []}));
  assert.throws(() => projectHyperbolicScene({...tiling, tiles: [tiling.tiles[0], tiling.tiles[0]]}), /unique/);
  assert.throws(() => projectHyperbolicScene({...tiling, tiles: [{...tiling.tiles[0], id: 'bad id'}]}), /identifier/);
  assert.throws(() => projectHyperbolicScene(regularSquareTiling({maxDepth: 1}),
    {size: 1, padding: 0, precision: 0}), /collapses at scene precision/);
});

test('SVG option boundaries prevent external loads and executable links', () => {
  const scene = projectHyperbolicScene(regularSquareTiling({maxDepth: 0})), id = scene.tiles[0].id;
  for (const href of ['javascript:alert(1)', 'data:text/html,hi', 'https://example.org/', '//example.org/', '#bad\nvalue']) {
    assert.throws(() => renderHyperbolicSvg(scene, {labels: {[id]: {label: 'bad', href}}}), /local fragment/);
  }
  for (const palette of [[], ['url(https://example.org/image)'], ['red;stroke:black'], new Array(33).fill('#fff')])
    assert.throws(() => renderHyperbolicSvg(scene, {palette}));
  assert.throws(() => renderHyperbolicSvg(scene, {prefix: 'bad prefix'}), /identifier/);
  assert.throws(() => renderHyperbolicSvg(scene, {labels: {[id]: {label: 'bad\u0000text'}}}), /XML 1.0/);
});
