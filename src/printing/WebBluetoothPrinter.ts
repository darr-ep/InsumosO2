import { buildStructuredTicket, chunk, sleep } from "@/printing/escpos";
import { buildImageTicket, getLogoDithered } from "@/printing/imageEscpos";
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
const WRITE_CHUNK_SIZE = 128; // 128-byte chunks for fast BLE throughput on 80mm printers
const WRITE_CHUNK_DELAY_MS = 5; // 5ms delay between chunks instead of 20ms

// getDevices()-sourced devices aren't guaranteed to be "in range" — must
// wait for a real advertisement before gatt.connect(), or it fails with
// NetworkError even when the printer is on (confirmed hardware behavior,
// see test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md §4).
const ADVERTISEMENT_TIMEOUT_MS = 6000;

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export class WebBluetoothPrinter implements ReceiptPrinter {
  protected device: BluetoothDevice | null = null;
  protected writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners: Set<() => void> = new Set();
  private status: ConnectionStatus = "disconnected";
  private autoReconnectStarted = false;

  get isConnected(): boolean {
    return Boolean(this.writeCharacteristic && this.device?.gatt?.connected);
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore subscriber errors
      }
    });
  }

  async isAvailable(): Promise<boolean> {
    return (
      typeof navigator !== "undefined" &&
      "bluetooth" in navigator &&
      typeof window !== "undefined" &&
      window.isSecureContext
    );
  }

  async connect(): Promise<void> {
    // Already have a live writable characteristic from this tab session
    if (this.writeCharacteristic && this.device?.gatt?.connected) {
      return;
    }

    try {
      if (!(await this.isAvailable())) {
        throw new Error(
          "Web Bluetooth no está disponible en este navegador o dispositivo.",
        );
      }

      let device = this.device;
      if (device && device.gatt) {
        try {
          this.setStatus("connecting");
          await this.connectToDevice(device);
          return;
        } catch {
          // If connecting to remembered device fails, fall back to picker
          this.device = null;
        }
      }

      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICE_UUIDS,
      });

      this.setStatus("connecting");
      await this.connectToDevice(device);
    } catch (error) {
      this.setStatus("disconnected");
      throw error;
    }
  }

  /**
   * GATT-connect + service/characteristic discovery, shared by the manual
   * picker path (`connect()`) and the silent one-shot auto-reconnect path
   * (`startAutoReconnect()`). Assumes `device` is already known to be
   * reachable (picker just returned it, or `waitForAdvertisement()` already
   * confirmed an advertisement).
   */
  private async connectToDevice(device: BluetoothDevice): Promise<void> {
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
    this.device?.addEventListener?.("gattserverdisconnected", () => {
      // A drop mid-session (radio out of range, printer powered off, etc.)
      // just goes back to "disconnected" — reconnecting is a manual tap on
      // "Conectar impresora" (PrinterMenu.tsx), not an automatic retry.
      this.writeCharacteristic = null;
      this.setStatus("disconnected");
    });
    this.setStatus("connected");
  }

  private hasGetDevices(): boolean {
    return (
      typeof navigator !== "undefined" &&
      "bluetooth" in navigator &&
      typeof navigator.bluetooth.getDevices === "function"
    );
  }

  // Ported near-verbatim from test-impresora/src/App.tsx's
  // waitForAdvertisement — a device from getDevices() isn't guaranteed to
  // be "in range"; gatt.connect() fails with NetworkError without this.
  private waitForAdvertisement(
    device: BluetoothDevice,
    timeoutMs = ADVERTISEMENT_TIMEOUT_MS,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `No se detectó advertisement BLE de "${device.name ?? device.id}" en ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);

      function onAdvertisement() {
        cleanup();
        resolve();
      }
      function cleanup() {
        clearTimeout(timer);
        controller.abort();
        device.removeEventListener("advertisementreceived", onAdvertisement);
      }

      device.addEventListener("advertisementreceived", onAdvertisement);
      device.watchAdvertisements({ signal: controller.signal }).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * Silent one-shot auto-reconnect (no native picker, ever), meant to run
   * once on app mount. Feature-detects `getDevices()` — experimental, lives
   * behind Chrome flags the business owner manages themselves — and does
   * nothing at all when unavailable, preserving today's manual-only UX.
   * Idempotent: safe to call more than once (e.g. React StrictMode's double
   * effect-invoke). If the single attempt fails, it does NOT retry — the
   * user reconnects manually via "Conectar impresora" (PrinterMenu.tsx).
   */
  startAutoReconnect(): void {
    if (this.autoReconnectStarted) return;
    if (!this.hasGetDevices()) return;
    this.autoReconnectStarted = true;
    void this.runReconnectAttempt();
  }

  private async runReconnectAttempt(): Promise<void> {
    try {
      const known = await navigator.bluetooth.getDevices();
      const device = known[0];
      if (!device) {
        throw new Error("getDevices() no devolvió ningún dispositivo autorizado.");
      }
      this.setStatus("connecting");
      await this.waitForAdvertisement(device);
      await this.connectToDevice(device);
    } catch {
      this.setStatus("disconnected");
    }
  }

  async print(receipt: ReceiptData): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error("No hay conexión activa con la impresora. Conecta primero.");
    }

    let logo = null;
    try {
      logo = await getLogoDithered();
    } catch {
      // Gracefully continue without logo if unavailable
    }

    const ticket = buildStructuredTicket(receipt, logo);
    await this.writeBytes(ticket);
  }

  async printLogo(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error("No hay conexión activa con la impresora. Conecta primero.");
    }

    const logo = await getLogoDithered();
    if (!logo) {
      throw new Error("No se pudo cargar el logo para imprimir.");
    }

    const ticket = buildImageTicket(logo);
    await this.writeBytes(ticket);
  }

  async disconnect(): Promise<void> {
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // ignore gatt disconnect errors
    }
    this.writeCharacteristic = null;
    this.setStatus("disconnected");
  }

  async forgetDevice(): Promise<void> {
    await this.disconnect();
    this.device = null;
    this.notify();
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

/**
 * Shared instance (task 5.4) — `ReceiptDialog` prints potentially more
 * than once per tab session (e.g. a rental receipt now, a devolución
 * receipt later), and reusing the same instance is what makes `connect()`
 * skip the native picker on the second print (§23.3).
 */
export const webBluetoothPrinter = new WebBluetoothPrinter();
