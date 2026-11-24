/**
 * svg/tile - SVG rendering of mathematical Tile witnesses, each cell's reading in the knowledge order.
 */
import { readingToColor, readingToSvgPattern } from "./visual-valuation.mjs";
import { background, defs, group, readingAttributes, svgRoot } from "./index.mjs";
import { document, element } from "../index.mjs";

const DEFAULT_CELLS_PER_ROW = 24;
const DEFAULT_CELL_SIZE = 22;
const DEFAULT_GAP = 3;
const HEADER_LINE_HEIGHT = 14;

function invariantLines(tile, settlement) {
  const contendedCells = tile.lambda.order.length - tile.h.isolatedCells;
  return Object.freeze([
    `Tile: ${settlement.sources.length} sources, ${tile.lambda.order.length} cells, ${settlement.claims} claims`,
    `kappa: ${tile.kappa.status}${tile.kappa.refined ? " (refined from gamma)" : " (= gamma)"}`,
    tile.lambda.label,
    `eta (coordination H1 rank, reused): ${tile.eta.rank} - ${tile.eta.vanishing ? "vanishing (coordination-free)" : "obstruction"}`,
    `h (colouring entropy, log2 P(G,4)): ${tile.h.bits.toFixed(2)} bits (${tile.h.isolatedCells} isolated + ${contendedCells} contended cells)`,
    `delta (diffraction): ${tile.delta.status} - ${tile.delta.reason}`,
  ]);
}

function contradictionPatternDefs() {
  const pattern = readingToSvgPattern("stable");
  if (pattern === undefined) return defs([]);
  return defs([
    element("pattern", { id: pattern.id, patternUnits: "userSpaceOnUse", width: pattern.width, height: pattern.height }, [
      element("rect", { width: pattern.width, height: pattern.height, fill: readingToColor("stable") }),
      element("path", { d: pattern.path, stroke: pattern.stroke, "stroke-width": pattern.strokeWidth, opacity: pattern.strokeOpacity }),
    ]),
  ]);
}

export function renderTileSvg(
  tile,
  settlement,
  options = {},
) {
  const cellsPerRow = options.cellsPerRow ?? DEFAULT_CELLS_PER_ROW;
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const margin = 16;
  const lines = invariantLines(tile, settlement);
  const headerHeight = HEADER_LINE_HEIGHT * lines.length + 10;
  const rows = Math.max(1, Math.ceil(tile.lambda.order.length / cellsPerRow));
  const width = margin * 2 + cellsPerRow * (cellSize + gap);
  const height = margin * 2 + headerHeight + rows * (cellSize + gap);

  const cellNodes = tile.lambda.order.map((cell, index) => {
    const reading = tile.kappa.charges[cell] ?? "absurd";
    const pattern = readingToSvgPattern(reading);
    const fill = pattern === undefined ? readingToColor(reading) : `url(#${pattern.id})`;
    const row = Math.floor(index / cellsPerRow);
    const col = index % cellsPerRow;
    const x = margin + col * (cellSize + gap);
    const y = margin + headerHeight + row * (cellSize + gap);
    const rect = element("rect", {
      x,
      y,
      width: cellSize,
      height: cellSize,
      fill,
      stroke: "#cbd2da",
      "stroke-width": 1,
      ...readingAttributes(reading, "knowledge"),
      "data-cell": cell,
    });
    return group({}, [element("title", {}, [cell]), rect]);
  });

  const headerText = element(
    "text",
    { x: margin, y: margin + 11, "font-size": 11, fill: "#e5e7eb" },
    lines.map((line, index) => element("tspan", { x: margin, dy: index === 0 ? 0 : HEADER_LINE_HEIGHT }, [line])),
  );

  const root = svgRoot(
    {
      width,
      height,
      title: options.title ?? "Tile",
      desc: `Tile: ${tile.lambda.order.length} cells, eta=${tile.eta.rank}, h=${tile.h.bits.toFixed(2)} bits, delta=${tile.delta.status}`,
    },
    [
      background(width, height, "#111827"),
      contradictionPatternDefs(),
      headerText,
      group({ "data-codec": "tile" }, cellNodes),
    ],
  );
  return document(root).trimEnd();
}
