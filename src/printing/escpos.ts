import type { ReceiptData } from "@/domain/rentals/receipt";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import { paymentTypeLabel } from "@/domain/payments/payment";
import { packRaster, type DitheredImage } from "@/printing/imageEscpos";
import { formatDateDisplay } from "@/lib/formatDate";

const ESC = 0x1b;
const GS = 0x1d;

export const INIT = new Uint8Array([ESC, 0x40]); // ESC @ : reset printer
export const FEED_LINES = (n: number) => new Uint8Array([ESC, 0x64, n]); // ESC d n
export const CUT = new Uint8Array([GS, 0x56, 0x00]); // GS V 0 : full cut (if the printer has a cutter)

// Text alignment
export const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
export const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
export const ALIGN_RIGHT = new Uint8Array([ESC, 0x61, 0x02]);

// Text styles & fonts
export const FONT_A = new Uint8Array([ESC, 0x4d, 0x00]); // ESC M 0 : Standard font (Font A)
export const FONT_B = new Uint8Array([ESC, 0x4d, 0x01]); // ESC M 1 : Compressed font (Font B)
export const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
export const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
export const DOUBLE_SIZE = new Uint8Array([GS, 0x21, 0x11]);
export const DOUBLE_HEIGHT = new Uint8Array([GS, 0x21, 0x01]);
export const DOUBLE_WIDTH = new Uint8Array([GS, 0x21, 0x10]);
export const TEXT_NORMAL = new Uint8Array([GS, 0x21, 0x00]);

// n=16 (WPC1252) confirmed against the WW-POS58U: ñ/tildes print correctly.
// The Epson standard only guarantees n=0 (PC437); the rest of the range is
// vendor-specific, so this is a fixed, hardware-confirmed default rather
// than an assumption.
const CONFIRMED_CODEPAGE = 16;

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export const LINE_WIDTH = 48;
const SOLID_DIVIDER = "=".repeat(LINE_WIDTH) + "\n";
const DASH_DIVIDER = "-".repeat(LINE_WIDTH) + "\n";

/**
 * Formats a 2-column key-value line for thermal roll widths (48 columns for 80mm).
 * E.g.: "Concentrador 5L                                $2,800.00"
 */
export function formatRow(left: string, right: string, width = LINE_WIDTH): string {
  const totalLen = left.length + right.length;
  if (totalLen >= width) {
    const availableLeft = Math.max(1, width - right.length - 1);
    const truncatedLeft = left.length > availableLeft ? left.slice(0, availableLeft) : left;
    const spaces = Math.max(1, width - truncatedLeft.length - right.length);
    return truncatedLeft + " ".repeat(spaces) + right;
  }
  const spaces = width - totalLen;
  return left + " ".repeat(spaces) + right;
}

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
 * Splits byte arrays into chunks for BLE transmission. 128 bytes is standard
 * for modern thermal printers, providing fast throughput while staying within
 * safe BLE packet bounds.
 */
