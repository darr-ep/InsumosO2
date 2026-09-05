import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerCard } from "@/components/CustomerCard";
import {
  CustomerForm,
  type CustomerFormSubmitValues,
} from "@/components/CustomerForm";
import { searchCustomers, type CustomerRecord } from "@/data/customers.repo";

/**
 * SDD.md §7.1 ("Buscar/crear cliente") + §17. First section of "Nueva
 * renta" (§16.7). Search is debounced so a non-technical user doesn't need
 * to know to press Enter (§16.2). §16.6: "Ficha de cliente — abierta desde
 * Detalle de renta o desde el buscador de cliente en Nueva renta" — task
 * 3.5 wires that second entry point via the optional `onViewCustomer`
 * callback, exposed once a customer is selected.
 *
 * "Cliente nuevo" no longer creates the customer record here — it only
 * stages a draft (`onSelectDraft`) that the caller (`RentalNewScreen`)
 * resolves into a real `createCustomer` call at rental-confirm time, so a
 * new customer isn't persisted until the whole rental is actually
 * confirmed. See `RentalNewScreen.tsx`'s `handleConfirm`.
 *
 * Business owner's fifth follow-up: unified the old "Buscar cliente"/
 * "Cliente nuevo" two-button toggle into a single search field — there's no
 * mode switch to tap anymore. Typing searches as before; if nothing matches,
 * a tappable "Crear cliente nuevo" row (instead of the old plain,
 * non-actionable hint text) opens `CustomerForm` with "Nombre" pre-filled
 * from whatever was already typed (`initialValues`), since that's almost
 * certainly the name the user meant to search OR create. The draft is still
 * reported continuously (`CustomerForm`'s `liveReport` mode, unchanged) —
 * this change is only about how the user reaches the create form, not what
 * happens once they're in it. "‹ Volver a buscar" clears any in-progress
 * draft so a half-filled, abandoned draft can't linger.
 */

const SEARCH_DEBOUNCE_MS = 300;

export interface CustomerPickerProps {
  selectedCustomer?: CustomerRecord | null;
  onSelect: (customer: CustomerRecord | null) => void;
  pendingNewCustomer?: CustomerFormSubmitValues | null;
  onSelectDraft: (draft: CustomerFormSubmitValues | null) => void;
  onViewCustomer?: (customerId: string) => void;
  invalid?: boolean;
  // Fires when the search Input loses focus while still unresolved (no
  // customer selected, no "Cliente nuevo" draft in progress) — this branch
  // only renders in that state, so any blur here means "left without
  // picking anyone". The caller (RentalNewScreen) uses this to flag the
  // section invalid immediately, not only at submit time — same red
  // border/inline message `invalid` already drives, just triggered earlier.
  onSearchBlur?: () => void;
}

