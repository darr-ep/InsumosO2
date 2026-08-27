/**
 * SDD.md §23.1 — ESC/POS commands and BLE chunking, validated against the
 * real WW-POS58U thermal printer in the discardable `test-impresora`
 * prototype (see `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md`). Ported
 * and adapted for production use (task 5.2): the minimal command set that
 * "practically any ESC/POS clone" supports (init, feed, cut), plus the
 * codepage command confirmed live for ñ/tildes.
 *
 * ESC/POS printers use 1-byte codepages, not UTF-8 — a "ñ" encoded as
 * UTF-8 becomes 2 bytes (0xC3 0xB1) and breaks any single-byte codepage.
 * `latin1Bytes` sends the raw Latin-1/CP1252 byte instead (á=0xE1,
 * ñ=0xF1, ¿=0xBF, ...), which is what `selectCodepage`'s confirmed value
 * (16 = WPC1252) expects.
 */

const ESC = 0x1b;
const GS = 0x1d;

export const INIT = new Uint8Array([ESC, 0x40]); // ESC @ : reset printer
export const FEED_LINES = (n: number) => new Uint8Array([ESC, 0x64, n]); // ESC d n
export const CUT = new Uint8Array([GS, 0x56, 0x00]); // GS V 0 : full cut (if the printer has a cutter)

// n=16 (WPC1252) confirmed against the WW-POS58U: ñ/tildes print correctly.
// The Epson standard only guarantees n=0 (PC437); the rest of the range is
// vendor-specific, so this is a fixed, hardware-confirmed default rather
// than an assumption.
const CONFIRMED_CODEPAGE = 16;

/**
 * The Unicode code point of á/é/í/ó/ú/ñ/¿/¡ coincides byte-for-byte with
 * its position in Latin-1/CP1252, so we can send that raw byte directly.
 * Characters that don't fit in 1 byte (e.g. emoji) degrade to '?' instead
 * of throwing or corrupting the rest of the ticket.
 */
export function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  return bytes;
}

// ESC t n : selects the character table. "n"'s meaning isn't universal
// across manufacturers (Epson's own standard only defines n=0); 16 is the
// value confirmed against the WW-POS58U.
export function selectCodepage(n: number): Uint8Array {
  return new Uint8Array([ESC, 0x74, n]);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Cheap BLE thermal printers commonly have a small effective MTU (~20
 * bytes) and drop or garble data sent in one large write — confirmed
 * against the WW-POS58U in the prototype. The caller pairs this with a
 * short pause between writes (see `WebBluetoothPrinter`, task 5.3).
 */
export function chunk(data: Uint8Array, size = 20): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a full text ticket: init, codepage, each line (Latin-1,
 * newline-terminated), feed and cut. The line content itself comes from
 * `formatReceiptLines` (domain layer, §22) — this module only knows about
 * bytes, never about rental/receipt business content.
 */
export function buildTicket(lines: string[]): Uint8Array {
  const parts: Uint8Array[] = [INIT, selectCodepage(CONFIRMED_CODEPAGE)];
  for (const line of lines) {
    parts.push(latin1Bytes(line + "\n"));
  }
  parts.push(FEED_LINES(3));
  parts.push(CUT);
  return concatBytes(parts);
}
