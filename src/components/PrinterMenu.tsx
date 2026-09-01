import { useEffect, useState } from "react";
import { Printer, RefreshCw, Unplug, FileText, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { isAutoPrintEnabled, setAutoPrintEnabled } from "@/printing/printSettings";
import type { RentalReceiptData } from "@/domain/rentals/receipt";

export function PrinterMenu() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(webBluetoothPrinter.connectionStatus);
  const [deviceName, setDeviceName] = useState<string | null>(webBluetoothPrinter.deviceName);
  const [isLoading, setIsLoading] = useState(false);
  const [autoPrint, setAutoPrint] = useState(() => isAutoPrintEnabled());

  useEffect(() => {
    webBluetoothPrinter.isAvailable().then(setIsAvailable);
    const unsubscribe = webBluetoothPrinter.subscribe(() => {
      setConnectionStatus(webBluetoothPrinter.connectionStatus);
      setDeviceName(webBluetoothPrinter.deviceName);
    });
    return unsubscribe;
  }, []);

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  if (!isAvailable) {
    return null;
  }

  async function handleConnect() {
    setIsLoading(true);
    try {
      await webBluetoothPrinter.connect();
      toast.success("Impresora conectada correctamente");
    } catch (error) {
      toast.error(
        "No se pudo conectar la impresora: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleToggleAutoPrint() {
    const next = !autoPrint;
    setAutoPrintEnabled(next);
    setAutoPrint(next);
    toast.info(
      next
        ? "Auto-imprimir: activado"
        : "Auto-imprimir: desactivado",
    );
  }

  async function handleDisconnect() {
    await webBluetoothPrinter.disconnect();
    toast.info("Impresora desconectada");
  }

  async function handleTestPrint() {
    setIsLoading(true);
    try {
      const testReceipt: RentalReceiptData = {
        kind: "create",
        businessName: import.meta.env.VITE_BUSINESS_NAME || "Insumos O2",
        businessPhone: import.meta.env.VITE_BUSINESS_PHONE || "55 0000 0000",
        folio: "TEST-001",
        date: new Date(),
        customerName: "Prueba de Impresión",
        customerPhone: "0000000000",
        items: [{ itemType: "concentrator", quantity: 1 }],
        initialRentAmount: 100,
        depositAmount: 0,
        extras: [],
        total: 100,
      };
      await webBluetoothPrinter.print(testReceipt);
      toast.success("Ticket de prueba impreso");
    } catch (error) {
      toast.error(
        "Error al imprimir prueba: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            isConnected
              ? "Impresora lista"
              : isConnecting
                ? "Conectando impresora…"
                : "Impresora desconectada"
          }
          className="relative"
        >
          {isConnecting ? (
            <RefreshCw aria-hidden="true" className="!size-[22px] animate-spin" />
          ) : (
            <Printer aria-hidden="true" className="!size-[22px]" />
          )}
          <span
            className={
              "absolute top-2.5 right-2.5 size-2 rounded-full ring-2 ring-background " +
              (isConnected
                ? "bg-emerald-500"
                : isConnecting
                  ? "bg-amber-500"
                  : "bg-destructive/80")
            }
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className={
                "size-2 rounded-full " +
                (isConnected
                  ? "bg-emerald-500"
                  : isConnecting
                    ? "bg-amber-500"
                    : "bg-destructive")
              }
            />
            <span>
              {isConnected
                ? "Impresora lista"
                : isConnecting
                  ? "Conectando…"
                  : "Impresora no conectada"}
            </span>
          </div>
          {deviceName && (
            <span className="text-muted-foreground text-xs">{deviceName}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={handleToggleAutoPrint}>
          {autoPrint ? (
            <Zap aria-hidden="true" className="mr-2 size-4" />
          ) : (
            <ZapOff aria-hidden="true" className="mr-2 size-4" />
          )}
          Auto-imprimir al guardar: {autoPrint ? "Activado" : "Desactivado"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {!isConnected ? (
          <DropdownMenuItem onSelect={() => void handleConnect()} disabled={isLoading}>
            <RefreshCw aria-hidden="true" className="mr-2 size-4" />
            Conectar impresora
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => void handleTestPrint()} disabled={isLoading}>
              <FileText aria-hidden="true" className="mr-2 size-4" />
              Imprimir prueba
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleDisconnect()} disabled={isLoading}>
              <Unplug aria-hidden="true" className="mr-2 size-4" />
              Desconectar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
