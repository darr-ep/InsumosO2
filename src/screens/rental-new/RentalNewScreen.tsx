import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerPicker } from "@/components/CustomerPicker";
import {
  ItemQuantityPicker,
  emptyItemQuantities,
  itemQuantitiesToList,
  type ItemQuantities,
} from "@/components/ItemQuantityPicker";
import { ExtrasList } from "@/components/ExtrasList";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import type { CustomerRecord } from "@/data/customers.repo";
import { createRental, RentalPartiallyCreatedError } from "@/data/rentals.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import { rentalFormSchema, type RentalExtraFormValues } from "@/domain/rentals/rental";
import { buildRentalReceipt, type RentalReceiptData } from "@/domain/rentals/receipt";

/**
 * SDD.md §7.1 (flujo Nueva renta) + §16.7 (orden de campos, pantalla
 * única sin wizard) + §18 (confirmar → modal Comprobante → Dashboard) +
 * CU4. `folio`/`status` are never part of this screen's state — the
 * server (task 1.1/1.2) is the only source of truth for those. §16.6:
 * "Ficha de cliente — abierta desde... el buscador de cliente en Nueva
 * renta" — wired here (task 3.5) via `CustomerPicker`'s `onViewCustomer`.
 */

export function RentalNewScreen() {
  const navigate = useNavigate();

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerRecord | null>(null);
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [itemQuantities, setItemQuantities] =
    useState<ItemQuantities>(emptyItemQuantities);
  const [initialRentAmount, setInitialRentAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [extras, setExtras] = useState<RentalExtraFormValues[]>([]);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<RentalReceiptData | null>(null);

  function resetForm() {
    setSelectedCustomer(null);
    setItemQuantities(emptyItemQuantities);
    setInitialRentAmount("");
    setDepositAmount("");
    setExtras([]);
  }

  async function handleConfirm() {
    setFormError(null);

    const parsed = rentalFormSchema.safeParse({
      customer_id: selectedCustomer?.id ?? "",
      items: itemQuantitiesToList(itemQuantities).map((item) => ({
        item_type: item.itemType,
        quantity: item.quantity,
      })),
      initial_rent_amount: Number(initialRentAmount || 0),
      deposit_amount: Number(depositAmount || 0),
      extras,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisa los datos de la renta.");
      return;
    }

    setIsSubmitting(true);

    try {
      const items = parsed.data.items.map((item) => ({
        itemType: item.item_type,
        quantity: item.quantity,
      }));

      const result = await createRental({
        customerId: parsed.data.customer_id,
        items,
        initialRentAmount: parsed.data.initial_rent_amount,
        depositAmount: parsed.data.deposit_amount,
        extras: parsed.data.extras,
      });

      setReceipt(
        buildRentalReceipt({
          businessName: import.meta.env.VITE_BUSINESS_NAME,
          businessPhone: import.meta.env.VITE_BUSINESS_PHONE,
          folio: result.rental.folio,
          date: new Date(result.rental.created),
          customerName: selectedCustomer?.name ?? "",
          customerPhone: selectedCustomer?.phone ?? "",
          items,
          initialRentAmount: parsed.data.initial_rent_amount,
          depositAmount: parsed.data.deposit_amount,
          extras: parsed.data.extras,
        }),
      );
      setReceiptOpen(true);
      resetForm();
    } catch (error) {
      // Gap-fill (Deposit Payment Creation Failure): `createRental` wraps a
      // rental_items/payment step failure in `RentalPartiallyCreatedError`
      // when the rental record itself DID save — check its `.cause` for a
      // stale session (the original write may have failed mid-sequence
      // because the session went stale between steps, not because of the
      // race this gap-fill actually fixes) before falling through to the
      // §14 stale-session check on the raw error below.
      const isPartialFailure = error instanceof RentalPartiallyCreatedError;
      // §14 gap-fill: a rotated/expired session (still locally "valid" per
      // `pb.authStore.isValid`) surfaces here as this exact generic
      // save-error — redirect to `/login` instead.
      if (handleIfStaleSession(isPartialFailure ? error.cause : error)) {
        return;
      }
      if (isPartialFailure) {
        // Same principle as `src/data/staleSession.ts`: never lump a known,
        // distinct failure class into the generic message. The rental
        // record already exists (server-confirmed) — saying "no se pudo
        // guardar la renta" here would be false. Show the real folio so the
        // renta can be found and finished manually instead.
        setFormError(
          `La renta ${error.rental.folio} ya se guardó, pero hubo un problema al registrar sus productos o el depósito. Anota el folio y revísala antes de reintentar.`,
        );
        return;
      }
      // §21: never show "saved" when the write failed — keep the form
      // exactly as the user left it so they can retry without recapturing
      // everything.
      setFormError(
        "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <h1 className="text-lg font-semibold">Nueva renta</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Cliente
        </h2>
        <CustomerPicker
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onViewCustomer={() => setCustomerDetailOpen(true)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Qué se renta
        </h2>
        <ItemQuantityPicker
          value={itemQuantities}
          onChange={setItemQuantities}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="rental-initial-amount">Renta</Label>
        <Input
          id="rental-initial-amount"
          type="number"
          min={0}
          inputMode="decimal"
          value={initialRentAmount}
          onChange={(event) => setInitialRentAmount(event.target.value)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="rental-deposit-amount">Depósito</Label>
        <Input
          id="rental-deposit-amount"
          type="number"
          min={0}
          inputMode="decimal"
          value={depositAmount}
          onChange={(event) => setDepositAmount(event.target.value)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Otros
        </h2>
        <ExtrasList value={extras} onChange={setExtras} />
      </section>

      {formError && <p className="text-destructive text-sm">{formError}</p>}

      <Button type="button" size="lg" disabled={isSubmitting} onClick={() => void handleConfirm()}>
        {isSubmitting ? "Guardando…" : "Confirmar renta"}
      </Button>

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={(open) => {
          setReceiptOpen(open);
          if (!open) {
            navigate("/dashboard");
          }
        }}
        receipt={receipt}
      />

      <CustomerDetailSheet
        open={customerDetailOpen}
        onOpenChange={setCustomerDetailOpen}
        customerId={selectedCustomer?.id ?? null}
      />
    </div>
  );
}
