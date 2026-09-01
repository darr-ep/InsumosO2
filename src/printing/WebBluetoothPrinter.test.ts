import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { RentalReceiptData } from "@/domain/rentals/receipt";

/**
 * SDD.md §23.1/§23.3/§23.4 (task 5.3, complete). Mocks the Web Bluetooth
 * API surface the way `test-impresora`'s own findings describe it (see
 * `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md` §3/§4): `gatt.connect()`
 * can transiently fail with `NetworkError` and must be retried; writes
 * must be chunked with a short pause between each one. Real hardware
 * verification is task 5.5, explicitly out of scope for this run.
 */

const receipt: RentalReceiptData = {
  kind: "create",
  businessName: "Insumos O2",
  businessPhone: "771 131 3535",
  folio: "R-000001",
  date: new Date("2026-08-26T10:00:00Z"),
  customerName: "Juan Pérez",
  customerPhone: "5512345678",
  items: [{ itemType: "concentrator", quantity: 1 }],
  initialRentAmount: 2800,
  depositAmount: 1000,
  extras: [],
  total: 3800,
};

function makeCharacteristic(props: Partial<BluetoothCharacteristicProperties>) {
  return {
    properties: {
      broadcast: false,
      read: false,
      writeWithoutResponse: false,
      write: false,
      notify: false,
      indicate: false,
      authenticatedSignedWrites: false,
      reliableWrite: false,
      writableAuxiliaries: false,
      ...props,
    },
    writeValue: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(characteristics: ReturnType<typeof makeCharacteristic>[]) {
  return {
    uuid: "000018f0-0000-1000-8000-00805f9b34fb",
    getCharacteristics: vi.fn().mockResolvedValue(characteristics),
  };
}

function makeDevice(
  options: {
    services?: ReturnType<typeof makeService>[];
    connectImpl?: () => Promise<unknown>;
    /**
     * Whether `watchAdvertisements()` fires an `"advertisementreceived"`
     * event (synchronously, matching real hardware: the listener is
     * always registered before `watchAdvertisements()` is called — see
     * `waitForAdvertisement`). Default true. Set false to simulate a
     * device that never advertises, so `waitForAdvertisement`'s timeout
     * is what rejects.
     */
    advertises?: boolean;
  } = {},
) {
  const services = options.services ?? [];
  const server = {
    connected: false,
    getPrimaryServices: vi.fn().mockResolvedValue(services),
  };
  const connect =
    options.connectImpl ??
    vi.fn().mockImplementation(async () => {
      server.connected = true;
      return server;
    });

  // Minimal EventTarget-like mock — enough for waitForAdvertisement's
  // addEventListener/removeEventListener("advertisementreceived", ...)
  // and connectToDevice's addEventListener("gattserverdisconnected", ...).
  const listeners = new Map<string, Set<() => void>>();
  const addEventListener = vi.fn((type: string, listener: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  });
  const removeEventListener = vi.fn((type: string, listener: () => void) => {
    listeners.get(type)?.delete(listener);
  });
  const dispatch = (type: string) => {
    listeners.get(type)?.forEach((listener) => listener());
  };

  const advertises = options.advertises ?? true;
  const watchAdvertisements = vi.fn().mockImplementation(async () => {
    if (advertises) {
      dispatch("advertisementreceived");
    }
    // else: never fires — waitForAdvertisement's own timeout rejects.
  });

  const device = {
    name: "WW-POS58U",
    id: "device-1",
    gatt: { connect, get connected() { return server.connected; } },
    addEventListener,
    removeEventListener,
    watchAdvertisements,
  };
  return { device, server, dispatch };
}

describe("WebBluetoothPrinter.isAvailable (§23.2 — graceful degradation)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves true when navigator.bluetooth exists and the context is secure", async () => {
    vi.stubGlobal("navigator", { bluetooth: {} });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    expect(await printer.isAvailable()).toBe(true);
  });

  it("resolves false (never throws) when navigator.bluetooth doesn't exist — e.g. iOS Safari (triangulation)", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    expect(await printer.isAvailable()).toBe(false);
  });

  it("resolves false when the context isn't secure, even if navigator.bluetooth exists (triangulation)", async () => {
    vi.stubGlobal("navigator", { bluetooth: {} });
    vi.stubGlobal("window", { isSecureContext: false });
    const printer = new WebBluetoothPrinter();

    expect(await printer.isAvailable()).toBe(false);
  });
});

