import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { pb } from "@/data/pocketbaseClient";
import {
  listActiveRentals,
  listActiveRentalItems,
  listReturnedRentals,
  type RentalItemRecord,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import {
  getBusinessSettings,
  type BusinessSettingsRecord,
} from "@/data/settings.repo";
import { listCustomers, type CustomerRecord } from "@/data/customers.repo";

/**
 * Cache compartido Dashboard/Clientes (bug real, no solo cosmético):
 * `DashboardScreen`/`ClientesScreen` son rutas independientes — React
 * Router desmonta una al entrar a la otra, así que cada navegación
 * reseteaba el estado a `null` y volvía a pedir todo a PocketBase. Este
 * Provider vive por encima de las rutas (montado en `RequireAuth`,
 * `App.tsx`), sobrevive la navegación entre `/dashboard` y `/clientes`, y
 * se desmonta en logout — sin arrastrar datos entre cuentas.
 *
 * También arregla el bug de invalidación que el cache dejaba visible:
 * crear una renta, registrar un pago, procesar una devolución o editar un
 * cliente no actualizaban la pantalla detrás del Sheet/Dialog — solo
 * mutaban el estado local del propio Sheet. `refreshRentals`/
 * `refreshCustomers` son las funciones que cada punto de mutación llama
 * para invalidar el cache compartido.
 *
 * `loadRentalsIfNeeded`/`loadCustomersIfNeeded` están guardados con
 * `useRef`, no `useState` — un `useState`-guard deja pasar 2 llamados en
 * React 19 StrictMode (el efecto que los dispara se invoca 2 veces antes
 * de que el primer `setState` aplique); el `ref` se marca de forma
 * síncrona, antes del primer `await`, así que el segundo llamado ve la
 * carga ya en curso y no hace nada.
 */
export interface DataCacheValue {
  rentals: RentalWithCustomer[] | null;
  returnedRentals: RentalWithCustomer[] | null;
  activeItems: RentalItemRecord[];
  businessSettings: BusinessSettingsRecord | null;
  rentalsError: string | null;
  isRefreshingRentals: boolean;
  loadRentalsIfNeeded: () => void;
  refreshRentals: () => Promise<void>;
  setBusinessSettings: (settings: BusinessSettingsRecord) => void;

  customers: CustomerRecord[] | null;
  customersError: string | null;
  isRefreshingCustomers: boolean;
  loadCustomersIfNeeded: () => void;
  refreshCustomers: () => Promise<void>;
}

export const DataCacheContext = createContext<DataCacheValue | null>(null);

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [returnedRentals, setReturnedRentals] = useState<
    RentalWithCustomer[] | null
  >(null);
  const [activeItems, setActiveItems] = useState<RentalItemRecord[]>([]);
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettingsRecord | null>(null);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [isRefreshingRentals, setIsRefreshingRentals] = useState(false);
  const isLoadingRentalsRef = useRef(false);
  const rentalsRef = useRef<RentalWithCustomer[] | null>(null);
  rentalsRef.current = rentals;

  const inFlightRentalsPromiseRef = useRef<Promise<void> | null>(null);
  const queuedRentalsRef = useRef(false);

  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [isRefreshingCustomers, setIsRefreshingCustomers] = useState(false);
  const isLoadingCustomersRef = useRef(false);
  const customersRef = useRef<CustomerRecord[] | null>(null);
  customersRef.current = customers;

  const inFlightCustomersPromiseRef = useRef<Promise<void> | null>(null);
  const queuedCustomersRef = useRef(false);

  // Deduplica llamadas concurrentes y asegura que múltiples eventos (SSE, mutación, foco)
  // no compitan entre sí ni muestren toasts de error innecesarios.
  const refreshRentals = useCallback(async (): Promise<void> => {
    if (inFlightRentalsPromiseRef.current) {
      queuedRentalsRef.current = true;
      return inFlightRentalsPromiseRef.current;
    }

    const run = async () => {
      isLoadingRentalsRef.current = true;
      setIsRefreshingRentals(true);

      try {
        const [activeRentals, returned, items, settings] = await Promise.all([
          listActiveRentals(),
          listReturnedRentals(),
          listActiveRentalItems(),
          getBusinessSettings(),
        ]);
        setRentals(activeRentals);
        setReturnedRentals(returned);
        setActiveItems(items);
        setBusinessSettings(settings);
        setRentalsError(null);
      } catch (err: unknown) {
        const isAbort =
          (err as { isAbort?: boolean })?.isAbort === true ||
          (err as { name?: string })?.name === "AbortError";
        if (isAbort) return;

        if (rentalsRef.current === null) {
          setRentalsError("No se pudieron cargar las rentas activas.");
        }
      } finally {
        isLoadingRentalsRef.current = false;
        setIsRefreshingRentals(false);
        inFlightRentalsPromiseRef.current = null;
        if (queuedRentalsRef.current) {
          queuedRentalsRef.current = false;
          void refreshRentals();
        }
      }
    };

    inFlightRentalsPromiseRef.current = run();
    return inFlightRentalsPromiseRef.current;
  }, []);

  const loadRentalsIfNeeded = useCallback(() => {
    if (rentalsRef.current !== null || isLoadingRentalsRef.current) {
      return;
    }
    void refreshRentals();
  }, [refreshRentals]);

  const refreshCustomers = useCallback(async (): Promise<void> => {
    if (inFlightCustomersPromiseRef.current) {
      queuedCustomersRef.current = true;
      return inFlightCustomersPromiseRef.current;
    }

    const run = async () => {
      isLoadingCustomersRef.current = true;
      setIsRefreshingCustomers(true);

      try {
        const items = await listCustomers();
        setCustomers(items);
        setCustomersError(null);
      } catch (err: unknown) {
        const isAbort =
          (err as { isAbort?: boolean })?.isAbort === true ||
          (err as { name?: string })?.name === "AbortError";
        if (isAbort) return;

        if (customersRef.current === null) {
          setCustomersError("No se pudo cargar la lista de clientes.");
        }
      } finally {
        isLoadingCustomersRef.current = false;
        setIsRefreshingCustomers(false);
        inFlightCustomersPromiseRef.current = null;
        if (queuedCustomersRef.current) {
          queuedCustomersRef.current = false;
          void refreshCustomers();
        }
      }
    };

    inFlightCustomersPromiseRef.current = run();
    return inFlightCustomersPromiseRef.current;
  }, []);

  const loadCustomersIfNeeded = useCallback(() => {
    if (customersRef.current !== null || isLoadingCustomersRef.current) {
      return;
    }
    void refreshCustomers();
  }, [refreshCustomers]);

  const refreshRentalsRef = useRef(refreshRentals);
  refreshRentalsRef.current = refreshRentals;
  const refreshCustomersRef = useRef(refreshCustomers);
  refreshCustomersRef.current = refreshCustomers;

  // Sincronización en tiempo real (PocketBase SSE) + revalidación al reanudar foco
  useEffect(() => {
    let active = true;
    let rentalsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let customersDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const onRentalsChange = () => {
      if (!active) return;
      if (rentalsDebounceTimer) clearTimeout(rentalsDebounceTimer);
      rentalsDebounceTimer = setTimeout(() => {
        if (!active) return;
        void refreshRentalsRef.current();
      }, 50);
    };

    const onCustomersChange = () => {
      if (!active) return;
      if (customersDebounceTimer) clearTimeout(customersDebounceTimer);
      customersDebounceTimer = setTimeout(() => {
        if (!active) return;
        void refreshCustomersRef.current();
      }, 50);
    };

    const onSettingsChange = (e: { record?: BusinessSettingsRecord }) => {
      if (!active) return;
      if (e?.record) {
        setBusinessSettings(e.record);
      } else {
        onRentalsChange();
      }
    };

    const hasEventSource = typeof EventSource !== "undefined";

    if (hasEventSource && pb?.collection) {
      pb.collection("rentals").subscribe("*", onRentalsChange).catch(() => {});
      pb.collection("rental_items").subscribe("*", onRentalsChange).catch(() => {});
      pb.collection("payments").subscribe("*", onRentalsChange).catch(() => {});
      pb.collection("customers").subscribe("*", onCustomersChange).catch(() => {});
      pb.collection("business_settings").subscribe("*", onSettingsChange).catch(() => {});
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && active) {
        onRentalsChange();
        onCustomersChange();
      }
    };

    const onFocus = () => {
      if (active) {
        onRentalsChange();
        onCustomersChange();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      active = false;
      if (rentalsDebounceTimer) clearTimeout(rentalsDebounceTimer);
      if (customersDebounceTimer) clearTimeout(customersDebounceTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
      if (hasEventSource && pb?.collection) {
        pb.collection("rentals").unsubscribe("*").catch(() => {});
        pb.collection("rental_items").unsubscribe("*").catch(() => {});
        pb.collection("payments").unsubscribe("*").catch(() => {});
        pb.collection("customers").unsubscribe("*").catch(() => {});
        pb.collection("business_settings").unsubscribe("*").catch(() => {});
      }
    };
  }, []);

  const value: DataCacheValue = {
    rentals,
    returnedRentals,
    activeItems,
    businessSettings,
    rentalsError,
    isRefreshingRentals,
    loadRentalsIfNeeded,
    refreshRentals,
    setBusinessSettings,

    customers,
    customersError,
    isRefreshingCustomers,
    loadCustomersIfNeeded,
    refreshCustomers,
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- same pattern as AppLayout/other context+hook pairs: the hook is exported alongside the Provider on purpose, so every consumer imports both from one place.
export function useDataCache(): DataCacheValue {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error("useDataCache must be used within a DataCacheProvider");
  }
  return context;
}
