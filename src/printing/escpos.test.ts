import { describe, expect, it } from "vitest";
import {
  buildTicket,
  chunk,
  concatBytes,
  CUT,
  FEED_LINES,
  INIT,
  latin1Bytes,
  selectCodepage,
} from "@/printing/escpos";

describe("INIT/CUT (§23.1)", () => {
  it("INIT is ESC @ (reset)", () => {
    expect(Array.from(INIT)).toEqual([0x1b, 0x40]);
  });

  it("CUT is GS V 0 (full cut)", () => {
    expect(Array.from(CUT)).toEqual([0x1d, 0x56, 0x00]);
  });
});

describe("FEED_LINES (§23.1)", () => {
  it("builds ESC d n with the given line count", () => {
    expect(Array.from(FEED_LINES(3))).toEqual([0x1b, 0x64, 3]);
  });

  it("uses a different n for a different line count (triangulation)", () => {
    expect(Array.from(FEED_LINES(5))).toEqual([0x1b, 0x64, 5]);
  });
});

describe("selectCodepage (§23.1)", () => {
  it("builds ESC t n with the confirmed WPC1252 codepage (16)", () => {
    expect(Array.from(selectCodepage(16))).toEqual([0x1b, 0x74, 16]);
  });

  it("builds ESC t n with a different candidate codepage (triangulation)", () => {
    expect(Array.from(selectCodepage(0))).toEqual([0x1b, 0x74, 0]);
  });
});

describe("latin1Bytes (§23.1 — accents/ñ confirmed via WPC1252)", () => {
  it("passes plain ASCII through unchanged", () => {
    expect(Array.from(latin1Bytes("Hola"))).toEqual([
      "H".charCodeAt(0),
      "o".charCodeAt(0),
      "l".charCodeAt(0),
      "a".charCodeAt(0),
    ]);
  });

  it("maps ñ and accented characters to their Latin-1/CP1252 byte (not UTF-8)", () => {
    // ñ=0xF1, á=0xE1, ¿=0xBF — confirmed against the WW-POS58U in the
    // test-impresora prototype with selectCodepage(16).
    expect(Array.from(latin1Bytes("ñ"))).toEqual([0xf1]);
    expect(Array.from(latin1Bytes("á"))).toEqual([0xe1]);
    expect(Array.from(latin1Bytes("¿"))).toEqual([0xbf]);
  });

  it("maps a character that doesn't fit in 1 byte to '?' (0x3f)", () => {
    // e.g. an emoji — UTF-16 code unit above 0xFF, can't be a single
    // Latin-1 byte. Must degrade instead of throwing or corrupting output.
    expect(Array.from(latin1Bytes("🖨"))).toEqual([0x3f, 0x3f]);
  });
});

describe("concatBytes (§23.1)", () => {
  it("joins multiple byte arrays in order", () => {
    const result = concatBytes([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5, 6]),
    ]);

    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("handles a single array without padding or truncation (triangulation)", () => {
    const result = concatBytes([new Uint8Array([9, 9])]);

    expect(Array.from(result)).toEqual([9, 9]);
  });
});

describe("chunk (§23.1 — BLE MTU workaround)", () => {
  it("splits data into fixed-size chunks", () => {
    const data = new Uint8Array(45).map((_, i) => i);
    const chunks = chunk(data, 20);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(20);
    expect(chunks[1]).toHaveLength(20);
    expect(chunks[2]).toHaveLength(5);
  });

  it("returns a single shorter chunk when data is smaller than the chunk size (triangulation)", () => {
    const data = new Uint8Array([1, 2, 3]);
    const chunks = chunk(data, 20);

    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0])).toEqual([1, 2, 3]);
  });
});

describe("buildTicket (§22/§23.1)", () => {
  it("assembles init + codepage(16) + each line in Latin-1 + feed + cut", () => {
    const ticket = buildTicket(["Hola"]);

    expect(Array.from(ticket)).toEqual([
      ...INIT,
      ...selectCodepage(16),
      ...latin1Bytes("Hola\n"),
      ...FEED_LINES(3),
      ...CUT,
    ]);
  });

  it("assembles multiple lines with accents in the correct order (triangulation)", () => {
    const ticket = buildTicket(["Folio: R-000001", "Cliente: Ñoño Pérez"]);

    expect(Array.from(ticket)).toEqual([
      ...INIT,
      ...selectCodepage(16),
      ...latin1Bytes("Folio: R-000001\n"),
      ...latin1Bytes("Cliente: Ñoño Pérez\n"),
      ...FEED_LINES(3),
      ...CUT,
    ]);
  });
});
