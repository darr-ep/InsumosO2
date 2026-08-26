import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CustomerForm,
  type CustomerFormSubmitValues,
} from "@/components/CustomerForm";
import {
  createCustomer,
  searchCustomers,
  type CustomerRecord,
} from "@/data/customers.repo";

/**
 * SDD.md §7.1 ("Buscar/crear cliente") + §17. First section of "Nueva
 * renta" (§16.7). Search is debounced so a non-technical user doesn't need
 * to know to press Enter (§16.2).
 */

const SEARCH_DEBOUNCE_MS = 300;

export interface CustomerPickerProps {
  selectedCustomer?: CustomerRecord | null;
  onSelect: (customer: CustomerRecord | null) => void;
}

export function CustomerPicker({
  selectedCustomer = null,
  onSelect,
}: CustomerPickerProps) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "search") {
      return;
    }

    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(() => {
      if (cancelled) {
        return;
      }

      setIsSearching(true);
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
  }, [query, mode]);

  // Derived at render instead of cleared inside the effect above (avoids
  // a setState-in-effect cascading render for the "query was cleared"
  // case) — `results` may briefly hold a stale search's items once the
  // query is emptied, but they're never shown since this is empty then.
  const visibleResults = query.trim() ? results : [];

  async function handleCreate(values: CustomerFormSubmitValues) {
    setIsCreating(true);
    setError(null);

    try {
      const customer = await createCustomer(values);
      onSelect(customer);
      setMode("search");
      setQuery("");
    } catch {
      setError("No se pudo guardar el cliente. Intenta de nuevo.");
    } finally {
      setIsCreating(false);
    }
  }

  if (selectedCustomer) {
    return (
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="font-medium">{selectedCustomer.name}</p>
          <p className="text-muted-foreground text-sm">
            {selectedCustomer.phone}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(null)}
        >
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "search" ? "default" : "outline"}
          onClick={() => setMode("search")}
        >
          Buscar cliente
        </Button>
        <Button
          type="button"
          variant={mode === "create" ? "default" : "outline"}
          onClick={() => setMode("create")}
        >
          Cliente nuevo
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {mode === "search" ? (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Nombre o teléfono"
            aria-label="Buscar cliente por nombre o teléfono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {isSearching && (
            <p className="text-muted-foreground text-sm">Buscando…</p>
          )}
          {!isSearching && query.trim() && visibleResults.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Sin resultados. Puedes crear un cliente nuevo.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {visibleResults.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => onSelect(customer)}
                  className="hover:bg-accent w-full rounded-md border p-3 text-left"
                >
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {customer.phone}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <CustomerForm
          submitLabel="Crear cliente"
          isSubmitting={isCreating}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}
