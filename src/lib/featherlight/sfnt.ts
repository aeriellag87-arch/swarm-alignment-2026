/** FeatherLight Ledger, browser port — a TrueType font that *is* the database.
 *
 *  Same format as the wiki's `lib/font-db/sfnt.mjs`: the payload is gzipped JSON
 *  XOR-sharded into an `OPSC` table under keys derived from the other tables, so
 *  a truncated, subsetted or partially mirrored copy extracts nothing. A font
 *  minted here extracts with the wiki's `extractLedger`, and the other way round.
 *
 *  The wiki builds with node:crypto and node:zlib, which are server-only. This
 *  port uses @noble/hashes and CompressionStream so the desks can mint and read
 *  fonts in the browser with no server and no database. The one addition is an
 *  optional `board` field in the payload; the wiki's extractor ignores it.
 */

import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const REQUIRED_TAGS = ["OPSC", "OS/2", "cmap", "fvar", "glyf", "gvar", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"];

export type FontEmbed = { kind: string; label?: string; value: string };

export type FontSnapshot = {
  builtAt?: string;
  keys?: unknown[];
  signers?: unknown[];
  tickets?: unknown[];
  jobs?: unknown[];
  queue?: unknown;
  requests?: unknown[];
  attestations?: unknown[];
  primitives?: unknown;
  embeds?: FontEmbed[];
  chainHead?: string;
  doctrine?: unknown;
  economy?: unknown;
  circles?: unknown[];
  chain?: unknown;
  board?: unknown;
};

export type Minted = { ttf: Uint8Array; sha256: string; cid: string; bytes: number; builtAt: string };

export type Extracted =
  | { complete: false; reason: string }
  | ({ complete: true; sha256: string; cid: string; bytes: number } & Required<Pick<FontSnapshot, "keys" | "signers" | "embeds">> &
      Omit<FontSnapshot, "keys" | "signers" | "embeds">);

const UPEM = 1000;
const PUA0 = 0xe000;
const PUA_COUNT = 16;

// ── bytes ────────────────────────────────────────────────────────────────────

function u16(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
function i16(n: number): Uint8Array {
  return u16(n & 0xffff);
}
function i64mac(ms: number): Uint8Array {
  let sec = BigInt(Math.floor(ms / 1000) + 2082844800);
  const b = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    b[i] = Number(sec & 0xffn);
    sec >>= 8n;
  }
  return b;
}
function ascii(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0x7f));
}
function tag(s: string): Uint8Array {
  return ascii(s.padEnd(4, " ").slice(0, 4));
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function pad4(buf: Uint8Array): Uint8Array {
  const n = (4 - (buf.length % 4)) % 4;
  return n ? concat([buf, new Uint8Array(n)]) : buf;
}
function readU16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function writeU32(b: Uint8Array, o: number, n: number) {
  b.set(u32(n), o);
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function sha256buf(buf: Uint8Array): Uint8Array {
  return nobleSha256(buf);
}
export function sha256hex(buf: Uint8Array): string {
  return bytesToHex(nobleSha256(buf));
}
function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
function tableChecksum(buf: Uint8Array): number {
  const p = pad4(buf);
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum = (sum + readU32(p, i)) >>> 0;
  return sum;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const gzip = (b: Uint8Array) => pipe(b, new CompressionStream("gzip"));
const gunzip = (b: Uint8Array) => pipe(b, new DecompressionStream("gzip"));

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function cidv1Raw(buf: Uint8Array): string {
  return "b" + base32(concat([new Uint8Array([0x01, 0x55, 0x12, 0x20]), sha256buf(buf)]));
}

// ── tables (mirrors sfnt.mjs) ────────────────────────────────────────────────

function emptyGlyph(): Uint8Array {
  return concat([i16(0), i16(0), i16(0), i16(0), i16(0)]);
}

function simpleRectGlyph(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const flags: number[] = [];
  const xs: Uint8Array[] = [];
  const ys: Uint8Array[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of pts) {
    const dx = x - px;
    const dy = y - py;
    let f = 0x01;
    if (dx === 0) f |= 0x10;
    if (dy === 0) f |= 0x20;
    flags.push(f);
    if (dx !== 0) xs.push(i16(dx));
    if (dy !== 0) ys.push(i16(dy));
    px = x;
    py = y;
  }
  return concat([i16(1), i16(x0), i16(y0), i16(x1), i16(y1), u16(3), u16(0), new Uint8Array(flags), ...xs, ...ys]);
}

function utf16be(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) b.set(u16(s.charCodeAt(i) & 0xffff), i * 2);
  return b;
}

function buildCmap(): Uint8Array {
  const segs = [
    { start: 0x0020, end: 0x0020, delta: (1 - 0x0020) & 0xffff },
    { start: PUA0, end: PUA0 + PUA_COUNT - 1, delta: (2 - PUA0) & 0xffff },
    { start: 0xffff, end: 0xffff, delta: 1 },
  ];
  const segCount = segs.length;
  let searchRange = 2;
  let entrySelector = 0;
  while (searchRange * 2 <= segCount * 2) {
    searchRange *= 2;
    entrySelector += 1;
  }
  const rangeShift = segCount * 2 - searchRange;
  const rec = concat([
    u16(segCount * 2), u16(searchRange), u16(entrySelector), u16(rangeShift),
    ...segs.map((s) => u16(s.end)), u16(0),
    ...segs.map((s) => u16(s.start)),
    ...segs.map((s) => u16(s.delta)),
    ...segs.map(() => u16(0)),
  ]);
  const format4 = concat([u16(4), u16(rec.length + 6), u16(0), rec]);
  return concat([u16(0), u16(1), concat([u16(3), u16(1), u32(12)]), format4]);
}

function buildName(embeds: FontEmbed[]): Uint8Array {
  const rows: [number, string][] = [
    [0, "Copyright OpsCo FeatherLight Ledger"],
    [1, "FeatherLight Ledger"],
    [2, "Regular"],
    [3, "OpsCo:FeatherLight Ledger:1"],
    [4, "FeatherLight Ledger"],
    [5, "Version 1.000"],
    [6, "FeatherLightLedger"],
    [256, "FLAN animation"],
  ];
  embeds.slice(0, 24).forEach((e, i) => {
    rows.push([257 + i, `${String(e.kind || "custom").slice(0, 40)}:${String(e.value || "").slice(0, 200)}`]);
  });
  const encoded = rows.map(([id, text]) => ({ id, bytes: utf16be(text) }));
  let offset = 0;
  const records: Uint8Array[] = [];
  const strings: Uint8Array[] = [];
  for (const r of encoded) {
    records.push(concat([u16(3), u16(1), u16(0x0409), u16(r.id), u16(r.bytes.length), u16(offset)]));
    strings.push(r.bytes);
    offset += r.bytes.length;
  }
  const recs = concat(records);
  return concat([u16(0), u16(encoded.length), u16(6 + recs.length), recs, ...strings]);
}

function buildOS2(): Uint8Array {
  const table = concat([
    u16(4), i16(500), u16(400), u16(5), u16(0),
    i16(0), i16(0), i16(0), i16(0),
    i16(0), i16(0), i16(0), i16(0),
    i16(0), i16(0),
    i16(0),
    new Uint8Array(10),
    u32(1), u32(0), u32(0), u32(1 << 25),
    ascii("OPSC"),
    u16(0x0040), u16(0x0020), u16(PUA0 + PUA_COUNT - 1),
    i16(800), i16(-200), i16(0), u16(800), u16(200),
    u32(1), u32(0),
    i16(500), i16(700), u16(0), u16(0x20), u16(1),
  ]);
  if (table.length !== 96) throw new Error("OS/2 must be 96 bytes, got " + table.length);
  return table;
}

function buildHead(xMin: number, yMin: number, xMax: number, yMax: number, now: number): Uint8Array {
  return concat([
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5),
    u16(0x0003), u16(UPEM), i64mac(now), i64mac(now),
    i16(xMin), i16(yMin), i16(xMax), i16(yMax),
    u16(0), u16(8), i16(2), i16(1), i16(0),
  ]);
}

function buildHhea(numGlyphs: number, advanceMax: number): Uint8Array {
  return concat([
    u32(0x00010000), i16(800), i16(-200), i16(0), u16(advanceMax),
    i16(0), i16(0), i16(advanceMax), i16(1), i16(0), i16(0),
    i16(0), i16(0), i16(0), i16(0), i16(0), u16(numGlyphs),
  ]);
}

function buildMaxp(numGlyphs: number, maxPoints: number, maxContours: number): Uint8Array {
  return concat([
    u32(0x00010000), u16(numGlyphs), u16(maxPoints), u16(maxContours),
    u16(0), u16(0), u16(2), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0),
  ]);
}

