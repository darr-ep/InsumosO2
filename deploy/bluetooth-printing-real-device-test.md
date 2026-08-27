# Bluetooth thermal printing (§23) — real-device validation for task 5.5

**Status: code complete and fully unit/integration-tested against a
mocked Web Bluetooth API surface (`src/printing/escpos.test.ts`,
`src/printing/imageEscpos.test.ts`, `src/printing/WebBluetoothPrinter.test.ts`,
`src/components/ReceiptDialog.test.tsx`); NOT yet exercised against the
real WW-POS58U printer from inside this app.** Real-hardware validation is
explicitly task 5.5's job (deferred, needs a physical Android device, the
real printer, and the user present) — the same category of gap as tasks
4.5/4.6/4.7 and 0.8/0.11.

## What's already done (tasks 5.1-5.4)

- `src/printing/ReceiptPrinter.ts` — the shared contract (§23.4).
- `src/printing/escpos.ts` / `src/printing/imageEscpos.ts` — ESC/POS byte
  builders and image/logo raster support, ported from the `test-impresora`
  prototype that WAS validated against the real WW-POS58U (see
  `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md`). The image module isn't
  wired into the printed receipt yet — §22's ticket content is text-only.
- `src/printing/WebBluetoothPrinter.ts` — the BLE adapter: device
  discovery (confirmed WW-POS58U service UUID `000018f0-...` first),
  GATT connect with `NetworkError` retry, writable-characteristic
  discovery, chunked writes (20 bytes/~20ms pause), and same-tab-session
  reconnection without re-prompting.
- `src/components/ReceiptDialog.tsx` — Bluetooth-first flow: shows
  "Imprimir" only when `isAvailable()` resolves `true` (so it never
  appears on iOS Safari, satisfying CU8's iPhone scenario without any
  user-agent sniffing), falls back to the exact §21 failure message +
  "Reintentar impresión" + the pre-existing "Compartir" button on any
  failure.

All of the above is exercised with a **mocked** `navigator.bluetooth` —
this proves the logic is correct against the documented contract, not
that it works against the actual printer.

## What real-device testing (task 5.5) must confirm

Per SDD.md §23.5 and the `test-impresora` prototype's own open findings
(`HANDOFF-IMPRESION-BLUETOOTH.md` §5):

1. **End-to-end print from this app** (not the prototype) on a real
   Android device with the real WW-POS58U: "Nueva renta" → confirm →
   `ReceiptDialog` → "Imprimir" → picker → connect → ticket physically
   prints, correctly formatted, ñ/accents readable.
2. **Same-session reconnect**: print a second receipt (e.g. a devolución)
   without navigating away — must NOT show the picker again (this repo's
   `WebBluetoothPrinter.connect()` idempotency, currently only verified
   with mocks).
3. **Failure path on real hardware**: turn the printer off, attempt
   print → confirm the exact §21 message appears and "Reintentar
   impresión"/"Compartir" both work, and that the already-saved rental is
   unaffected.
4. **Printer busy / low battery** — explicitly unconfirmed in the
   prototype (§23.5). Observe actual behavior (does `gatt.connect()`
   fail? does a write silently drop?) and confirm the failure path above
   still degrades gracefully rather than hanging.
5. **iPhone**: confirm no "Imprimir" button appears at all (per
   `isAvailable()` returning `false` when `navigator.bluetooth` doesn't
   exist) and "Compartir" works as the only path — the prototype never
   tested this on real iOS hardware either (§5).
6. **Print width**: 384px raster width is untested past "it works" for
   the WW-POS58U's actual maximum (§23.5) — only relevant if a future
   phase wires the logo/image path into the receipt.

## What NOT to do

- Do not mark task 5.5 (or Phase 5 overall) "done" based on the unit/
  integration test suite alone — mocks prove contract correctness, not
  hardware behavior, which is the entire reason this task exists
  separately.
- Do not skip step 2 (same-session reconnect) — it's the one behavior
  this project relies on for "no repeated picker" that the HANDOFF doc
  flags as NOT reliable across page reloads (experimental Chrome flags
  only) but SHOULD hold within one tab session per this app's own
  `WebBluetoothPrinter` design; that assumption is untested against real
  BLE timing.
