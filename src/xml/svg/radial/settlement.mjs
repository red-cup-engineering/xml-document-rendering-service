/** A source-bearing view of Metrologic's finite reading-settlement result.
 * The solver, FOUR algebra, SignCell evidence, semantic identity and XML writer
 * remain their original owners. This adapter never runs a step or invents a trace.
 */
import { isReading, readingAs, readingFamilies } from "@red-cup-engineering/metrologic/four";
import { address, cell, evidenceOf, hasEvidence, hasTriple, presence, valueOf } from "@red-cup-engineering/signcell/cell";
import { bytesToBase64, canonicalCarrier, coincides, decodeSemantic, semanticBytes, semanticId } from "@red-cup-engineering/signcell/content-address";
import { imagePayload } from "@red-cup-engineering/computer-serialized-content-engineering-services-section/image-payload";
import { document, element } from "../../index.mjs";
import { readingMark, svgRoot } from "../index.mjs";
import { dataCarrierMetadata, inspectPassiveSvg, PASSIVE_SVG_LIMITS, readSvgDataCarrier } from "../data-carrier.mjs";
import { radialPalette, radialSvgElement } from "./index.mjs";
import { readingToColor, readingToVisual } from "../visual-valuation.mjs";

const PROFILE = "metrologic.settlement-radial/v1";
const SOURCE_KIND = "metrologic.reading-settlement";
const MAX_SOURCE_BYTES = 1024 * 1024;
const HEADER_AND_FOOTER = 172;
const ROW_HEIGHT = 58;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const cut = (value, max) => { const chars = [...value]; return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : value; };
const plural = (n, singular) => `${n} ${singular}${n === 1 ? "" : "s"}`;
const nameOf = (term) => typeof term === "string" ? term :
  term === null || typeof term === "boolean" || typeof term === "number" ? String(term) :
    typeof term === "bigint" ? `${term}n` : semanticId(term);

function admitSource(result, cells, view) {
  if (!record(result) || Object.keys(result).some(key => key !== "state" && key !== "iterations")) {
    throw new TypeError("settlement radial: expected the original {state, iterations} result");
  }
  if (!Number.isSafeInteger(result.iterations) || result.iterations < 0) {
    throw new TypeError("settlement radial: iterations must be a nonnegative safe integer");
  }
  if (!record(result.state)) throw new TypeError("settlement radial: state must be a plain record of readings");
  // This adapter receives the solver's plain-record result, not a separate wire protocol.
  // FOUR admission below remains owned by Metrologic; canonicalCarrier retains the source.
  const state = result.state;
  const ids = Object.keys(state).sort(compare);
  const width = view.size + 472;
  const heightBudget = Math.min(PASSIVE_SVG_LIMITS.maximumDimension, Math.floor(PASSIVE_SVG_LIMITS.maximumPixels / width));
  const cellBudget = Math.floor((heightBudget - HEADER_AND_FOOTER) / ROW_HEIGHT);
  if (ids.length > cellBudget) throw new RangeError(`settlement radial: this image can show at most ${cellBudget} complete cell keys within the passive image dimensions`);
  // A reading family is a view of a point; retain the actual solver's knowledge
  // names instead of silently converting a different input contract.
  for (const id of ids) if (!isReading(result.state[id], "knowledge")) {
    throw new TypeError("settlement radial: state must contain original knowledge readings");
  }
  let actualCells;
  if (cells !== undefined) {
    if (!record(cells)) throw new TypeError("settlement radial: cells must map result IDs to actual SignCells");
    actualCells = Object.fromEntries(Object.keys(cells).sort(compare).map(id => {
      if (!Object.hasOwn(state, id)) throw new TypeError(`settlement radial: cell ${id} is outside this result`);
      const at = cells[id];
      if (!hasTriple(at) || !hasEvidence(at)) throw new TypeError("settlement radial: an actual SignCell must carry its triple and both witness lists");
      return [id, cell(at.subject, at.predicate, at.object, evidenceOf(at))];
    }));
  }
  const source = canonicalCarrier({ kind: SOURCE_KIND,
    result: { state: Object.fromEntries(ids.map(id => [id, state[id]])), iterations: result.iterations },
    ...(actualCells === undefined ? {} : { cells: actualCells }),
  });
  if (semanticBytes(source).byteLength > MAX_SOURCE_BYTES) throw new RangeError("settlement radial: source exceeds the 1 MiB view budget");
  return source;
}

