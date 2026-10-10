import { useEffect, useState } from "react";
import {
  isShareAvailable,
  shareReceipt,
} from "@/printing/ShareFallbackPrinter";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { ReceiptData } from "@/domain/rentals/receipt";

/**
 * Extracted out of `ReceiptDialog` (Redesign Round 3) so the short
 * post-creation confirmation and the full `ReceiptDialog` share the exact
 * same Bluetooth-first print + share orchestration instead of duplicating
 * it. Behavior is byte-identical to what `ReceiptDialog` had inline before
 * this extraction — same effect, same handlers, same statuses.
 */

export type ShareStatus = "idle" | "shared" | "error";
export type PrintStatus = "idle" | "printing" | "printed" | "failed";

export interface UseReceiptActionsResult {
  shareStatus: ShareStatus;
  printAvailable: boolean;
  printStatus: PrintStatus;
  shareAvailable: boolean;
  handleShare: () => Promise<void>;
  handlePrint: () => Promise<void>;
  reset: () => void;
}

export function useReceiptActions(
  receipt: ReceiptData | null,
  open: boolean,
  autoPrint = true,
): UseReceiptActionsResult {
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [printAvailable, setPrintAvailable] = useState(false);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");

  useEffect(() => {
    if (!open || !receipt) {
      return;
    }

    let cancelled = false;
    webBluetoothPrinter.isAvailable().then(async (available) => {
      if (cancelled) return;
      setPrintAvailable(available);

      if (
        available &&
        autoPrint &&
        receipt.kind === "create" &&
        webBluetoothPrinter.deviceName
      ) {
        setPrintStatus("printing");
        try {
          await webBluetoothPrinter.connect();
          await webBluetoothPrinter.print(receipt);
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (!cancelled) setPrintStatus("printed");
        } catch {
          if (!cancelled) setPrintStatus("idle");
        } finally {
          try {
            await webBluetoothPrinter.disconnect();
          } catch {
            // ignore disconnect error
          }
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, receipt, autoPrint]);

  async function handleShare() {
    if (!receipt) {
      return;
    }

    const result = await shareReceipt(receipt);

    if (result === "shared") {
      setShareStatus("shared");
    } else if (result === "failed") {
      setShareStatus("error");
    }
  }

  async function handlePrint() {
    if (!receipt) {
      return;
    }

    setPrintStatus("printing");
    try {
      await webBluetoothPrinter.connect();
      await webBluetoothPrinter.print(receipt);
      // Wait briefly for the printer hardware buffer to finish receiving data before closing the link
      await new Promise((resolve) => setTimeout(resolve, 400));
      setPrintStatus("printed");
    } catch {
      setPrintStatus("failed");
    } finally {
      // Always disconnect so the printer is immediately available for other devices
      try {
        await webBluetoothPrinter.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }

  function reset() {
    setShareStatus("idle");
    setPrintStatus("idle");
  }

  return {
    shareStatus,
    printAvailable,
    printStatus,
    shareAvailable: isShareAvailable(),
    handleShare,
    handlePrint,
    reset,
  };
}
