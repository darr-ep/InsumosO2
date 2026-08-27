import { buildTicket, chunk, sleep } from "@/printing/escpos";
import { formatReceiptLines } from "@/domain/rentals/receipt";
import type { ReceiptData } from "@/domain/rentals/receipt";
import type { ReceiptPrinter } from "@/printing/ReceiptPrinter";

/**
 * SDD.md §23.1/§23.3/§23.4 (task 5.3) — adapter for the WW-POS58U
 * thermal printer, porting the `doSearch`/`doConnect` pattern validated
 * against real hardware in the `test-impresora` prototype (see
 * `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md`).
 *
 * Device discovery/connection landed in part 1, `gatt.connect()`
 * NetworkError retry in part 2; this commit (part 3) adds the real
 * chunked-write `print()` path, reusing `buildTicket`/`chunk` (task 5.2)
 * and `formatReceiptLines` (domain layer, shared with
 * `ShareFallbackPrinter`).
 *
 * Web Bluetooth cannot enumerate "every service" of a device by design
 * (browser privacy) — only services declared up-front in
 * `optionalServices` can be discovered after connecting. The confirmed
 * real service UUID for the WW-POS58U is listed first as an optimization;
 * the rest are common "transparent serial" UUIDs used by generic/clone
 * BLE POS printers, kept as a fallback in case a different unit is used.
 */
const CANDIDATE_SERVICE_UUIDS: string[] = [
  "000018f0-0000-1000-8000-00805f9b34fb", // confirmed on the WW-POS58U (write char 2af1)
  "0000ff00-0000-1000-8000-00805f9b34fb", // generic vendor pattern used by several manufacturers
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10-style serial module (char ffe1)
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // transparent UART (ISSC/Microchip), used by some POS units
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Nordic-like serial service, present on some POS boards
];

// gatt.connect() can fail with a transient NetworkError right after a
// previous disconnect while the BLE stack is still winding down — a known
// Android behavior confirmed in the prototype. Retrying a few times
// avoids surfacing a false failure for something that clears itself. Any
// other error name is not transient and rejects immediately.
const MAX_CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 800;
const WRITE_CHUNK_SIZE = 20; // cheap BLE printers commonly have a ~20-byte effective MTU
const WRITE_CHUNK_DELAY_MS = 20;

export class WebBluetoothPrinter implements ReceiptPrinter {
  protected device: BluetoothDevice | null = null;
  protected writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  async isAvailable(): Promise<boolean> {
    return (
      typeof navigator !== "undefined" &&
      "bluetooth" in navigator &&
      typeof window !== "undefined" &&
      window.isSecureContext
    );
  }

  async connect(): Promise<void> {
    // Already have a live writable characteristic from this tab session —
    // §23.3's "reconecta automáticamente sin mostrar el picker" for the
    // common case of printing more than once without navigating away.
    if (this.writeCharacteristic) {
      return;
    }

    if (!(await this.isAvailable())) {
      throw new Error(
        "Web Bluetooth no está disponible en este navegador o dispositivo.",
      );
    }

    const device =
      this.device ??
      (await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICE_UUIDS,
      }));
    this.device = device;

    if (!device.gatt) {
      throw new Error(
        "El dispositivo seleccionado no expone GATT (no es una impresora BLE compatible).",
      );
    }

    let server: BluetoothRemoteGATTServer | undefined;
    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        server = await device.gatt.connect();
        break;
      } catch (error) {
        const isNetworkError =
          error instanceof DOMException && error.name === "NetworkError";
        if (!isNetworkError || attempt === MAX_CONNECT_ATTEMPTS) {
          throw error;
        }
        await sleep(CONNECT_RETRY_DELAY_MS);
      }
    }
    if (!server) {
      throw new Error("No se pudo conectar con la impresora tras varios intentos.");
    }

    const services = await server.getPrimaryServices();
    if (services.length === 0) {
      throw new Error(
        "La impresora conectó pero no expone ninguno de los servicios BLE esperados.",
      );
    }

    let writable: BluetoothRemoteGATTCharacteristic | null = null;
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const characteristic of characteristics) {
        if (
          characteristic.properties.write ||
          characteristic.properties.writeWithoutResponse
        ) {
          writable = characteristic;
          break;
        }
      }
      if (writable) break;
    }

    if (!writable) {
      throw new Error(
        "La impresora conectó pero ninguna característica soporta escritura.",
      );
    }

    this.writeCharacteristic = writable;
  }

  async print(receipt: ReceiptData): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error("No hay conexión activa con la impresora. Conecta primero.");
    }

    const ticket = buildTicket(formatReceiptLines(receipt));
    await this.writeBytes(ticket);
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.writeCharacteristic = null;
  }

  private async writeBytes(data: Uint8Array): Promise<void> {
    const characteristic = this.writeCharacteristic;
    if (!characteristic) {
      throw new Error("No hay característica de escritura disponible.");
    }

    const canWriteWithoutResponse = characteristic.properties.writeWithoutResponse;
    for (const part of chunk(data, WRITE_CHUNK_SIZE)) {
      if (canWriteWithoutResponse) {
        await characteristic.writeValueWithoutResponse(part as BufferSource);
      } else {
        await characteristic.writeValue(part as BufferSource);
      }
      await sleep(WRITE_CHUNK_DELAY_MS);
    }
  }
}