function admitView(options) {
  if (!record(options)) throw new TypeError("settlement radial: options must be a record");
  if (Object.keys(options).some(key => !["title", "size", "prefix", "cells"].includes(key)))
    throw new TypeError("settlement radial: unknown view option");
  const size = options.size ?? 560;
  if (!Number.isSafeInteger(size) || size < 320 || size > 1600) throw new RangeError("settlement radial: size must be an integer from 320 to 1600");
  const title = options.title ?? "Metrologic settlement";
  if (typeof title !== "string") throw new TypeError("settlement radial: title must be text");
  if (title.length > 4096) throw new RangeError("settlement radial: title exceeds the 4096-character view budget");
  const prefix = options.prefix ?? "settlement-radial";
  if (typeof prefix !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(prefix)) throw new TypeError("settlement radial: prefix must be a bounded XML identifier");
  return canonicalCarrier({ title, size, prefix });
}

/** The same admitted mathematical source feeds accessible facts, layout and bytes.
 * Optional `cells` are actual source SignCells. Their value/presence need not equal
 * the reported settled value; both facts are retained and explicitly distinguished.
 */
export function settlementRadialProjection(result, options = {}) {
  const view = admitView(options);
  const source = admitSource(result, options.cells, view);
  const sourceId = semanticId(source);
  const ids = Object.keys(source.result.state).sort(compare);
  const counts = Object.fromEntries(readingFamilies.truth.map(name => [name, 0]));
  const entries = ids.map((id, index) => {
    const reading = source.result.state[id];
    const truth = readingAs("truth", reading);
    counts[truth]++;
    const at = source.cells !== undefined && Object.hasOwn(source.cells, id) ? source.cells[id] : undefined;
    const label = at === undefined ? id : `${nameOf(at.subject)} · ${nameOf(at.predicate)} · ${nameOf(at.object)}`;
    const witnessText = at === undefined ? "Witnesses not supplied." :
      `Source SignCell value ${readingAs("truth", valueOf(at))}; witness presence ${readingAs("truth", presence(at))}; ` +
      `${plural(at.for.length, "positive witness")}, ${plural(at.against.length, "negative witness")}.`;
    const description = `${index + 1}. ${id}: settled value ${truth} (${reading}). ${witnessText}`;
    return Object.freeze({ id, index: index + 1, reading, truth, label, description,
      ...(at === undefined ? {} : { cellId: address(at), sourceValue: valueOf(at), witnessPresence: presence(at),
        positiveWitnesses: at.for.length, negativeWitnesses: at.against.length }),
      segment: Object.freeze({ e: id, label: `${index + 1} ${readingMark(reading)}`, title: `${label}. ${description}`,
        // Opaque cell IDs have no inferred subject/object relationship.
        orbit: at === undefined ? "unclassified" : coincides(at.subject, at.object) ? "diagonal" : "off-diagonal",
        reading }),
    });
  });
  const countText = readingFamilies.truth.map(name => `${counts[name]} ${name}`).join(", ");
  const description = `Reported Metrologic result: ${plural(ids.length, "cell")}, ${plural(source.result.iterations, "strict change")} before quiescence. ` +
    `FOUR values: ${countText}. Equal angular slots identify cells; position and area are not confidence or evidence strength. ` +
    "Source SignCell values and witness presence, when supplied, are separate facts. No intermediate stages are inferred. " +
    entries.map(entry => entry.description).join(" ");
  const dataform = Object.freeze({ size: view.size, title: view.title, desc: description,
    rings: Object.freeze([Object.freeze({ ordinal: 0, label: "Reported final state", segments: Object.freeze(entries.map(entry => entry.segment)) })]),
  });
  return Object.freeze({ source, sourceId, view, description, counts: Object.freeze(counts), entries: Object.freeze(entries), dataform });
}