function buildPost(): Uint8Array {
  return concat([u32(0x00030000), u32(0), i16(-100), i16(50), u32(0), u32(0), u32(0), u32(0), u32(0)]);
}

function buildFvar(): Uint8Array {
  const axis = concat([tag("FLAN"), u32(0), u32(0), u32(0x03e80000), u16(0), u16(256)]);
  return concat([u16(1), u16(0), u16(16), u16(0), u16(1), u16(20), u16(0), u16(0), axis]);
}

function buildGvar(numGlyphs: number): Uint8Array {
  const headerSize = 20;
  const offsets: Uint8Array[] = [];
  for (let i = 0; i <= numGlyphs; i++) offsets.push(u16(0));
  return concat([u16(1), u16(0), u16(1), u16(0), u32(headerSize), u16(numGlyphs), u16(0), u32(headerSize + 2 * (numGlyphs + 1)), ...offsets]);
}

function assembleSfnt(tables: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(tables).sort();
  const num = names.length;
  let searchRange = 1;
  let exp = 0;
  while (searchRange * 2 <= num) {
    searchRange *= 2;
    exp += 1;
  }
  searchRange *= 16;
  let offset = 12 + 16 * num;
  const records: Uint8Array[] = [];
  const bodies: Uint8Array[] = [];
  let headOffset = 0;
  for (const name of names) {
    const raw = tables[name];
    if (name === "head") headOffset = offset;
    records.push(concat([tag(name), u32(tableChecksum(raw)), u32(offset), u32(raw.length)]));
    const body = pad4(raw);
    bodies.push(body);
    offset += body.length;
  }
  const font = concat([u32(0x00010000), u16(num), u16(searchRange), u16(exp), u16(num * 16 - searchRange), ...records, ...bodies]);
  writeU32(font, headOffset + 8, (0xb1b0afba - tableChecksum(font)) >>> 0);
  return font;
}

