import { define } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { presentedCategoryDiagram } from "@red-cup-engineering/computer-graph-serialization-engineering-services-section/presented-category";
import { element, serialize } from "./core.mjs";
import { readXmlDocument } from "./document-read.mjs";

const XMI = "http://www.omg.org/XMI";
const DIAGRAM = "https://561.group/relating/diagram";

/** Write the XMI document for the 561 Group's presented-category diagram. */
export function writeXmi(diagram) {
  const objects = diagram.objects.map(({ id, kind, label, detail, href }) =>
    element("object", { id, kind, label, detail, href }));
  const morphisms = diagram.morphisms.map(({ id, from, to, kind, label }, index) =>
    element("morphism", { id: id ?? `morphism:${index}`, from, to, kind, label }));
  const attrs = {
    kind: diagram.kind,
    diagramKind: diagram.diagramKind ?? "class",
    title: diagram.title ?? "",
    description: diagram.description ?? "",
  };
  const children = [...objects, ...morphisms].flatMap((record) => ["  ", record, "\n"]);
  const root = element("xmi:XMI", { "xmlns:xmi": XMI, "xmlns:relating": DIAGRAM }, [
    "\n", element("relating:diagram", attrs, ["\n", ...children, ...(children.length ? [] : ["\n"])]), "\n",
  ]);
  return `${serialize(root).replaceAll("&#39;", "&apos;")}\n`;
}

/** Admit the diagram's direct XML elements with the native XML document reader. */
export function readXmi(source) {
  const root = readXmlDocument(source).children.find(({ kind }) => kind === "element");
  const diagram = root?.children.find(({ kind, name }) => kind === "element" && name === "relating:diagram");
  if (root?.name !== "xmi:XMI" || root.attributes["xmlns:xmi"] !== XMI
    || root.attributes["xmlns:relating"] !== DIAGRAM || diagram === undefined)
    throw new TypeError("xmi diagram: missing relating:diagram");
  const { title = "", description = "", diagramKind } = diagram.attributes;
  const records = (name) => diagram.children
    .filter((node) => node.kind === "element" && node.name === name)
    .map((node) => node.attributes);
  return presentedCategoryDiagram({
    title,
    description,
    diagramKind: diagramKind === "state-machine" || diagramKind === "sequence" ? diagramKind : "class",
    objects: records("object"),
    morphisms: records("morphism"),
  });
}

export const umlProjector = define({
  type: "uml.xmi",
  corner: "assertion",
  rung: "strict",
  recognize: (resource) => resource.path.endsWith(".xmi") || resource.content.includes("<relating:diagram"),
  read: (resource) => [readXmi(resource.content)],
  write: (items) => items.map(writeXmi).join("\n"),
});
