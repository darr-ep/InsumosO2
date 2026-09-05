import { useState } from "react";
import { useNavigate } from "react-router";
import { ClientResponseError } from "pocketbase";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { useDataCache } from "@/app/DataCacheContext";
import { CustomerPicker } from "@/components/CustomerPicker";
import {
  ItemQuantityPicker,
  emptyItemQuantities,
  itemQuantitiesToList,
  type ItemQuantities,
} from "@/components/ItemQuantityPicker";
import { RentalCreatedSummary } from "@/components/RentalCreatedSummary";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import { type CustomerFormSubmitValues } from "@/components/CustomerForm";
import { createCustomer, type CustomerRecord } from "@/data/customers.repo";
import { createRental, RentalPartiallyCreatedError } from "@/data/rentals.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import { customerFormSchema } from "@/domain/customers/customer";
import { rentalFormSchema } from "@/domain/rentals/rental";
import {
  buildRentalReceipt,
  type RentalReceiptData,
} from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.1 (flujo Nueva renta) + §16.7 (orden de campos, pantalla
 * única sin wizard) + §18 (confirmar → modal Comprobante → Dashboard) +
 * CU4. `folio`/`status` are never part of this screen's state — the
 * server (task 1.1/1.2) is the only source of truth for those. §16.6:
 * "Ficha de cliente — abierta desde... el buscador de cliente en Nueva
 * renta" — wired here (task 3.5) via `CustomerPicker`'s `onViewCustomer`.
 *
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief,
 * verbatim): "En pantallas secundarias: flecha ← + título en el navbar."
 * Replaced the inline `<h1>Nueva renta</h1>` with `AppHeader`'s secondary
 * variant (`showBack`).
 */

