import { useEffect, useState } from "react";
import { Printer, RefreshCw, Unplug, FileText, Image } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { LoadingDialog } from "@/components/LoadingDialog";

export function PrinterMenu() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(webBluetoothPrinter.connectionStatus);
  const [deviceName, setDeviceName] = useState<string | null>(webBluetoothPrinter.deviceName);
  // "Carga · Conectando impresora" (pencil ground truth) only applies to the
  // Connect action, never to "Imprimir prueba" or "Imprimir logo" — tracking
  // which action is in flight keeps `isLoading`'s existing disable-the-menu-items
  // behavior, while only gating the loading popup on Connect.
  const [activeAction, setActiveAction] = useState<
    "connect" | "test-print" | "logo-print" | null
  >(null);
  const isLoading = activeAction !== null;
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
    setActiveAction("connect");
    try {
      await webBluetoothPrinter.connect();
      toast.success("Impresora vinculada correctamente");
      await webBluetoothPrinter.disconnect();
    } catch (error) {
      toast.error(
        "No se pudo vincular la impresora: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setActiveAction(null);
    }
  }

  function handleToggleAutoPrint(event: Event) {
    event.preventDefault();
    const next = !autoPrint;
    setAutoPrintEnabled(next);
    setAutoPrint(next);
    toast.info(
      next
        ? "Auto-imprimir: activado"
        : "Auto-imprimir: desactivado",
    );
  }

  async function handleForget() {
    await webBluetoothPrinter.forgetDevice();
    toast.info("Impresora desvinculada de este teléfono");
  }

  async function handleTestPrint() {
    setActiveAction("test-print");
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
        total: 100,
      };
      await webBluetoothPrinter.connect();
      await webBluetoothPrinter.print(testReceipt);
      await new Promise((r) => setTimeout(r, 400));
      await webBluetoothPrinter.disconnect();
      toast.success("Ticket de prueba impreso");
    } catch (error) {
      toast.error(
        "Error al imprimir prueba: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleLogoPrint() {
    setActiveAction("logo-print");
    try {
      await webBluetoothPrinter.connect();
      await webBluetoothPrinter.printLogo();
      await new Promise((r) => setTimeout(r, 400));
      await webBluetoothPrinter.disconnect();
      toast.success("Logo impreso");
    } catch (error) {
      toast.error(
        "Error al imprimir logo: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setActiveAction(null);
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
          className="relative rounded-full"
        >
          {isConnecting ? (
            <RefreshCw aria-hidden="true" className="!size-[24px] animate-spin" />
          ) : (
            <Printer aria-hidden="true" className="!size-[24px]" />
          )}
          {deviceName && !isConnecting && (
            <span
              className="absolute top-2.5 right-2.5 size-2 rounded-full ring-2 ring-background bg-emerald-500"
              aria-hidden="true"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className={cn(
                "size-2 rounded-full",
                deviceName ? "bg-emerald-500" : "bg-muted-foreground/50",
              )}
            />
            <span>
              {deviceName
                ? "Impresora vinculada"
                : "Sin impresora vinculada"}
            </span>
          </div>
          {deviceName ? (
            <span className="text-muted-foreground text-xs">{deviceName} (conexión al imprimir)</span>
          ) : (
            <span className="text-muted-foreground text-xs">Se conectará automáticamente al imprimir</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={handleToggleAutoPrint}
          className="flex items-center justify-between gap-2"
        >
          <span>Auto-imprimir al guardar</span>
          <span
            role="switch"
            aria-checked={autoPrint}
            aria-label="Auto-imprimir"
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              autoPrint ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform",
                autoPrint && "translate-x-5",
              )}
            />
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => void handleTestPrint()} disabled={isLoading}>
          <FileText aria-hidden="true" className="mr-2 size-4" />
          Imprimir prueba
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleLogoPrint()} disabled={isLoading}>
          <Image aria-hidden="true" className="mr-2 size-4" />
          Impresión de logo
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {!deviceName ? (
          <DropdownMenuItem onSelect={() => void handleConnect()} disabled={isLoading}>
            <RefreshCw aria-hidden="true" className="mr-2 size-4" />
            Vincular impresora
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void handleForget()} disabled={isLoading} className="text-destructive focus:text-destructive">
            <Unplug aria-hidden="true" className="mr-2 size-4" />
            Desvincular impresora
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>

      <LoadingDialog
        open={activeAction === "connect"}
        title="Vinculando impresora..."
        description="Buscamos tu impresora para guardarla en este dispositivo."
      />
    </DropdownMenu>
  );
}