function zeroHeadAdj(buf: Uint8Array): Uint8Array {
  const raw = buf.slice();
  if (raw.length >= 12) writeU32(raw, 8, 0);
  return raw;
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

async function buildOpsc(tables: Record<string, Uint8Array>, s: FontSnapshot & { builtAt: string; embeds: FontEmbed[] }): Promise<Uint8Array> {
  const restHash = sha256buf(concat(Object.keys(tables).sort().map((k) => tables[k])));
  const keysKey = sha256buf(concat([tables.glyf, tables.loca, tables.cmap]));
  const signersKey = sha256buf(concat([tables.name, tables.hmtx, tables["OS/2"]]));
  const embedKey = sha256buf(concat([tables.head, tables.hhea, tables.maxp, tables.post, tables.fvar]));
  const keysPlain = json(s.keys || []);
  const signersPlain = json(s.signers || []);
  const payload = await gzip(
    json({
      v: 1,
      builtAt: s.builtAt,
      doctrine: s.doctrine,
      tickets: s.tickets || [],
      embeds: s.embeds,
      jobs: s.jobs || [],
      queue: s.queue || {},
      requests: s.requests || [],
      attestations: s.attestations || [],
      primitives: s.primitives || {},
      chainHead: s.chainHead || "",
      economy: s.economy || null,
      circles: s.circles || [],
      chain: s.chain || null,
      board: s.board ?? null,
      restHash: bytesToHex(restHash),
    }),
  );
  return concat([
    ascii("OPSC"), u16(1), u16(1), restHash,
    u32(keysPlain.length), u32(signersPlain.length), u32(payload.length),
    xorBytes(keysPlain, keysKey), xorBytes(signersPlain, signersKey), xorBytes(payload, embedKey),
  ]);
}

// ── mint / extract ───────────────────────────────────────────────────────────

/** The glyph tables. Without entropy they are the wiki's fixed pattern. With
 *  entropy (the epoch's memory-hard output) each PUA glyph's width and height
 *  come from two of its bytes, so the outlines ARE the epoch's entropy — and
 *  since glyf/loca/hmtx seed the shard keys, the whole file depends on it. */
export function glyphTables(entropy?: Uint8Array): { glyf: Uint8Array; loca: Uint8Array; hmtx: Uint8Array; hhea: Uint8Array; numGlyphs: number } {
  if (entropy && entropy.length < PUA_COUNT * 2) throw new Error(`entropy must be at least ${PUA_COUNT * 2} bytes`);
  const glyfs = [simpleRectGlyph(40, 40, 560, 660), emptyGlyph()];
  const advances = [600, 250];
  const lsbs = [40, 0];
  for (let i = 0; i < PUA_COUNT; i++) {
    const w = entropy ? 120 + entropy[2 * i] : 180 + (i % 5) * 12;
    const h = entropy ? 300 + Math.floor(entropy[2 * i + 1] * 1.5) : 420 + (i % 7) * 18;
    glyfs.push(simpleRectGlyph(20, 0, 20 + w, h));
    advances.push(w + 40);
    lsbs.push(20);
  }
  const loca = [0];
  let off = 0;
  for (const g of glyfs) {
    off += g.length;
    loca.push(off);
  }
  return {
    glyf: concat(glyfs),
    loca: concat(loca.map((n) => u32(n))),
    hmtx: concat(advances.map((w, i) => concat([u16(w), i16(lsbs[i])]))),
    hhea: buildHhea(glyfs.length, Math.max(...advances)),
    numGlyphs: glyfs.length,
  };
}

/** Mint. `now` stamps the head table — pass the epoch's anchor time, not the
 *  wall clock, and the same inputs mint the same geometry on any machine. */
export async function buildLedgerFont(snapshot: FontSnapshot, opts: { now?: number; entropy?: Uint8Array } = {}): Promise<Minted> {
  const now = opts.now ?? Date.now();
  const builtAt = snapshot.builtAt || new Date(now).toISOString();
  const embeds = snapshot.embeds || [];
  const g = glyphTables(opts.entropy);
  const tables: Record<string, Uint8Array> = {
    cmap: buildCmap(),
    head: buildHead(0, 0, 600, 700, now),
    hhea: g.hhea,
    hmtx: g.hmtx,
    loca: g.loca,
    glyf: g.glyf,
    maxp: buildMaxp(g.numGlyphs, 4, 1),
    name: buildName(embeds),
    post: buildPost(),
    "OS/2": buildOS2(),
    fvar: buildFvar(),
    gvar: buildGvar(g.numGlyphs),
  };
  return sealFont(tables, { ...snapshot, builtAt, embeds });
}

/** Seal a table set with the ledger and assemble it: the one path every
 *  FeatherLight mint takes, the epoch fonts here and the plate fonts
 *  (plate.ts). The tables must include every REQUIRED_TAG except OPSC, and the
 *  head table's checkSumAdjustment must be zero (it is written on assembly). */
export async function sealFont(tables: Record<string, Uint8Array>, snapshot: FontSnapshot & { builtAt: string }): Promise<Minted> {
  const missing = REQUIRED_TAGS.filter((t) => t !== "OPSC" && !tables[t]);
  if (missing.length) throw new Error(`cannot seal a font without ${missing.join(", ")}`);
  const sealed = { ...tables, OPSC: await buildOpsc(tables, { ...snapshot, embeds: snapshot.embeds || [] }) };
  const ttf = assembleSfnt(sealed);
  return { ttf, sha256: sha256hex(ttf), cid: cidv1Raw(ttf), bytes: ttf.length, builtAt: snapshot.builtAt };
}

/** The variation tables every mint carries: the FLAN axis, and no deltas. */
export function variationTables(numGlyphs: number): { fvar: Uint8Array; gvar: Uint8Array } {
  return { fvar: buildFvar(), gvar: buildGvar(numGlyphs) };
}

export function parseSfntTables(buf: Uint8Array): Record<string, Uint8Array> {
  if (buf.length < 12) throw new Error("truncated offset table");
  const sfnt = readU32(buf, 0);
  if (sfnt !== 0x00010000 && sfnt !== 0x74727565) throw new Error("not a TrueType font");
  const num = readU16(buf, 4);
  if (buf.length < 12 + 16 * num) throw new Error("truncated table directory");
  const tables: Record<string, Uint8Array> = {};
  for (let i = 0; i < num; i++) {
    const o = 12 + 16 * i;
    const name = String.fromCharCode(...buf.slice(o, o + 4)).replace(/ +$/, "");
    const offset = readU32(buf, o + 8);
    const length = readU32(buf, o + 12);
    if (offset + length > buf.length) throw new Error(`truncated table ${name}`);
    tables[name] = buf.slice(offset, offset + length);
  }
  return tables;
}

export async function extractLedger(buf: Uint8Array): Promise<Extracted> {
  let tables: Record<string, Uint8Array>;
  try {
    tables = parseSfntTables(buf);
  } catch (err) {
    return { complete: false, reason: (err as Error)?.message || "truncated font" };
  }
  const missing = REQUIRED_TAGS.filter((t) => !tables[t]);
  if (missing.length) {
    return { complete: false, reason: `incomplete font: missing ${missing.join(", ")}. A partial pin or a subsetted copy cannot yield the ledger.` };
  }
  const opsc = tables.OPSC;
  if (opsc.length < 52 || String.fromCharCode(...opsc.slice(0, 4)) !== "OPSC") {
    return { complete: false, reason: "incomplete font: OPSC table unreadable" };
  }
  const rest = concat(Object.keys(tables).filter((k) => k !== "OPSC").sort().map((k) => (k === "head" ? zeroHeadAdj(tables[k]) : tables[k])));
  if (!equal(sha256buf(rest), opsc.slice(8, 40))) {
    return { complete: false, reason: "incomplete font: table set does not match OPSC restHash. Partial mirrors cannot derive the ledger." };
  }
  const keysLen = readU32(opsc, 40);
  const signersLen = readU32(opsc, 44);
  const payloadLen = readU32(opsc, 48);
  let p = 52;
  const keysCipher = opsc.slice(p, p + keysLen);
  p += keysLen;
  const signersCipher = opsc.slice(p, p + signersLen);
  p += signersLen;
  if (p + payloadLen > opsc.length) return { complete: false, reason: "incomplete font: OPSC payload truncated" };
  const payloadCipher = opsc.slice(p, p + payloadLen);
  const keysKey = sha256buf(concat([tables.glyf, tables.loca, tables.cmap]));
  const signersKey = sha256buf(concat([tables.name, tables.hmtx, tables["OS/2"]]));
  const embedKey = sha256buf(concat([zeroHeadAdj(tables.head), tables.hhea, tables.maxp, tables.post, tables.fvar]));
  try {
    const dec = new TextDecoder();
    const keys = JSON.parse(dec.decode(xorBytes(keysCipher, keysKey)));
    const signers = JSON.parse(dec.decode(xorBytes(signersCipher, signersKey)));
    const payload = JSON.parse(dec.decode(await gunzip(xorBytes(payloadCipher, embedKey))));
    return {
      complete: true,
      sha256: sha256hex(buf),
      cid: cidv1Raw(buf),
      bytes: buf.length,
      keys,
      signers,
      embeds: payload.embeds || [],
      tickets: payload.tickets || [],
      jobs: payload.jobs || [],
      queue: payload.queue || {},
      attestations: payload.attestations || [],
      primitives: payload.primitives || {},
      doctrine: payload.doctrine || {},
      chainHead: payload.chainHead || "",
      economy: payload.economy || null,
      circles: payload.circles || [],
      chain: payload.chain || null,
      board: payload.board ?? null,
      builtAt: payload.builtAt,
    };
  } catch {
    return { complete: false, reason: "incomplete font: shard keys did not invert. The whole file is required." };
  }
}

/** The PUA glyphs' bounding boxes, read from the font's own glyf/loca — for an
 *  epoch mint these are the epoch's entropy, drawn. */
export function glyphBoxes(ttf: Uint8Array): { w: number; h: number }[] {
  const t = parseSfntTables(ttf);
  const count = t.loca.length / 4 - 1;
  const s16 = (o: number) => ((readU16(t.glyf, o) << 16) >> 16);
  const out: { w: number; h: number }[] = [];
  for (let i = 2; i < count; i++) {
    const off = readU32(t.loca, i * 4);
    if (readU32(t.loca, (i + 1) * 4) === off) continue;
    out.push({ w: s16(off + 6) - s16(off + 2), h: s16(off + 8) - s16(off + 4) });
  }
  return out;
}

// ── the font as a link ───────────────────────────────────────────────────────
// base64url, carried in a URL fragment: the fragment never reaches a server, so
// the link is the whole store and nothing is uploaded anywhere.

export function fontToFragment(ttf: Uint8Array): string {
  let bin = "";
  for (const b of ttf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fragmentToFont(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