export function RentalNewScreen() {
  const navigate = useNavigate();
  const { refreshRentals } = useDataCache();

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerRecord | null>(null);
  const [pendingNewCustomer, setPendingNewCustomer] =
    useState<CustomerFormSubmitValues | null>(null);
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [itemQuantities, setItemQuantities] =
    useState<ItemQuantities>(emptyItemQuantities);
  const [initialRentAmount, setInitialRentAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [customerInvalid, setCustomerInvalid] = useState(false);
  const [itemsInvalid, setItemsInvalid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [receipt, setReceipt] = useState<RentalReceiptData | null>(null);

  function resetForm() {
    setSelectedCustomer(null);
    setPendingNewCustomer(null);
    setItemQuantities(emptyItemQuantities);
    setInitialRentAmount("");
    setDepositAmount("");
  }

  async function handleConfirm() {
    setFormError(null);
    setCustomerInvalid(false);
    setItemsInvalid(false);

    if (!selectedCustomer && !pendingNewCustomer) {
      setCustomerInvalid(true);
      return;
    }

    setIsSubmitting(true);

    // Resolve a real, saved customer before validating/creating the rental.
    // A "Cliente nuevo" draft is only ever persisted here, at confirm time —
    // never earlier. On success the draft is immediately promoted to
    // `selectedCustomer` (even if the rental step below then fails) so a
    // retry never creates a duplicate customer record.
    let customer: CustomerRecord;
    if (selectedCustomer) {
      customer = selectedCustomer;
    } else {
      const draft = pendingNewCustomer;
      if (!draft) {
        // Unreachable given the guard above, but keeps this branch type-safe.
        setIsSubmitting(false);
        setCustomerInvalid(true);
        return;
      }
      // `draft` is live-reported by `CustomerForm`'s `liveReport` mode (see
      // `CustomerPicker.tsx`) — it can be incomplete (e.g. empty name/phone,
      // reported the instant "Cliente nuevo" is opened, before typing
      // anything) since there's no submit button gating it anymore. Validate
      // here, before ever calling `createCustomer`.
      const parsedCustomer = customerFormSchema.safeParse({
        name: draft.name,
        phone: draft.phone,
      });
      if (!parsedCustomer.success) {
        setIsSubmitting(false);
        setFormError(
          parsedCustomer.error.issues[0]?.message ??
            "Revisa el nombre y teléfono del cliente.",
        );
        return;
      }
      try {
        customer = await createCustomer(draft);
        setSelectedCustomer(customer);
        setPendingNewCustomer(null);
      } catch (error) {
        setIsSubmitting(false);
        if (handleIfStaleSession(error)) {
          return;
        }
        setFormError("No se pudo guardar el cliente. Intenta de nuevo.");
        return;
      }
    }

    const parsed = rentalFormSchema.safeParse({
      customer_id: customer.id,
      items: itemQuantitiesToList(itemQuantities).map((item) => ({
        item_type: item.itemType,
        quantity: item.quantity,
      })),
      initial_rent_amount: Number(initialRentAmount || 0),
      deposit_amount: Number(depositAmount || 0),
    });

    if (!parsed.success) {
      setIsSubmitting(false);

      let otherIssueMessage: string | null = null;
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "customer_id") {
          setCustomerInvalid(true);
        } else if (issue.path[0] === "items") {
          setItemsInvalid(true);
        } else if (!otherIssueMessage) {
          otherIssueMessage = issue.message;
        }
      }
      setFormError(otherIssueMessage);
      return;
    }

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
      });

      setReceipt(
        buildRentalReceipt({
          businessName: import.meta.env.VITE_BUSINESS_NAME,
          businessPhone: import.meta.env.VITE_BUSINESS_PHONE,
          folio: result.rental.folio,
          date: new Date(result.rental.created),
          customerName: customer.name,
          customerPhone: customer.phone,
          items,
          initialRentAmount: parsed.data.initial_rent_amount,
          depositAmount: parsed.data.deposit_amount,
        }),
      );
      setSummaryOpen(true);
      resetForm();
      void refreshRentals();
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
      // everything. `status !== 0` means the server actually answered (a
      // real rejection, not a network-reachability failure) — show its own
      // message instead of blaming "tu conexión" for something else, same
      // narrowing style as `staleSession.ts#isStaleSessionError`.
      if (error instanceof ClientResponseError && error.status !== 0) {
        // Prefer the server's field-level detail (e.g. "Cannot be blank.")
        // over the generic top-level message (e.g. "Failed to create
        // record.") when PocketBase provides one — same class of gap that
        // hid the initial_rent_amount=0 rejection above until this was
        // reproduced directly against a live instance.
        const fieldErrors = error.response?.data as
          | Record<string, { message?: string }>
          | undefined;
        const firstFieldMessage = fieldErrors
          ? Object.values(fieldErrors)[0]?.message
          : undefined;
        setFormError(
          `No se pudo guardar la renta: ${firstFieldMessage ?? error.message}`,
        );
      } else {
        setFormError(
          "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Redesign — UX/UI pass: "Total a cobrar" (business-owner request, same
  // principle as ReturnDialog's "Total a entregar") — Renta + Depósito,
  // live. No fixed/autofilled prices (rejected — prices genuinely vary) —
  // this only sums whatever the user already typed.
  const totalACobrar =
    Number(initialRentAmount || 0) + Number(depositAmount || 0);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
      <AppHeader title="Nueva renta" showBack />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Cliente<span className="text-destructive" aria-hidden="true"> *</span>
            </h2>
            <CustomerPicker
              selectedCustomer={selectedCustomer}
              onSelect={(customer) => {
                setPendingNewCustomer(null);
                setSelectedCustomer(customer);
                setCustomerInvalid(false);
              }}
              pendingNewCustomer={pendingNewCustomer}
              onSelectDraft={(draft) => {
                setSelectedCustomer(null);
                setPendingNewCustomer(draft);
                setCustomerInvalid(false);
              }}
              onViewCustomer={() => setCustomerDetailOpen(true)}
              invalid={customerInvalid}
              onSearchBlur={() => setCustomerInvalid(true)}
            />
            {customerInvalid && (
              <p className="text-destructive text-sm">
                Selecciona o crea un cliente.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Qué se renta<span className="text-destructive" aria-hidden="true"> *</span>
            </h2>
            <ItemQuantityPicker
              value={itemQuantities}
              onChange={(next) => {
                setItemQuantities(next);
                if (itemQuantitiesToList(next).length > 0) {
                  setItemsInvalid(false);
                }
              }}
              invalid={itemsInvalid}
            />
            {itemsInvalid && (
              <p className="text-destructive text-sm">
                Selecciona al menos un producto.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <Label htmlFor="rental-initial-amount">Renta</Label>
            <CurrencyInput
              id="rental-initial-amount"
              value={initialRentAmount}
              onChange={setInitialRentAmount}
            />
          </section>

          <section className="flex flex-col gap-2">
            <Label htmlFor="rental-deposit-amount">Depósito</Label>
            <CurrencyInput
              id="rental-deposit-amount"
              value={depositAmount}
              onChange={setDepositAmount}
            />
          </section>

        </div>

        {/* Business-owner request: the total belongs in the same fixed
            container as the confirm button (always visible together while
            scrolling the form), not as the last item of the scrollable
            content — matches ReturnDialog's "Total a entregar" placement
            right above its confirm button. This bar now shows real content
            (not just a floating button), so it gets an opaque background
            and a top border instead of the transparent/pointer-events-none
            treatment used where the bar has nothing behind it worth
            clicking through to. `formError` moved in here too — it needs to
            stay visible next to the button that caused it, not scroll away
            at the bottom of a long form. */}
        <div className="bg-background sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-3 border-t p-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total a cobrar</span>
            <span>{formatCurrencyMXN(totalACobrar)}</span>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={isSubmitting}
            onClick={() => void handleConfirm()}
            className="w-full"
          >
            {isSubmitting ? "Guardando…" : "Confirmar renta"}
          </Button>
        </div>
      </main>

      <RentalCreatedSummary
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        receipt={receipt}
        onContinue={() => {
          setSummaryOpen(false);
          navigate("/dashboard");
        }}
      />

      <CustomerDetailSheet
        open={customerDetailOpen}
        onOpenChange={setCustomerDetailOpen}
        customerId={selectedCustomer?.id ?? null}
      />
    </div>
  );
}
