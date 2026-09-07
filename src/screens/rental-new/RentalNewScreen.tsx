import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";
import { ClientResponseError } from "pocketbase";
import { CheckCircle2, ChevronRight, CircleDollarSign, Layers, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDataCache } from "@/app/DataCacheContext";
import { CustomerPicker } from "@/components/CustomerPicker";
import { UserAvatar } from "@/components/UserAvatar";
import {
  ItemQuantityPicker,
  emptyItemQuantities,
  itemQuantitiesToList,
  type ItemQuantities,
} from "@/components/ItemQuantityPicker";
import { RentalCreatedSummary } from "@/components/RentalCreatedSummary";
import { LoadingDialog } from "@/components/LoadingDialog";
import { type CustomerFormSubmitValues } from "@/components/CustomerForm";
import { createCustomer, type CustomerRecord } from "@/data/customers.repo";
import { createRental, RentalPartiallyCreatedError } from "@/data/rentals.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import { customerFormSchema, isCredentialPending } from "@/domain/customers/customer";
import { rentalFormSchema, rentalItemTypeLabel } from "@/domain/rentals/rental";
import {
  validateCustomerStep,
  validateItemsStep,
} from "@/domain/rentals/rentalWizard";
import {
  buildRentalReceipt,
  type RentalReceiptData,
} from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";
import { formatPhoneDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * SDD.md §7.1 (flujo Nueva renta) + §16.7 (orden de campos) + §18 (confirmar
 * → modal Comprobante → Dashboard) + CU4. `folio`/`status` are never part of
 * this screen's state — the server (task 1.1/1.2) is the only source of
 * truth for those. §16.6's "Ficha de cliente — abierta desde... el buscador
 * de cliente en Nueva renta" was removed per spec (design-fidelity audit) —
 * `CustomerPicker` no longer exposes a way to open it from this screen.
 *
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief,
 * verbatim): "En pantallas secundarias: flecha ← + título en el navbar."
 * Replaced the inline `<h1>Nueva renta</h1>` with `AppHeader`'s secondary
 * variant (`showBack`).
 *
 * design-fidelity D1 (obs #2224's "D1. Nueva renta wizard"): this screen was
 * originally a single scrollable page; it is now a 3-step wizard (Cliente →
 * Qué se renta + montos → Confirmar). §16.7's original field order and
 * §7.1's flow are unchanged — this only regroups the same fields/controls
 * into gated steps. All three step panels stay MOUNTED, toggled with the
 * HTML `hidden` attribute — never conditional rendering — so `CustomerPicker`
 * never unmounts (preserves its typed search query, the "Cliente nuevo"
 * branch, and `CustomerForm`'s captured-photo preview across back/forward
 * navigation). Per-step gating (`validateCustomerStep`/`validateItemsStep`,
 * `@/domain/rentals/rentalWizard.ts`) reuses the exact same schemas
 * `handleConfirm` below already validates against — `handleConfirm`'s own
 * body is intentionally UNCHANGED by this slice: `createCustomer`/
 * `createRental` are still called from this one function only, invoked from
 * exactly one button (step 3's "Confirmar renta"). Step navigation itself
 * (`goBack`/`goToStep2`/`goToStep3` below) calls `setStep` and nothing
 * else — no other setter, no `resetForm()`, no side effect runs as a
 * consequence of a step transition.
 *
 * design-fidelity D1.5-D1.7 (obs #2224's D3.3 "one dialog, one code path,
 * both triggers"): the exit guard. `AppHeader`'s back arrow already calls
 * `navigate(-1)` internally (`AppHeader.tsx` — NOT modified by this slice),
 * which is itself a React Router navigation, so `useBlocker(...)`
 * intercepts the arrow tap AND hardware/gesture back (also a `navigate(-1)`-
 * shaped POP, per D3's router migration) through the identical mechanism.
 * No `onBack` prop, no second piece of state, no second dialog instance —
 * `blocker.state === "blocked"` is the single source of truth for whether
 * the shared `ConfirmDialog` (call site #7) is open. The footer's "Atrás"
 * (`goBack`, above) is a different control with a different meaning — it
 * only ever calls `setStep`, never `navigate`, so it can never trip this
 * guard.
 *
 * Post-implementation bugfix (real-device finding, 2026-09-05): confirming a
 * rental successfully — which calls `resetForm()` — could STILL pop the exit
 * guard the instant the user tapped "Continuar" on `RentalCreatedSummary`.
 * Root cause verified by reading `react-router`'s actual `useBlocker` source
 * (`node_modules/react-router/dist/development/lib/hooks.js`): it does NOT
 * re-register its `shouldBlock` predicate with the router synchronously
 * during render — it does so inside a plain `useEffect`, i.e. a PASSIVE
 * effect that runs asynchronously after commit/paint. `resetForm()`'s state
 * update and `RentalCreatedSummary`'s "Continuar" button becoming visible
 * both happen in the SAME commit, but the router's registered predicate
 * function only catches up to that commit once this passive effect actually
 * flushes — a real (if usually brief) window during which `navigate(...)`
 * would still be evaluated against the STALE, pre-reset predicate (still
 * closing over `hasCapturedData === true`) and incorrectly block. The
 * project's own test suite could never observe this: `@testing-library/
 * react`'s `act()` — entered by every `userEvent`/`waitFor`/`findBy*` call —
 * always drains pending passive effects as part of exiting, so by the time
 * test code can click "Continuar" the stale-predicate window has already
 * been closed by the test harness itself, not by the app. Fixed by never
 * relying on the effect to "catch up" at all: `hasCapturedDataRef` is kept
 * in sync via `useLayoutEffect` (synchronous, before paint — i.e. before the
 * user could possibly interact with the newly-committed UI), and the
 * function handed to `useBlocker` is a permanently STABLE reference that
 * only ever reads `hasCapturedDataRef.current` at call time. Because the
 * function identity never changes, react-router's registration effect only
 * ever needs to run once (on mount) — there is no "stale registration"
 * state to race, by construction, same principle as the D1a correction's
 * `disabled={isSubmitting}` fix on "Atrás" (obs #2224/apply-progress
 * Batch 7b).
 */

type WizardStep = 1 | 2 | 3;

export function RentalNewScreen() {
  const navigate = useNavigate();
  const { refreshRentals } = useDataCache();

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerRecord | null>(null);
  const [pendingNewCustomer, setPendingNewCustomer] =
    useState<CustomerFormSubmitValues | null>(null);
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

  // design-fidelity D1.2 — the only two new pieces of state this slice adds.
  const [step, setStep] = useState<WizardStep>(1);
  // Mirrored, display-only — `CustomerPicker` owns the real `creatingNew`
  // state and reports it here via `onCreatingChange` (D1.3). Feeds only the
  // "Paso 1 · Cliente · Nuevo" breadcrumb below; never controls the picker.
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const cancelCreatingRef = useRef<(() => void) | null>(null);

  function resetForm() {
    setSelectedCustomer(null);
    setPendingNewCustomer(null);
    setItemQuantities(emptyItemQuantities);
    setInitialRentAmount("");
    setDepositAmount("");
    setStep(1);
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
  // this only sums whatever the user already typed. design-fidelity D1: now
  // shown in step 3's read-only review, not the footer.
  const totalACobrar =
    Number(initialRentAmount || 0) + Number(depositAmount || 0);

  // design-fidelity D1.2 — per-step gates, reused by both the footer's
  // "Continuar" `disabled` state and the navigation handlers below.
  const customerStepValid = validateCustomerStep({
    selectedCustomer,
    pendingNewCustomer,
  });
  const itemsStepValid = validateItemsStep({
    itemQuantities,
    initialRentAmount,
    depositAmount,
  });

  // design-fidelity D1.5 — the exit-guard predicate (obs #2224's D1 exit
  // guard). `useBlocker` intercepts any real navigation attempt away from
  // this screen (header arrow's `navigate(-1)`, hardware/gesture back) while
  // this is true; it never fires for in-wizard step changes, which don't
  // call `navigate` at all.
  const hasCapturedData =
    !summaryOpen &&
    (selectedCustomer !== null ||
      pendingNewCustomer !== null ||
      itemQuantitiesToList(itemQuantities).length > 0 ||
      initialRentAmount !== "" ||
      depositAmount !== "");

  // Post-implementation bugfix (see the block comment above this component):
  // kept in sync via `useLayoutEffect`, NOT read directly by `useBlocker`,
  // so the function passed below never needs to change identity — see next
  // comment.
  const hasCapturedDataRef = useRef(hasCapturedData);
  useLayoutEffect(() => {
    hasCapturedDataRef.current = hasCapturedData;
  });
  // A permanently stable function reference (empty dep array): react-router
  // only re-registers a blocker's predicate with the router when THIS
  // reference changes, via a passive effect. Reading a boolean directly here
  // (the old code) forced a new reference — and therefore a fresh,
  // asynchronous re-registration — on every `hasCapturedData` flip,
  // reopening the stale-predicate race on every single render. Reading a ref
  // instead means the SAME registered function is used forever; it always
  // reflects the latest value at call time, so there is nothing left to
  // "catch up" on.
  const shouldBlock = useCallback(() => hasCapturedDataRef.current, []);
  const blocker = useBlocker(shouldBlock);

  // design-fidelity D1.2 invariant: each of these calls `setStep` and
  // NOTHING else — no other setter, no `resetForm()`, no side effect runs
  // as a consequence of a step transition. The `if` guards are redundant
  // defense-in-depth (the calling buttons are already `disabled` when the
  // gate fails) — they exist so these functions are safe to call from
  // anywhere, not just from an enabled button.
  function goBack() {
    setStep((current) => (current === 3 ? 2 : 1));
  }
  function goToStep2() {
    if (customerStepValid) {
      setStep(2);
    }
  }
  function goToStep3() {
    if (itemsStepValid) {
      setStep(3);
    }
  }

  // Step 3's read-only review shows whichever customer will actually be
  // used at confirm time — a saved selection, or the in-progress draft.
  const reviewCustomer = selectedCustomer ?? pendingNewCustomer;

  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  function handleHeaderBack() {
    if (summaryOpen) {
      setSummaryOpen(false);
      resetForm();
      navigate("/dashboard");
      return;
    }
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    if (isCreatingCustomer) {
      cancelCreatingRef.current?.();
      return;
    }
    if (hasCapturedData) {
      setExitConfirmOpen(true);
      return;
    }
    navigate("/dashboard");
  }

  const headerTitle =
    step === 1
      ? (isCreatingCustomer ? "Nuevo cliente" : "Cliente")
      : step === 2
        ? "Qué se renta"
        : "Confirmar";

  return (
    <>
      <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
        <AppHeader title={headerTitle} showBack onBack={handleHeaderBack} />
        {step === 1 && isCreatingCustomer && (
          <div className="flex items-center px-4 pt-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => cancelCreatingRef.current?.()}
              className="hover:underline hover:text-foreground cursor-pointer"
            >
              Paso 1
            </button>
            <ChevronRight className="h-3.5 w-3.5 mx-2 text-slate-400" />
            <span className="text-primary font-medium">Cliente · Nuevo</span>
          </div>
        )}

        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-1 flex-col gap-6 px-4 pb-4">
            {/* Step 1 — Cliente. */}
            <div hidden={step !== 1} className="flex flex-col gap-2">
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
                invalid={customerInvalid}
                onSearchBlur={() => setCustomerInvalid(true)}
                onCreatingChange={setIsCreatingCustomer}
                cancelCreatingRef={cancelCreatingRef}
              />
            </div>

            {/* Step 2 — Qué se renta + montos. */}
            <div hidden={step !== 2} className="flex flex-col gap-6 pt-3">
              <section className="flex flex-col gap-3 pt-1">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Layers aria-hidden="true" className="size-4 text-blue-600" />
                  Qué se renta
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

              <section className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <CircleDollarSign aria-hidden="true" className="size-4 text-blue-600" />
                  Montos
                </h2>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rental-initial-amount" required>
                    Renta
                  </Label>
                  <CurrencyInput
                    id="rental-initial-amount"
                    value={initialRentAmount}
                    onChange={setInitialRentAmount}
                    className="bg-card"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rental-deposit-amount">Depósito</Label>
                  <CurrencyInput
                    id="rental-deposit-amount"
                    value={depositAmount}
                    onChange={setDepositAmount}
                    className="bg-card"
                  />
                </div>
              </section>
            </div>

            {/* Step 3 — Confirmar */}
            <div hidden={step !== 3} className="flex flex-col gap-4 pt-3">
              <div className="flex items-center gap-2 rounded-xl bg-[#ecfdf5] border border-[#15a349] p-3 text-sm text-[#15a349]">
                <CheckCircle2 className="size-4 text-[#15a349] shrink-0" />
                <span>¡Casi listo! Revisa que los datos sean correctos antes de confirmar.</span>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                <UserAvatar name={reviewCustomer?.name ?? "Cliente"} avatarUrl={null} tone="solid" size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{reviewCustomer?.name}</p>
                  {reviewCustomer?.phone && (
                    <p className="text-muted-foreground text-sm">{formatPhoneDisplay(reviewCustomer.phone)}</p>
                  )}
                </div>
                {((selectedCustomer && isCredentialPending(selectedCustomer.credential_photo)) ||
                  (pendingNewCustomer && !pendingNewCustomer.credentialPhoto)) && (
                  <span className="bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0">
                    Credencial pendiente
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5 shadow-sm">
                {itemQuantitiesToList(itemQuantities).map((item) => (
                  <div
                    key={item.itemType}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{rentalItemTypeLabel(item.itemType)}</span>
                    <span className="font-bold text-foreground">{item.quantity}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Renta</span>
                  <span className="font-bold text-foreground">
                    {formatCurrencyMXN(Number(initialRentAmount || 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Depósito</span>
                  <span className="font-bold text-foreground">
                    {formatCurrencyMXN(Number(depositAmount || 0))}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-medium">Total a cobrar</span>
                  <span className="text-2xl font-bold text-foreground">
                    {formatCurrencyMXN(totalACobrar)}
                  </span>
                </div>
                <div className="flex size-11 items-center justify-center rounded-full bg-blue-50">
                  <Wallet className="size-5 text-blue-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-card sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-3 border-t p-4">
            <div className="flex gap-1" aria-hidden="true">
              {([1, 2, 3] as const).map((segment) => (
                <div
                  key={segment}
                  className={cn(
                    "h-[5px] flex-1 rounded-full",
                    segment <= step ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>

            {step === 2 && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-semibold text-slate-900">Total a cobrar</span>
                <span className="text-blue-600 font-bold text-base">
                  {formatCurrencyMXN(totalACobrar)}
                </span>
              </div>
            )}

            {step === 3 && (
              <p className="text-xs text-muted-foreground text-left">
                Al confirmar, la renta se guardará y podrás verla en tu lista de rentas activas.
              </p>
            )}

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}

            <div className="flex gap-2">
              {step === 1 && (
                <>
                  {isCreatingCustomer && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="flex-1"
                      disabled={isSubmitting}
                      onClick={() => cancelCreatingRef.current?.()}
                    >
                      Atrás
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="lg"
                    className="flex-1"
                    disabled={!customerStepValid}
                    onClick={goToStep2}
                  >
                    Continuar
                  </Button>
                </>
              )}
              {step === 2 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={goBack}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="flex-1"
                    disabled={!itemsStepValid}
                    onClick={goToStep3}
                  >
                    Continuar
                  </Button>
                </>
              )}
              {step === 3 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={goBack}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={() => void handleConfirm()}
                  >
                    Confirmar renta
                  </Button>
                </>
              )}
            </div>
          </div>
        </main>

        <LoadingDialog
          open={isSubmitting && !summaryOpen}
          title="Creando renta..."
          description="Estamos procesando la renta y generando el comprobante."
        />

        <RentalCreatedSummary
          open={summaryOpen}
          onOpenChange={(open) => {
            setSummaryOpen(open);
            if (!open) {
              resetForm();
              navigate("/dashboard");
            }
          }}
          receipt={receipt}
          onContinue={() => {
            setSummaryOpen(false);
            resetForm();
            navigate("/dashboard");
          }}
        />
      </div>

      <ConfirmDialog
        open={exitConfirmOpen || blocker.state === "blocked"}
        // This dialog's `open` state is entirely driven by `useBlocker`
        // above, which already IS the real back-navigation interception —
        // letting the shared `Dialog` also push/pop its own raw history
        // entry for it fought the blocker for the same back step (closing
        // via "Seguir aquí" resumed the blocked navigation instead of just
        // dismissing the popup, which looked like the app reloading).
        manageHistory={false}
        onOpenChange={(next) => {
          if (!next) {
            setExitConfirmOpen(false);
            if (blocker.state === "blocked") {
              blocker.reset?.();
            }
          }
        }}
        title="¿Salir sin guardar la renta?"
        description="Se perderá todo lo que capturaste: cliente, productos y montos. La renta no se creará."
        cancelLabel="Seguir aquí"
        confirmLabel="Sí, salir"
        onConfirm={() => {
          setExitConfirmOpen(false);
          hasCapturedDataRef.current = false;
          if (blocker.state === "blocked") {
            blocker.proceed?.();
          } else {
            navigate("/dashboard");
          }
        }}
      />
    </>
  );
}
