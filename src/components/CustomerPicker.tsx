import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CustomerCard } from "@/components/CustomerCard";
import {
  CustomerForm,
  type CustomerFormSubmitValues,
} from "@/components/CustomerForm";
import { listCustomers, searchCustomers, type CustomerRecord } from "@/data/customers.repo";
import { DataCacheContext } from "@/app/DataCacheContext";

const SEARCH_DEBOUNCE_MS = 300;

export interface CustomerPickerProps {
  selectedCustomer?: CustomerRecord | null;
  onSelect: (customer: CustomerRecord | null) => void;
  pendingNewCustomer?: CustomerFormSubmitValues | null;
  onSelectDraft: (draft: CustomerFormSubmitValues | null) => void;
  invalid?: boolean;
  onSearchBlur?: () => void;
  onCreatingChange?: (creating: boolean) => void;
  cancelCreatingRef?: React.MutableRefObject<(() => void) | null>;
}

export function CustomerPicker({
  selectedCustomer = null,
  onSelect,
  pendingNewCustomer = null,
  onSelectDraft,
  invalid = false,
  onSearchBlur,
  onCreatingChange,
  cancelCreatingRef,
}: CustomerPickerProps) {
  const cache = useContext(DataCacheContext);
  const [standaloneCustomers, setStandaloneCustomers] = useState<CustomerRecord[] | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);

  useEffect(() => {
    if (cache) {
      cache.loadCustomersIfNeeded();
    } else {
      listCustomers().then(setStandaloneCustomers).catch(() => {});
    }
  }, [cache]);

  const customers = cache ? cache.customers : standaloneCustomers;
  const customersError = cache ? cache.customersError : null;

  useEffect(() => {
    onCreatingChange?.(creatingNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatingNew]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    setDisplayLimit(20);
  }, [query]);

  useEffect(() => {
    if (creatingNew) {
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

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

  const listToDisplay = query.trim() ? results : (customers ?? []);
  // Memoized so the pagination observer effect below (keyed on this
  // reference) doesn't see a new identity — and recreate the observer —
  // on every unrelated render: the `[selectedCustomer, ...listToDisplay]`
  // branch would otherwise allocate a fresh array every time.
  const visibleResults = useMemo(
    () =>
      selectedCustomer &&
      !listToDisplay.some((c) => c.id === selectedCustomer.id)
        ? [selectedCustomer, ...listToDisplay]
        : listToDisplay,
    [selectedCustomer, listToDisplay],
  );
  const displayedResults = visibleResults.slice(0, displayLimit);
  const showSearching = isSearching && query.trim().length > 0;

  function handleCreate(values: CustomerFormSubmitValues) {
    onSelectDraft(values);
  }

  const hasDraftContent =
    pendingNewCustomer !== null &&
    (pendingNewCustomer.name.trim() !== "" ||
      pendingNewCustomer.phone.trim() !== "" ||
      pendingNewCustomer.credentialPhoto !== null);

  function handleCancelCreate() {
    if (hasDraftContent) {
      setConfirmDiscardOpen(true);
      return;
    }
    setCreatingNew(false);
    if (pendingNewCustomer) {
      onSelectDraft(null);
    }
  }

  useEffect(() => {
    if (cancelCreatingRef) {
      cancelCreatingRef.current = handleCancelCreate;
    }
  });

  function handleConfirmDiscardDraft() {
    setConfirmDiscardOpen(false);
    setCreatingNew(false);
    onSelectDraft(null);
  }

  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayLimit((prev) => prev + 20);
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
    // Depend on the underlying list's identity, not a derived count — see
    // ClientesScreen's identical fix for why a derived-count dependency
    // recreates the observer (and cascades the load) on every batch.
  }, [visibleResults]);

  if (creatingNew) {
    return (
      <>
        <div className="flex flex-col gap-3 pt-3">
          <div className="flex items-center gap-2 pb-1">
            <UserPlus className="size-4 text-primary" />
            <h3 className="text-base font-semibold text-slate-900">
              Crear cliente nuevo
            </h3>
          </div>
          <CustomerForm
            liveReport
            onSubmit={handleCreate}
            initialValues={{ name: query.trim() }}
          />
        </div>
        <ConfirmDialog
          open={confirmDiscardOpen}
          onOpenChange={setConfirmDiscardOpen}
          title="¿Descartar el cliente nuevo?"
          description="Se perderán el nombre, el teléfono y la foto que ya capturaste."
          cancelLabel="Seguir capturando"
          confirmLabel="Sí, descartar"
          onConfirm={handleConfirmDiscardDraft}
        />
      </>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          if (!selectedCustomer && !pendingNewCustomer) {
            onSearchBlur?.();
          }
        }
      }}
    >
      <div className="sticky top-0 bg-background pt-3 pb-3 z-10 flex flex-col gap-1.5 -mx-4 px-4">
        <div className="relative flex items-center">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute left-3 size-4 pointer-events-none"
          />
          <Input
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar cliente por nombre o teléfono"
            aria-invalid={invalid && !selectedCustomer && !pendingNewCustomer}
            className="pl-9 bg-card"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {invalid && !selectedCustomer && !pendingNewCustomer && (
          <p className="text-destructive text-sm">
            Selecciona o crea un cliente.
          </p>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {customersError && (
        <p className="text-destructive text-sm">{customersError}</p>
      )}

      {showSearching && (
        <p className="text-muted-foreground text-sm">Buscando…</p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Tus resultados
        </h3>

        <ul className="flex flex-col gap-2">
          {displayedResults.map((customer) => {
            const isSelected = selectedCustomer?.id === customer.id;
            return (
              <li key={customer.id}>
                <CustomerCard
                  name={customer.name}
                  phone={customer.phone}
                  onClick={() => onSelect(customer)}
                  className={
                    isSelected
                      ? "border-2 border-blue-600 bg-blue-50"
                      : undefined
                  }
                  avatarTone={isSelected ? "solid" : "soft"}
                  trailing={
                    isSelected ? (
                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        <Check className="size-5 text-blue-600 shrink-0" />
                      </div>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>

        {displayedResults.length < visibleResults.length && (
          <div
            ref={observerRef}
            className="flex items-center justify-center py-4 text-xs text-muted-foreground"
          >
            <Loader2 className="mr-2 size-4 animate-spin text-primary" />
            <span>Cargando más clientes…</span>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setCreatingNew(true)}
        className="w-full border-2 border-blue-600 text-blue-600 bg-white hover:bg-blue-50 font-semibold py-2.5 flex items-center justify-center gap-2 rounded-xl"
      >
        <UserPlus className="size-4" />
        ¿No lo encuentras? Crear cliente nuevo
      </Button>
    </div>
  );
}
