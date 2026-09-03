import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  listActiveRentals,
  listActiveRentalItems,
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

const DataCacheContext = createContext<DataCacheValue | null>(null);

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [activeItems, setActiveItems] = useState<RentalItemRecord[]>([]);
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettingsRecord | null>(null);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [isRefreshingRentals, setIsRefreshingRentals] = useState(false);
  const isLoadingRentalsRef = useRef(false);

  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [isRefreshingCustomers, setIsRefreshingCustomers] = useState(false);
  const isLoadingCustomersRef = useRef(false);

  // Nunca lanza: una falla de primera carga (rentals sigue en null) replica
  // el error inline de siempre; una falla de refresh con datos ya en cache
  // no los borra — toast.error(...) y se queda con lo último bueno.
  async function refreshRentals(): Promise<void> {
    isLoadingRentalsRef.current = true;
    setIsRefreshingRentals(true);

    try {
      const [activeRentals, items, settings] = await Promise.all([
        listActiveRentals(),
        listActiveRentalItems(),
        getBusinessSettings(),
      ]);
      setRentals(activeRentals);
      setActiveItems(items);
      setBusinessSettings(settings);
      setRentalsError(null);
    } catch {
      if (rentals === null) {
        setRentalsError("No se pudieron cargar las rentas activas.");
      } else {
        toast.error("No se pudieron actualizar las rentas activas.");
      }
    } finally {
      isLoadingRentalsRef.current = false;
      setIsRefreshingRentals(false);
    }
  }

  function loadRentalsIfNeeded() {
    if (rentals !== null || isLoadingRentalsRef.current) {
      return;
    }
    void refreshRentals();
  }

  async function refreshCustomers(): Promise<void> {
    isLoadingCustomersRef.current = true;
    setIsRefreshingCustomers(true);

    try {
      const items = await listCustomers();
      setCustomers(items);
      setCustomersError(null);
    } catch {
      if (customers === null) {
        setCustomersError("No se pudo cargar la lista de clientes.");
      } else {
        toast.error("No se pudo actualizar la lista de clientes.");
      }
    } finally {
      isLoadingCustomersRef.current = false;
      setIsRefreshingCustomers(false);
    }
  }

  function loadCustomersIfNeeded() {
    if (customers !== null || isLoadingCustomersRef.current) {
      return;
    }
    void refreshCustomers();
  }

  const value: DataCacheValue = {
    rentals,
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
