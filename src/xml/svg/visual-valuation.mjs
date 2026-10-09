/**
 * svg/visual-valuation - visual channels for the four points of told evidence.
 *
 * Each channel shows one order: hue and saturation carry the truth order
 * (against, underdetermined, for), lightness and opacity carry the knowledge
 * order (how much has been told), and the knowledge top keeps both sides
 * visible through a contradiction hatch. Colors are keyed by the point itself
 * (its knowledge name); a display may name the point in another reading.
 * A point is given as evidence ({ for, against }) or as a reading's name.
 */
import { sidesOf } from "@red-cup-engineering/signcell/cell";
import { knowledgeHeight, readingOfSides, truthHeight } from "@red-cup-engineering/computer-data-engineering-services-section/four";

const slot = (fill, text, border, outline, decorationStyle) => Object.freeze({ fill, text, border, outline, decorationStyle });

/** Living-Web / IndieWeb defaults shared by SVG, CSS, and other visual codecs. */
export const livingWebIndieWebVisualTheme = Object.freeze({
  kind: "visual-valuation.theme",
  name: "living-Web/IndieWeb",
  colors: Object.freeze({
    absurd: slot("#4b5563", "#4b5563", "#9ca3af", "#9ca3af", "dotted"),
    potential: slot("#2f7dd1", "#1d4ed8", "#2563eb", "#60a5fa", "solid"),
    active: slot("#d98a2b", "#9f1239", "#c0262d", "#f87171", "wavy"),
    stable: slot("#b3202c", "#166534", "#15803d", "#4ade80", "double"),
  }),
  hueByTruthRank: Object.freeze([32, 215, 209]),
  saturationByKnowledgeRank: Object.freeze([14, 64, 70]),
  lightnessByKnowledgeRank: Object.freeze([34, 50, 56]),
  opacityByKnowledgeRank: Object.freeze([0.38, 0.76, 0.96]),
  contradictionHue: 356,
  contradictionSaturation: 78,
  contradictionPattern: Object.freeze({
    id: "contradiction-hatch",
    width: 6,
    height: 6,
    background: "#b3202c",
    stroke: "#ffffff",
    strokeWidth: 1.2,
    strokeOpacity: 0.42,
    path: "M0 6 L6 0 M-1 1 L1 -1 M5 7 L7 5",
  }),
});

export const defaultVisualValuationTheme = livingWebIndieWebVisualTheme;

/** One fill color per point, keyed by its knowledge name. */
export const readingColorPalette = Object.freeze(Object.fromEntries(
  Object.entries(livingWebIndieWebVisualTheme.colors).map(([value, colors]) => [value, colors.fill]),
));

/** The knowledge name of a point given as evidence or as a reading's name. */
export const knowledgeNameOf = (point) => readingOfSides("knowledge", ...sidesOf(point));

/** Both bilattice orders read off one point, as the visual channels use them. */
export function readingVisualSemantics(point) {
  const [truthPresent, falsityPresent] = sidesOf(point);
  const value = readingOfSides("knowledge", truthPresent, falsityPresent);
  const knowledgeRank = knowledgeHeight(value);
  const truthRank = truthHeight(value);
  return Object.freeze({
    value,
    truthPresent,
    falsityPresent,
    knowledgeRank,
    truthRank,
    truthLean: truthRank === 2 ? "for" : truthRank === 0 ? "against" : "underdetermined",
    contradictory: truthPresent && falsityPresent,
  });
}

/** The fill color of a point. */
export function readingToColor(point, palette = readingColorPalette) {
  return palette[knowledgeNameOf(point)];
}

/** The contradiction hatch for the knowledge top, else undefined. */
export function readingToSvgPattern(point, theme = defaultVisualValuationTheme) {
  return readingVisualSemantics(point).contradictory ? theme.contradictionPattern : undefined;
}

export function visualCssDeclarations(visual) {
  return Object.freeze({
    "--reading": `"${visual.value}"`,
    ...(visual.reading === undefined ? {} : { "--reading-family": `"${visual.reading}"`, "--reading-name": `"${visual.name}"` }),
    "--reading-color": visual.color,
    "--reading-hue": String(visual.hue),
    "--reading-knowledge-rank": String(visual.semantics.knowledgeRank),
    "--reading-lightness": `${visual.lightness}%`,
    "--reading-opacity": String(visual.opacity),
    "--reading-pattern": `"${visual.pattern}"`,
    "--reading-saturation": `${visual.saturation}%`,
    "--reading-truth-lean": `"${visual.semantics.truthLean}"`,
    "--reading-truth-rank": String(visual.semantics.truthRank),
    "border-color": visual.borderColor,
    "color": visual.textColor,
    "outline-color": visual.outlineColor,
    "text-decoration-style": visual.decorationStyle,
  });
}

/**
 * Project a point to visual channels, named in the `reading` family when one is given
 * (knowledge, told, truth, extremal): a display names points in the order it shows.
 */
export function readingToVisual(point, theme = defaultVisualValuationTheme, reading) {
  const semantics = readingVisualSemantics(point);
  const colors = theme.colors[semantics.value];
  const contradictory = semantics.contradictory;
  const visual = Object.freeze({
    kind: "visual-valuation.reading",
    value: semantics.value,
    ...(reading === undefined ? {} : { reading, name: readingOfSides(reading, semantics.truthPresent, semantics.falsityPresent) }),
    hue: contradictory ? theme.contradictionHue : theme.hueByTruthRank[semantics.truthRank],
    lightness: theme.lightnessByKnowledgeRank[semantics.knowledgeRank],
    opacity: theme.opacityByKnowledgeRank[semantics.knowledgeRank],
    saturation: contradictory ? theme.contradictionSaturation : theme.saturationByKnowledgeRank[semantics.knowledgeRank],
    pattern: contradictory ? "contradiction-hatch" : "solid",
    color: colors.fill,
    textColor: colors.text,
    borderColor: colors.border,
    outlineColor: colors.outline,
    decorationStyle: colors.decorationStyle,
    semantics,
  });
  return Object.freeze({ ...visual, cssDeclarations: visualCssDeclarations(visual) });
}

/** One CSS declaration bundle per point, keyed by its knowledge name. */
export function readingVisualCssBundle(theme = defaultVisualValuationTheme, reading) {
  return Object.freeze(Object.fromEntries(Object.keys(theme.colors).map((value) => [value, readingToVisual(value, theme, reading).cssDeclarations])));
}
