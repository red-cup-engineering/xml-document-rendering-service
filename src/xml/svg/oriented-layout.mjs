import {
  createGraph, stronglyConnectedComponents, topologicalOrder,
} from "@red-cup-engineering/metrologic/models/graphs/directed-multigraph";

/** Project an oriented graph to stable drawing layers through Metrologic's
 * strongly connected components and topological ordering.
 * Nodes in a component share a layer. Other layers follow longest paths from the sources.
 */
export function layout(ids, edges, opts) {
  if (new Set(ids).size !== ids.length)
    throw new TypeError("diagram layout: object IDs must be distinct");
  const allowed = new Set(ids);
  for (const { from, to } of edges) if (!allowed.has(from) || !allowed.has(to))
    throw new TypeError("diagram layout: morphisms must connect declared objects");

  const directed = createGraph({
    nodes: ids.map((id) => ({ id })),
    edges: edges.map(({ from, to }) => ({ from, to })),
  });
  const components = stronglyConnectedComponents(directed);
  const where = new Map();
  components.forEach((group, at) => group.forEach((id) => where.set(id, String(at))));
  const quotient = createGraph({
    nodes: components.map((_, at) => ({ id: String(at) })),
    edges: directed.edges().flatMap(({ from, to }) =>
      where.get(from) === where.get(to) ? [] : [{ from: where.get(from), to: where.get(to) }]),
  });
  const ordered = topologicalOrder(quotient).order;
  if (ordered === undefined)
    throw new TypeError("diagram layout: component quotient must be acyclic");
  const depths = new Map(ordered.map((id) => [id, 0]));
  for (const id of ordered) for (const { to } of quotient.outgoing(id))
    depths.set(to, Math.max(depths.get(to), depths.get(id) + 1));
  const layers = new Map();
  for (const id of ids) {
    const layer = depths.get(where.get(id));
    const bucket = layers.get(layer) ?? [];
    bucket.push(id);
    layers.set(layer, bucket);
  }

  const boxes = new Map();
  const layerEntries = [...layers.entries()].sort((a, b) => a[0] - b[0]);
  let maxLayerWidth = 1;
  for (const [, layerIds] of layerEntries) {
    maxLayerWidth = Math.max(maxLayerWidth, layerIds.length);
  }
  for (const [layer, layerIds] of layerEntries) {
    for (let order = 0; order < layerIds.length; order += 1) {
      const id = layerIds[order];
      boxes.set(id, {
        cx: opts.margin + opts.nodeWidth / 2 + order * (opts.nodeWidth + opts.hGap),
        cy: opts.margin + opts.nodeHeight / 2 + layer * (opts.nodeHeight + opts.vGap),
        w: opts.nodeWidth,
        h: opts.nodeHeight,
      });
    }
  }
  return Object.freeze({
    width: opts.margin * 2 + maxLayerWidth * opts.nodeWidth + Math.max(0, maxLayerWidth - 1) * opts.hGap,
    height: opts.margin * 2 + layerEntries.length * opts.nodeHeight + Math.max(0, layerEntries.length - 1) * opts.vGap,
    boxes,
  });
}
