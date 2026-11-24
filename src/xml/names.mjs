/**
 * Internal lexical predicates derived from W3C XML 1.0 Fifth Edition [4],
 * [4a], [5] and Namespaces 1.0 Third Edition [4], [7]-[11].
 * See README's component contract. No Unicode normalization or category lookup.
 */
function start(cp) {
  return cp === 0x3a || cp === 0x5f ||
    (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0xc0 && cp <= 0xd6) || (cp >= 0xd8 && cp <= 0xf6) ||
    (cp >= 0xf8 && cp <= 0x2ff) || (cp >= 0x370 && cp <= 0x37d) ||
    (cp >= 0x37f && cp <= 0x1fff) || (cp >= 0x200c && cp <= 0x200d) ||
    (cp >= 0x2070 && cp <= 0x218f) || (cp >= 0x2c00 && cp <= 0x2fef) ||
    (cp >= 0x3001 && cp <= 0xd7ff) || (cp >= 0xf900 && cp <= 0xfdcf) ||
    (cp >= 0xfdf0 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0xeffff);
}
function continuation(cp) {
  return start(cp) || cp === 0x2d || cp === 0x2e || cp === 0xb7 ||
    (cp >= 0x30 && cp <= 0x39) || (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x203f && cp <= 0x2040);
}
function scan(value, qualified) {
  // Template substitution performs abstract ToString once, preserving the
  // original predicate's string hint, Symbol refusal and thrown exceptions.
  const input = `${value}`;
  let needsStart = true, separated = false;
  for (let offset = 0; offset < input.length;) {
    const cp = input.codePointAt(offset);
    offset += cp > 0xffff ? 2 : 1;
    if (qualified && cp === 0x3a) {
      if (needsStart || separated) return false;
      separated = true;
      needsStart = true;
    } else {
      if (!(needsStart ? start(cp) : continuation(cp))) return false;
      needsStart = false;
    }
  }
  return !needsStart;
}
export function name(value) { return scan(value, false); }
export function qname(value) { return scan(value, true); }
