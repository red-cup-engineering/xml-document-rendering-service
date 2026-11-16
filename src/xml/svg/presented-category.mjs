import { restrict } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { isPresentedCategoryDiagram } from "@red-cup-engineering/computer-graph-serialization-engineering-services-section/presented-category";
import { evidence } from "@red-cup-engineering/signcell/cell";
import { serialize, xmlProjector } from "../core.mjs";
import { projectSvg as renderSvg, shapeMorphismRegistry } from "./index.mjs";
import { layout } from "./oriented-layout.mjs";

export const diagramPalette = Object.freeze({
  package: { shape: "rect", fill: "#17324d", stroke: "#4f9ed8" },
  surface: { shape: "rounded", fill: "#153f33", stroke: "#43b488" },
  strategy: { shape: "stadium", fill: "#3f244f", stroke: "#b987d8" },
  protocol: { shape: "rounded", fill: "#4f3419", stroke: "#d09a4a" },
  target: { shape: "parallelogram", fill: "#3a3f1f", stroke: "#a8b650" },
  term: { shape: "rounded", fill: "#243f4f", stroke: "#70abc8", dash: "5 3" },
  session: { shape: "stadium", fill: "#4f2439", stroke: "#c87098" },
  predicate: { shape: "rounded", fill: "#34383f", stroke: "#8b949e" },
  state: { shape: "rounded", fill: "#153f33", stroke: "#43b488" },
  message: { shape: "stadium", fill: "#243f4f", stroke: "#70abc8" },
});

export function diagramToSvgDataform(diagram) {
  const geometry = layout(diagram.objects.map((object) => object.id), diagram.morphisms, {
    nodeWidth: 190,
    nodeHeight: 42,
    hGap: 34,
    vGap: 76,
    margin: 34,
  });
  const nodes = [];
  for (const object of diagram.objects) {
    const box = geometry.boxes.get(object.id);
    if (box === undefined) continue;
    nodes.push(Object.freeze({
      e: object.id,
      a: "diagram.object",
      v: object.kind,
      group: object.kind,
      label: object.label,
      title: object.detail ?? `${object.label} (${object.kind})`,
      ...(object.href === undefined ? {} : { href: object.href }),
      data: { id: object.id, kind: object.kind },
      evidence: evidence(),
      box,
    }));
  }
  const edges = [];
  for (const morphism of diagram.morphisms) {
    const fromBox = geometry.boxes.get(morphism.from);
    const toBox = geometry.boxes.get(morphism.to);
    if (fromBox === undefined || toBox === undefined) continue;
    edges.push(Object.freeze({
      from: morphism.from,
      to: morphism.to,
      kind: morphism.kind,
      evidence: evidence(),
      fromBox,
      toBox,
    }));
  }
  return Object.freeze({
    width: geometry.width,
    height: geometry.height,
    title: diagram.title ?? "diagram",
    desc: diagram.description ?? `${diagram.objects.length} objects, ${diagram.morphisms.length} morphisms.`,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    background: "#0d1117",
    textColor: "#f0f6fc",
    edgeColor: "#66707f",
  });
}

export function defaultShapeMorphisms() {
  return shapeMorphismRegistry({ shapes: diagramPalette });
}

export function projectSvg(dataform, options = {}) {
  return renderSvg(dataform, { ...options, registry: options.registry ?? defaultShapeMorphisms() });
}

export const svgProjector = restrict(xmlProjector, {
  type: "svg.xml",
  corner: "assertion",
  rung: "strict",
  recognize: (resource) => /<svg[\s>]/.test(resource.content),
  write: (items) => items.map((item) => {
    if (isPresentedCategoryDiagram(item)) return projectSvg(diagramToSvgDataform(item));
    return serialize(item);
  }).join(""),
});