describe("WebBluetoothPrinter.connect (§23.1/§23.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws without prompting when Web Bluetooth isn't available", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await expect(printer.connect()).rejects.toThrow(/Bluetooth/i);
  });

  it("requests a device, connects GATT and finds a writable characteristic", async () => {
    const writable = makeCharacteristic({ writeWithoutResponse: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    const requestDevice = vi.fn().mockResolvedValue(device);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
    vi.stubGlobal("window", { isSecureContext: true });

    const printer = new WebBluetoothPrinter();
    await printer.connect();

    expect(requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptAllDevices: true,
        optionalServices: expect.arrayContaining([
          "000018f0-0000-1000-8000-00805f9b34fb",
        ]),
      }),
    );
  });

  it("throws when GATT connects but exposes zero services", async () => {
    const { device } = makeDevice({ services: [] });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await expect(printer.connect()).rejects.toThrow();
  });

  it("throws when services exist but none support write (triangulation)", async () => {
    const readOnly = makeCharacteristic({ read: true });
    const { device } = makeDevice({ services: [makeService([readOnly])] });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await expect(printer.connect()).rejects.toThrow();
  });

  it("retries gatt.connect() on a transient NetworkError and succeeds", async () => {
    const writable = makeCharacteristic({ write: true });
    let attempts = 0;
    const { device } = makeDevice({
      services: [makeService([writable])],
      connectImpl: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new DOMException("busy", "NetworkError");
        }
        return { getPrimaryServices: vi.fn().mockResolvedValue([makeService([writable])]) };
      },
    });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    const connectPromise = printer.connect();
    await vi.runAllTimersAsync();
    await connectPromise;

    expect(attempts).toBe(2);
  });

  it("throws after exhausting retries on a persistent NetworkError (triangulation)", async () => {
    const { device } = makeDevice({
      connectImpl: async () => {
        throw new DOMException("gone", "NetworkError");
      },
    });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    const connectPromise = printer.connect();
    const assertion = expect(connectPromise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("rejects immediately for a non-NetworkError gatt.connect() failure, without retrying (triangulation)", async () => {
    const { device } = makeDevice({
      connectImpl: async () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await expect(printer.connect()).rejects.toThrow(/blocked/);
  });

  it("does not prompt again when already connected in this session", async () => {
    const writable = makeCharacteristic({ write: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    const requestDevice = vi.fn().mockResolvedValue(device);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await printer.connect();
    await printer.connect();

    expect(requestDevice).toHaveBeenCalledTimes(1);
  });
});

describe("WebBluetoothPrinter.print (§22/§23.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws when not connected", async () => {
    const printer = new WebBluetoothPrinter();

    await expect(printer.print(receipt)).rejects.toThrow();
  });

  it("writes the receipt ticket in chunks via writeValueWithoutResponse when supported", async () => {
    const writable = makeCharacteristic({ writeWithoutResponse: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();
    await printer.connect();

    const printPromise = printer.print(receipt);
    await vi.runAllTimersAsync();
    await printPromise;

    expect(writable.writeValueWithoutResponse).toHaveBeenCalled();
    expect(writable.writeValue).not.toHaveBeenCalled();
    // Reassemble every chunk sent and confirm it's a real ESC/POS ticket
    // for THIS receipt's folio — proves the write path actually carries
    // the formatted receipt content, not an empty/placeholder buffer.
    const chunks = writable.writeValueWithoutResponse.mock.calls.map(
      (call) => call[0] as Uint8Array,
    );
    const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
    const sent = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
      sent.set(c, offset);
      offset += c.length;
    }
    const text = new TextDecoder("latin1").decode(sent);
    expect(text).toContain("Folio: R-000001");
    expect(text).toContain("Juan");
  });

  it("falls back to writeValue when writeWithoutResponse isn't supported (triangulation)", async () => {
    const writable = makeCharacteristic({ write: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();
    await printer.connect();

    const printPromise = printer.print(receipt);
    await vi.runAllTimersAsync();
    await printPromise;

    expect(writable.writeValue).toHaveBeenCalled();
    expect(writable.writeValueWithoutResponse).not.toHaveBeenCalled();
  });
});

describe("WebBluetoothPrinter.disconnect (§23.4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is safe to call when never connected", async () => {
    const printer = new WebBluetoothPrinter();

    await expect(printer.disconnect()).resolves.toBeUndefined();
  });

  it("clears the connection so a later print() requires connecting again", async () => {
    const writable = makeCharacteristic({ write: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    const disconnect = vi.fn();
    (device.gatt as unknown as { disconnect: () => void }).disconnect = disconnect;
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
    });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();
    await printer.connect();

    await printer.disconnect();

    expect(disconnect).toHaveBeenCalled();
    await expect(printer.print(receipt)).rejects.toThrow();
  });
});

/**
 * Task: auto-reconnect via getDevices() + waitForAdvertisement (ported from
 * test-impresora/src/App.tsx, see HANDOFF-IMPRESION-BLUETOOTH.md §4).
 * navigator.bluetooth.requestDevice() (the native picker) always requires a
 * real user gesture and can never be triggered automatically — these tests
 * verify the silent path (getDevices()-only) and that the picker is never
 * invoked from it.
 */
describe("WebBluetoothPrinter.startAutoReconnect (feature detection + single silent attempt, no retry loop)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is a total no-op when navigator.bluetooth.getDevices doesn't exist", async () => {
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn() } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    expect(() => printer.startAutoReconnect()).not.toThrow();
    // Give any (incorrectly scheduled) async work a chance to run.
    await vi.advanceTimersByTimeAsync(0);

    expect(printer.connectionStatus).toBe("disconnected");
  });

  it("connects silently via getDevices() + waitForAdvertisement, without the native picker", async () => {
    const writable = makeCharacteristic({ writeWithoutResponse: true });
    const { device } = makeDevice({ services: [makeService([writable])] });
    const requestDevice = vi.fn().mockResolvedValue(device);
    const getDevices = vi.fn().mockResolvedValue([device]);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice, getDevices } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();
    const statuses: string[] = [];
    printer.subscribe(() => statuses.push(printer.connectionStatus));

    printer.startAutoReconnect();
    await vi.advanceTimersByTimeAsync(0);

    expect(statuses).toContain("connecting");
    expect(printer.connectionStatus).toBe("connected");
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("does not retry after the single silent attempt fails — no background search loop", async () => {
    const getDevices = vi.fn().mockResolvedValue([]); // never finds a device
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    printer.startAutoReconnect();
    await vi.advanceTimersByTimeAsync(0); // the one silent attempt
    expect(getDevices).toHaveBeenCalledTimes(1);
    expect(printer.connectionStatus).toBe("disconnected");

    // Well past every delay the old backoff schedule used (2s/5s/10s/30s) —
    // must never fire a second attempt on its own.
    await vi.advanceTimersByTimeAsync(60000);
    expect(getDevices).toHaveBeenCalledTimes(1);
    expect(printer.connectionStatus).toBe("disconnected");
  });

  it("a live gattserverdisconnected just goes to disconnected, without scheduling a retry", async () => {
    const writable = makeCharacteristic({ write: true });
    const { device, dispatch } = makeDevice({ services: [makeService([writable])] });
    const requestDevice = vi.fn().mockResolvedValue(device);
    const getDevices = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice, getDevices } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await printer.connect();
    expect(printer.connectionStatus).toBe("connected");

    dispatch("gattserverdisconnected");
    expect(printer.connectionStatus).toBe("disconnected");

    await vi.advanceTimersByTimeAsync(60000);
    expect(getDevices).not.toHaveBeenCalled(); // reconnecting is manual only now
  });

  it("a failed manual connect() attempt does not resume any background retry", async () => {
    const getDevices = vi.fn().mockResolvedValue([]);
    const requestDevice = vi.fn().mockRejectedValue(new DOMException("cancelled", "NotFoundError"));
    vi.stubGlobal("navigator", { bluetooth: { requestDevice, getDevices } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    await expect(printer.connect()).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(60000);
    expect(getDevices).not.toHaveBeenCalled();
  });

  it("calling startAutoReconnect() twice only runs the silent attempt once", async () => {
    const getDevices = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices } });
    vi.stubGlobal("window", { isSecureContext: true });
    const printer = new WebBluetoothPrinter();

    printer.startAutoReconnect();
    printer.startAutoReconnect(); // e.g. React StrictMode's double effect-invoke

    await vi.advanceTimersByTimeAsync(0);
    expect(getDevices).toHaveBeenCalledTimes(1);
  });
});
