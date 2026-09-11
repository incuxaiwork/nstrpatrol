/**
 * Block registry — the Facing logic that decides block boundaries.
 *
 * In the Markapur forest, a Block is a set of compartments FACING each other,
 * organized under a Region notification (a "Division/Block" administrative
 * grouping). The ground truth for that grouping is the `BLOCK` attribute on
 * every compartment in the source survey (mobile/app/src/main/assets/
 * mark_comp.json → the "mark request" JSON the GIS import reads). This module
 * turns the raw, inconsistently-spelled BLOCK strings into ONE canonical block
 * name per group, so:
 *
 *   - every compartment gets a `block` attribute during import, and
 *   - the `/api/gis/blocks` dissolve groups compartments by their canonical
 *     block (ST_Union on PostGIS; the same grouping when PostGIS is absent).
 *
 * Canonicalization is deliberately BIASED TOWARD SAFETY: anything this module
 * does not recognize verbatim is kept as its own canonical name (an
 * unrecognized spelling is never silently merged into a block it might not
 * belong to). The Eastern-Nagaram series is the ONLY family whose recognizable
 * spelling variants collapse into one block, because that series is spelled
 * dozens of ways in the source data while denoting the same organized blocks.
 *
 * Rules, in priority order:
 *
 *  1. Blank / missing → '' (no block attribute).
 *
 *  2. "ENCLOSURE" → the enclosures network keeps its own block. (Enclosures
 *     are fenced pockets inside forest blocks; they are surveyed as
 *     COMP_NO 0 polygons with BLOCK "ENCLOSURE" and must not be dissolved into
 *     the surrounding block's outline.)
 *
 *  3. Eastern-Nagaram series ("E.N.", "ENB", "E.N.B", "E.N. Block/Blk", …).
 *     A compartment belongs to "E.N. BLOCK <n>" when, after collapsing all
 *     non-alphanumerics, the source begins with the series prefix
 *     (ENB… / ENBLOCK… / ENBLK… / "E.N." + block marker). The leading Roman
 *     numeral (II–XIV) names the block; a tail suffix names a SUB-BLOCK of the
 *     same block ("B", "A", "Extension-I"…). All observed spellings of the
 *     same numeral (E.N.B. IV / E.N.B IV / E.N.BLOCK IV / ENB-IV) dissolve to
 *     the same "E.N. BLOCK IV"; extension/letter sub-blocks keep their suffix
 *     so spatially distinct pieces never collapse into one polygon.
 *
 *  4. Named native blocks ("MARKAPUR", "CUMBUM", "MUTUKURU", "PASUVEMULA RF",
 *     "G.V.PALLI-1 RF", …) → uppercase, whitespace collapsed, "_" → " ".
 *     No two distinct native names are ever merged.
 *
 * The complete raw → canonical mapping for the shipped survey is pinned as an
 * explicit table in gis-contract.test.ts (data-driven audit of this logic).
 */

/** Collapse to uppercase alphanumerics only (whitespace/punct removed). */
function alnum(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.toUpperCase();
    if ((c >= "A" && c <= "Z") || (c >= "0" && c <= "9")) out += c;
  }
  return out;
}

/** Roman numerals II–XIV, longest first so "III" never matches "II"+"I". */
const ROMAN = [
  "XIV", "XIII", "XII", "XI", "X", "IX", "VIII", "VII", "VI", "V", "IV", "III", "II",
];

/** "EXTENSION-I" → "Extension-I"; bare letters stay as-is. */
function prettifySuffix(raw: string): string {
  const ext = raw.match(/^EXTENSION(.+)$/);
  if (ext) {
    const tail = ext[1];
    return `Extension-${ROMAN.includes(tail) || /^[0-9]+$/.test(tail) ? tail : tail.replace(/([A-Z])/g, (_m, l: string) => `${l}`)}`;
  }
  return raw;
}

/**
 * Match the Eastern-Nagaram series. `up` is the raw block name, uppercased
 * (may still contain separators). Returns the canonical block name, or null
 * when the string is not recognized as part of the series.
 */
function matchEasternNagaram(up: string): string | null {
  const collapsed = alnum(up);
  // Recognize the series by its collapsed prefix set. Order matters: the
  // "BLOCKN" typo (E.N. BLOCKN VI C) must be tested before the plain BLOCK
  // form, and "ENB" before generic "EN".
  let rest: string | null = null;
  if (collapsed.startsWith("ENBLOCKN")) rest = collapsed.slice(8); // typo "E.N. BLOCKN VI C"
  else if (collapsed.startsWith("ENBLOCK")) rest = collapsed.slice(7);
  else if (collapsed.startsWith("ENBLK")) rest = collapsed.slice(5);
  else if (collapsed.startsWith("ENB")) rest = collapsed.slice(3);
  else if (collapsed.startsWith("EN")) rest = collapsed.slice(2);

  // A plain "EN…" prefix is ambiguous (e.g. an unrelated English word) — the
  // series is only confirmed once a Roman numeral block number follows.
  if (rest == null) return null;

  const rawRoman = rest.match(new RegExp(`^(${ROMAN.join("|")})`));
  if (!rawRoman) return null;
  const roman = rawRoman[1];
  const tail = rest.slice(roman.length);
  const suffix = tail ? ` ${prettifySuffix(tail)}` : "";
  return `E.N. BLOCK ${roman}${suffix}`;
}

/** Readable normalization for named native blocks (never merges distinct names). */
function normalizeNative(up: string): string {
  return up.replace(/\s+/g, " ").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Canonical block name for one compartment's BLOCK attribute. See module
 * header for the Facing logic and its safety rules.
 */
export function canonicalBlock(raw: unknown): string {
  const text = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  if (!text) return "";
  const up = text.toUpperCase();
  if (up === "ENCLOSURE") return "ENCLOSURE";
  const enb = matchEasternNagaram(up);
  if (enb) return enb;
  return normalizeNative(up);
}

/** Kind of a canonical block — useful for styling / filtering. */
export type BlockKind = "enclosure" | "eastern-nagaram" | "native";

export function blockKind(canonical: string): BlockKind {
  if (canonical === "ENCLOSURE") return "enclosure";
  if (canonical.startsWith("E.N. BLOCK")) return "eastern-nagaram";
  return "native";
}

/** Coarse per-block label used by the GIS UI (Roman numerals kept intact). */
export function blockLabel(canonical: string): string {
  const kind = blockKind(canonical);
  if (kind === "eastern-nagaram") return canonical;
  if (kind === "enclosure") return "ENCLOSURES";
  return canonical.charAt(0) + canonical.slice(1);
}

export function blankBlockChar(): string {
  return "";
}