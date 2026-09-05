import { describe, expect, it } from "vitest";
import {
  buildStructuredTicket,
  buildTicket,
  chunk,
  concatBytes,
  CUT,
  FEED_LINES,
  formatRow,
  INIT,
  latin1Bytes,
  selectCodepage,
} from "@/printing/escpos";
import type {
  PaymentReceiptData,
  RentalReceiptData,
  ReturnReceiptData,
} from "@/domain/rentals/receipt";


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

describe("formatRow (32 columns thermal width)", () => {
  it("formats key and value with exact spacing to fit 32 chars", () => {
    const row = formatRow("Renta:", "$2,800.00", 32);
    expect(row).toBe("Renta:                 $2,800.00");
    expect(row.length).toBe(32);
  });

  it("truncates or ensures at least one space when string exceeds width (triangulation)", () => {
    const row = formatRow("Concentrador de Oxigeno Portatil 5 Litros", "$2,800.00", 32);
    expect(row.length).toBeLessThanOrEqual(32);
    expect(row).toContain("$2,800.00");
  });
});

describe("buildStructuredTicket (high polish formatted receipt)", () => {
  const sampleRental: RentalReceiptData = {
    kind: "create",
    businessName: "O2 Insumos",
    businessPhone: "771 131 3535",
    folio: "R-000001",
    date: new Date("2026-08-26T10:00:00Z"),
    customerName: "Juan Pérez",
    customerPhone: "5512345678",
    items: [{ itemType: "concentrator", quantity: 1 }],
    initialRentAmount: 2800,
    depositAmount: 1000,
    total: 3800,
  };

  const sampleReturn: ReturnReceiptData = {
    kind: "return",
    businessName: "O2 Insumos",
    businessPhone: "771 131 3535",
    folio: "R-000001",
    customerName: "Juan Pérez",
    customerPhone: "5512345678",
    startedAt: new Date("2026-08-01T10:00:00Z"),
    returnedAt: new Date("2026-08-26T10:00:00Z"),
    rentedDays: 25,
    amountCollected: 2800,
    depositReturned: 1000,
  };

  it("builds structured ticket containing business info, folio, customer, and totals", () => {
    const ticket = buildStructuredTicket(sampleRental);
    const text = new TextDecoder("latin1").decode(ticket);

    expect(text).toContain("Insumos Médicos & Oxígeno");
    expect(text).toContain("COMPROBANTE DE RENTA");
    expect(text).toContain("Folio: R-000001");
    expect(text).toContain("Hora:");
    expect(text).toContain("Cliente: Juan");
    expect(text).toContain("DEPÓSITO GARANTÍA:");
    expect(text).toContain("TOTAL PAGADO:");
    expect(text).toContain("$3,800.00");
    expect(text).toContain("Conserve este comprobante");
  });

  it("builds structured return ticket with return breakdown", () => {
    const ticket = buildStructuredTicket(sampleReturn);
    const text = new TextDecoder("latin1").decode(ticket);

    expect(text).toContain("COMPROBANTE DE DEVOLUCIÓN");
    expect(text).toContain("25 días");
    expect(text).toContain("TOTAL COBRADO:");
    expect(text).toContain("$2,800.00");
  });

  const samplePayment: PaymentReceiptData = {
    kind: "payment",
    businessName: "O2 Insumos",
    businessPhone: "771 131 3535",
    folio: "R-000001",
    customerName: "Juan Pérez",
    customerPhone: "5512345678",
    paymentType: "rent",
    amount: 2300,
    date: new Date("2026-09-10T10:00:00Z"),
    note: undefined,
  };

  it("builds structured payment ticket with the payment type, amount, and total", () => {
    const ticket = buildStructuredTicket(samplePayment);
    const text = new TextDecoder("latin1").decode(ticket);

    expect(text).toContain("COMPROBANTE DE PAGO");
    expect(text).toContain("Folio: R-000001");
    expect(text).toContain("Mensualidad:");
    expect(text).toContain("TOTAL:");
    expect(text).toContain("$2,300.00");
    expect(text).toContain("¡Gracias por su pago!");
  });

  it("includes a Nota line only when the payment has one", () => {
    const withNote = buildStructuredTicket({
      ...samplePayment,
      paymentType: "adjustment",
      note: "Descuento por cliente frecuente",
    });
    const textWithNote = new TextDecoder("latin1").decode(withNote);
    expect(textWithNote).toContain("Ajuste:");
    expect(textWithNote).toContain("Nota:");
    expect(textWithNote).toContain("Descuento por cliente frecuente");

    const withoutNote = buildStructuredTicket(samplePayment);
    const textWithoutNote = new TextDecoder("latin1").decode(withoutNote);
    expect(textWithoutNote).not.toContain("Nota:");
  });

  it("includes raster bitmap when logo is provided", () => {
    const fakeLogo = {
      width: 8,
      height: 2,
      bits: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
    };
    const ticket = buildStructuredTicket(sampleRental, fakeLogo);
    expect(ticket).toBeInstanceOf(Uint8Array);
    expect(ticket.length).toBeGreaterThan(100);
  });
});

