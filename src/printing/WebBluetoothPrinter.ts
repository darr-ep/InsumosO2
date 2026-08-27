import type { ReceiptData } from "@/domain/rentals/receipt";
import type { ReceiptPrinter } from "@/printing/ReceiptPrinter";

/**
 * SDD.md §23.1/§23.3/§23.4 (task 5.3) — adapter for the WW-POS58U
 * thermal printer, porting the `doSearch`/`doConnect` pattern validated
 * against real hardware in the `test-impresora` prototype (see
 * `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md`).
 *
 * This commit lands device discovery/connection (`isAvailable`,
 * `connect`, `disconnect`) with a single connection attempt. Retrying a
 * transient `NetworkError` on `gatt.connect()` (a known Android behavior
 * confirmed in the prototype) lands in the next commit (task 5.3 part 2)
 * to keep this change reviewable; `print()`'s real chunked-write logic
 * lands in a further commit (task 5.3 part 3).
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

    const server = await device.gatt.connect();

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
    // Real chunked-write logic lands in the next commit (task 5.3 part 2);
    // `receipt` stays part of the `ReceiptPrinter` contract shape.
    void receipt;
    if (!this.writeCharacteristic) {
      throw new Error("No hay conexión activa con la impresora. Conecta primero.");
    }

    throw new Error(
      "WebBluetoothPrinter.print no está implementado todavía (task 5.3 part 2).",
    );
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.writeCharacteristic = null;
  }
}