function renderProjection(projection) {
  const { source, sourceId, view, entries, counts, description, dataform } = projection;
  const payload = canonicalCarrier({ kind: PROFILE, source, view });
  const bytes = semanticBytes(payload);
  const patternId = `${view.prefix}-contradiction`;
  const radial = radialSvgElement(dataform, { reading: "truth", showLabels: entries.length <= 32, patternId });
  const drawing = element("g", { transform: "translate(16 112)", "aria-hidden": "true" }, radial.children);
  const width = view.size + 472;
  const height = Math.max(view.size + HEADER_AND_FOOTER, HEADER_AND_FOOTER + entries.length * ROW_HEIGHT);
  const text = (x, y, content, attrs = {}) => element("text", { x, y, fill: "#e5e7eb", "font-size": 13, ...attrs }, [content]);
  const titleId = `${view.prefix}-title`, descId = `${view.prefix}-description`;
  const legend = readingFamilies.truth.map((name, index) => element("g", {}, [
    element("rect", { x: 24 + index * 178, y: 77, width: 19, height: 19, rx: 3,
      fill: name === "both" ? `url(#${patternId})` : readingToColor(name, radialPalette),
      "fill-opacity": readingToVisual(name).opacity, stroke: "#cbd2da" }),
    text(50 + index * 178, 92, `${readingMark(name)} ${name}: ${counts[name]}`),
  ]));
  const rows = entries.map(entry => {
    const x = view.size + 36, y = 139 + (entry.index - 1) * ROW_HEIGHT;
    const detail = entry.cellId === undefined ? "Witnesses not supplied" :
      `source ${readingAs("truth", entry.sourceValue)} · presence ${readingAs("truth", entry.witnessPresence)} · +${entry.positiveWitnesses}/−${entry.negativeWitnesses} witnesses`;
    return element("g", { role: "listitem", "data-cell": entry.id, "data-settled-value": entry.truth,
      ...(entry.cellId === undefined ? {} : { "data-signcell": entry.cellId }) }, [
      element("title", {}, [`${entry.label}. ${entry.description}`]),
      text(x, y, `${entry.index}. ${cut(entry.label, 46)}`, { "font-weight": 600 }),
      text(x, y + 18, `${readingMark(entry.reading)} ${entry.truth} · ${cut(entry.id, 42)}`, { fill: "#cbd5e1", "font-size": 12 }),
      text(x, y + 34, detail, { fill: "#aeb9c9", "font-size": 11 }),
    ]);
  });
  const root = svgRoot({ width, height }, [
    element("title", { id: titleId }, [view.title]),
    element("desc", { id: descId }, [description]),
    dataCarrierMetadata({ carrier: { mediaType: "application/cbor", contentBase64: bytesToBase64(bytes) } }),
    element("rect", { width, height, fill: "#151c29" }),
    text(24, 34, cut(view.title, 85), { "font-size": 23, "font-weight": 700 }),
    text(24, 58, `${plural(entries.length, "cell")} · ${plural(source.result.iterations, "strict change")} before quiescence · reported final state`, { fill: "#b6c4d7" }),
    drawing, ...legend,
    element("g", { role: "list", "aria-label": "Settled values and source evidence" }, rows),
    ...(entries.length ? [] : [text(view.size + 36, 150, "No cells in this result.")]),
    text(24, height - 35, `Source ${sourceId}`, { "font-size": 11, fill: "#b6c4d7" }),
    text(24, height - 15, "Equal slots; FOUR color and marks show values. Position is not evidence. Complete source is embedded as canonical CBOR.", { "font-size": 11, fill: "#b6c4d7" }),
  ]);
  root.attributes = { ...root.attributes, "aria-labelledby": `${titleId} ${descId}`, "data-profile": PROFILE, "data-source-ni": sourceId };
  const svg = document(root).trimEnd();
  inspectPassiveSvg(svg);
  return svg;
}

/** Serialize the original radial/layout/writer projection and its exact source. */
export function projectSettlementRadial(result, options = {}) {
  return renderProjection(settlementRadialProjection(result, options));
}

/** Read this existing profile from its original byte carrier, whether received
 * in SVG, PNG or another exact transport. Geometry is reconstructed separately.
 */
export function readSettlementRadialPayload({ carrier } = {}) {
  const admitted = imagePayload({ carrier });
  if (admitted.carrier.mediaType !== "application/cbor") throw new TypeError("settlement radial: canonical semantic CBOR required");
  const payload = decodeSemantic(admitted.bytes);
  if (!record(payload) || payload.kind !== PROFILE || payload.source?.kind !== SOURCE_KIND) throw new TypeError("settlement radial: incompatible source profile");
  const projection = settlementRadialProjection(payload.source.result, { ...payload.view, cells: payload.source.cells });
  const expected = { kind: PROFILE, source: projection.source, view: projection.view };
  if (!coincides(payload, expected)) throw new TypeError("settlement radial: noncanonical or extra payload fields");
  return projection;
}

/** Read only this profile; carrier integrity is content identity, not a signature. */
export function readSettlementRadial(svg) {
  const received = readSvgDataCarrier(svg);
  if (received === null) throw new TypeError("settlement radial: source payload is missing");
  return readSettlementRadialPayload(received);
}

/** Reproduce source, text and paths: a content-consistency check, not solver proof. */
export function verifySettlementRadial(svg) {
  try { return renderProjection(readSettlementRadial(svg)) === svg; } catch { return false; }
}
