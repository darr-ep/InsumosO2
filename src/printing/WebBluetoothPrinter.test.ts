import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { RentalReceiptData } from "@/domain/rentals/receipt";

/**
 * SDD.md §23.1/§23.3/§23.4 (task 5.3, part 1 — device discovery and
 * connection only). Mocks the Web Bluetooth API surface the way
 * `test-impresora`'s own findings describe it (see
 * `test-impresora/HANDOFF-IMPRESION-BLUETOOTH.md` §3/§4). NetworkError
 * retry resilience and the chunked write path land in later commits.
 * Real hardware verification is task 5.5, explicitly out of scope for
 * this run.
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

function makeDevice(options: {
  services?: ReturnType<typeof makeService>[];
  connectImpl?: () => Promise<unknown>;
}) {
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

  const device = {
    name: "WW-POS58U",
    id: "device-1",
    gatt: { connect, get connected() { return server.connected; } },
  };
  return { device, server };
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

describe("WebBluetoothPrinter.print (§22/§23.1 — connection-state contract only; real write logic lands in task 5.3 part 2)", () => {
  it("throws when not connected", async () => {
    const printer = new WebBluetoothPrinter();

    await expect(printer.print(receipt)).rejects.toThrow();
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