export function CustomerPicker({
  selectedCustomer = null,
  onSelect,
  pendingNewCustomer = null,
  onSelectDraft,
  invalid = false,
  onViewCustomer,
  onSearchBlur,
}: CustomerPickerProps) {
  const [creatingNew, setCreatingNew] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (creatingNew) {
      return;
    }

    const trimmed = query.trim();

    if (!trimmed) {
      // Don't reset `isSearching` here via setState — it's cheaper and
      // lint-clean to just derive at render time (below) that an empty
      // query can never be "searching", rather than mutate state for a
      // branch with no subscription to set up.
      return;
    }

    // Mark as searching (and drop any stale results from a previous query)
    // the instant a non-empty query changes — not just once the debounce
    // timer fires. Otherwise there's a ~300ms window where `isSearching` is
    // still false and leftover/empty `results` can make the "Crear cliente
    // nuevo" suggestion (or a stale match) flash on screen before a real
    // search for the current text has actually run. `react-hooks/set-state-in-effect`
    // disallows a bare synchronous setState here (same reasoning/fix as
    // `CredentialCameraCapture.tsx`'s `autoStart` effect) — deferred a tick
    // via `queueMicrotask` to sidestep that; still resolves essentially
    // immediately, well before the real debounce delay below.
    queueMicrotask(() => {
      setIsSearching(true);
      setResults([]);
    });

    let cancelled = false;

    const timeoutId = setTimeout(() => {
      if (cancelled) {
        return;
      }

      searchCustomers(trimmed)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("No se pudo buscar clientes. Intenta de nuevo.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, creatingNew]);

  // Derived at render instead of cleared inside the effect above (avoids
  // a setState-in-effect cascading render for the "query was cleared"
  // case) — `results` may briefly hold a stale search's items once the
  // query is emptied, but they're never shown since this is empty then.
  const visibleResults = query.trim() ? results : [];
  // Same reasoning: `isSearching` can go stale-true if the query is cleared
  // mid-flight (the effect's empty-query branch intentionally doesn't reset
  // it via setState) — an empty query can just never be "searching".
  const showSearching = isSearching && query.trim().length > 0;

  function handleCreate(values: CustomerFormSubmitValues) {
    // No network call here — just report the current draft. `RentalNewScreen`
    // resolves it into a real `createCustomer` call at rental-confirm time.
    // Fires continuously (see `CustomerForm`'s `liveReport` mode) — must NOT
    // reset `creatingNew`/clear the search query, the user is still on this
    // form.
    onSelectDraft(values);
  }

  function handleCancelCreate() {
    setCreatingNew(false);
    if (pendingNewCustomer) {
      // Abandoning an in-progress "Cliente nuevo" draft — don't let a
      // half-filled draft linger and get used later by mistake.
      onSelectDraft(null);
    }
  }

  if (selectedCustomer) {
    return (
      <CustomerCard
        name={selectedCustomer.name}
        phone={selectedCustomer.phone}
        trailing={
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            {onViewCustomer && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onViewCustomer(selectedCustomer.id)}
              >
                Ver ficha
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelect(null)}
            >
              Cambiar
            </Button>
          </div>
        }
      />
    );
  }

  if (creatingNew) {
    return (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={handleCancelCreate}
        >
          ‹ Volver a buscar
        </Button>
        <CustomerForm
          liveReport
          onSubmit={handleCreate}
          initialValues={{ name: query.trim() }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      // Fires `onSearchBlur` only when focus leaves this whole picker, not
      // when it moves to a result card or "Crear cliente nuevo" inside it —
      // tapping a result blurs the Input a moment before its own onClick
      // resolves the customer, and firing on that transient blur flashed
      // the invalid state on for one frame before the selection cleared it.
      // `relatedTarget` is the element about to receive focus; still inside
      // this container means the user is continuing the interaction, not
      // abandoning it.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onSearchBlur?.();
        }
      }}
    >
      <Input
        placeholder="Nombre o teléfono"
        aria-label="Buscar cliente por nombre o teléfono"
        aria-invalid={invalid}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showSearching && (
        <p className="text-muted-foreground text-sm">Buscando…</p>
      )}

      {!showSearching && query.trim() && visibleResults.length === 0 && (
        <button
          type="button"
          onClick={() => setCreatingNew(true)}
          className="hover:bg-accent w-full rounded-md border border-dashed p-3 text-left"
        >
          <p className="font-medium">Crear cliente nuevo</p>
          <p className="text-muted-foreground text-sm">"{query.trim()}"</p>
        </button>
      )}

      {/* Only rendered with actual results — an empty `<ul>` had no visual
          content but still reserved a `gap-2` slot in the parent flex
          column, pushing anything after this component (e.g.
          RentalNewScreen's "Selecciona o crea un cliente" message) down by
          that gap even when there was nothing to show. */}
      {visibleResults.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visibleResults.map((customer) => (
            <li key={customer.id}>
              <CustomerCard
                name={customer.name}
                phone={customer.phone}
                onClick={() => onSelect(customer)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