export function chunk(data: Uint8Array, size = 128): Uint8Array[] {
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
 * Builds a basic text ticket for backwards compatibility.
 */
export function buildTicket(lines: string[]): Uint8Array {
  const parts: Uint8Array[] = [INIT, selectCodepage(CONFIRMED_CODEPAGE)];
  for (const line of lines) {
    parts.push(latin1Bytes(line + "\n"));
  }
  parts.push(FEED_LINES(6));
  parts.push(CUT);
  return concatBytes(parts);
}

/**
 * Builds a structured, high-polish thermal ticket with optional dithered logo,
 * centered header, clean key-value column alignment, clear section dividers,
 * emphasized totals, and friendly footer with bottom margin.
 */
export function buildStructuredTicket(
  receipt: ReceiptData,
  logo?: DitheredImage | null,
): Uint8Array {
  const parts: Uint8Array[] = [
    INIT,
    selectCodepage(CONFIRMED_CODEPAGE),
    FEED_LINES(1), // Margen superior inicial para que el cabezal imprima sobre papel plano tras el corte
  ];

  // 1. Logo (if available) - with clean top padding
  if (logo) {
    parts.push(ALIGN_CENTER);
    parts.push(packRaster(logo));
    parts.push(FEED_LINES(1));
  }

  // 2. Business Header (el logo ya incluye el nombre del negocio)
  parts.push(ALIGN_CENTER);
  parts.push(TEXT_NORMAL);
  parts.push(latin1Bytes("Insumos Médicos & Oxígeno\n"));
  if (receipt.businessPhone) {
    parts.push(latin1Bytes("Urgencias / Soporte:\n"));
    parts.push(BOLD_ON);
    parts.push(latin1Bytes(`Tel: ${receipt.businessPhone}\n`));
    parts.push(BOLD_OFF);
  }
  parts.push(latin1Bytes(SOLID_DIVIDER));

  // 3. Document Title & Folio
  parts.push(BOLD_ON);
  const title =
    receipt.kind === "return"
      ? "COMPROBANTE DE DEVOLUCIÓN"
      : receipt.kind === "payment"
        ? "COMPROBANTE DE PAGO"
        : "COMPROBANTE DE RENTA";
  parts.push(latin1Bytes(title + "\n"));
  parts.push(latin1Bytes(`Folio: ${receipt.folio}\n`));
  parts.push(BOLD_OFF);
  parts.push(latin1Bytes(DASH_DIVIDER));

  // 4. Customer & Date Info (Unificados en una sola sección limpia, nombre completo)
  const targetDate =
    receipt.kind === "return" ? receipt.returnedAt : receipt.date;
  const dateStr = formatDateDisplay(targetDate);
  parts.push(ALIGN_LEFT);
  parts.push(latin1Bytes(`Fecha: ${dateStr}\n`));
  parts.push(latin1Bytes(`Cliente: ${receipt.customerName}\n`));
  parts.push(latin1Bytes(DASH_DIVIDER));

  // 5. Items / Breakdown
  if (receipt.kind === "return") {
    parts.push(
      latin1Bytes(
        formatRow(
          "Fecha inicio:",
          formatDateDisplay(receipt.startedAt),
        ) + "\n",
      ),
    );
    parts.push(
      latin1Bytes(
        formatRow(
          "Fecha devolución:",
          formatDateDisplay(receipt.returnedAt),
        ) + "\n",
      ),
    );
    parts.push(
      latin1Bytes(
        formatRow("Tiempo rentado:", `${receipt.rentedDays} días`) + "\n",
      ),
    );
    parts.push(latin1Bytes(DASH_DIVIDER));
    parts.push(
      latin1Bytes(
        formatRow(
          "Monto cobrado:",
          currencyFormatter.format(receipt.amountCollected),
        ) + "\n",
      ),
    );
    parts.push(BOLD_ON);
    parts.push(
      latin1Bytes(
        formatRow(
          "DEPÓSITO DEVUELTO:",
          currencyFormatter.format(receipt.depositReturned),
        ) + "\n",
      ),
    );
    parts.push(BOLD_OFF);
    if (receipt.note) {
      parts.push(latin1Bytes(`Nota: ${receipt.note}\n`));
    }
  } else if (receipt.kind === "payment") {
    parts.push(BOLD_ON);
    parts.push(
      latin1Bytes(
        formatRow(
          `${paymentTypeLabel(receipt.paymentType)}:`,
          currencyFormatter.format(receipt.amount),
        ) + "\n",
      ),
    );
    parts.push(BOLD_OFF);
    if (receipt.note) {
      // Plain text, NOT `formatRow` — that helper is for two-column
      // label:value rows and truncates the LEFT side once the combined
      // length passes the line width. A short "Nota:" label paired with
      // free-text notes (which can easily run the full line width) truncated
      // the label itself down to a single stray letter instead of shortening
      // the note — confirmed live via a test with a 32-char note. A note has
      // no fixed-width "value" side to align against, so it isn't a
      // `formatRow` row at all.
      parts.push(latin1Bytes(`Nota: ${receipt.note}\n`));
    }
  } else {
    for (const item of receipt.items) {
      parts.push(
        latin1Bytes(
          formatRow(
            `${item.quantity} x ${rentalItemTypeLabel(item.itemType)}`,
            "",
          ) + "\n",
        ),
      );
    }
    parts.push(
      latin1Bytes(
        formatRow(
          "Renta inicial:",
          currencyFormatter.format(receipt.initialRentAmount),
        ) + "\n",
      ),
    );
    parts.push(BOLD_ON);
    parts.push(
      latin1Bytes(
        formatRow(
          "DEPÓSITO GARANTÍA:",
          currencyFormatter.format(receipt.depositAmount),
        ) + "\n",
      ),
    );
    parts.push(BOLD_OFF);
  }

  // 6. Totals
  parts.push(latin1Bytes(SOLID_DIVIDER));
  parts.push(BOLD_ON);
  if (receipt.kind === "return") {
    parts.push(
      latin1Bytes(
        formatRow(
          "TOTAL COBRADO:",
          currencyFormatter.format(receipt.amountCollected),
        ) + "\n",
      ),
    );
  } else if (receipt.kind === "payment") {
    parts.push(
      latin1Bytes(
        formatRow("TOTAL:", currencyFormatter.format(receipt.amount)) + "\n",
      ),
    );
  } else {
    parts.push(
      latin1Bytes(
        formatRow("TOTAL PAGADO:", currencyFormatter.format(receipt.total)) +
          "\n",
      ),
    );
  }
  parts.push(BOLD_OFF);
  parts.push(latin1Bytes(SOLID_DIVIDER));

  // 7. Footer
  parts.push(ALIGN_CENTER);
  if (receipt.kind === "return") {
    parts.push(latin1Bytes("¡Gracias por su preferencia!\n"));
    parts.push(latin1Bytes("Equipo entregado y cerrado.\n"));
  } else if (receipt.kind === "payment") {
    parts.push(latin1Bytes("¡Gracias por su pago!\n"));
  } else {
    parts.push(latin1Bytes("* Conserve este comprobante *\n"));
    parts.push(latin1Bytes("Indispensable para devolución\n"));
    parts.push(latin1Bytes("de su depósito en garantía.\n"));
  }
  parts.push(latin1Bytes("No se aceptan cambios,\n"));
  parts.push(latin1Bytes("devoluciones ni reembolsos\n"));
  parts.push(FEED_LINES(6));
  parts.push(CUT);

  return concatBytes(parts);
}

