import type { RecordModel } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";
import type { CustomerRecord } from "@/data/customers.repo";
import {
  shouldRegisterDepositPayment,
  type RentalItemType,
} from "@/domain/rentals/rental";

/**
 * SDD.md §7.1 (flujo Nueva renta) + §11 (rentals/rental_items/payments) +
 * CU4. Thin wrapper over the PocketBase SDK, orchestrating the multi-write
 * sequence a new rental needs — `folio`/`status`/`created_by`/`updated_by`
 * are never sent by this code, they're forced server-side by
 * pb_hooks/rentals_folio.pb.js (task 1.2); sending them would be rejected
 * by the `:isset` guards (task 1.1) anyway.
 */

export type RentalStatus = "ACTIVE" | "RETURNED";
export type PaymentType = "rent" | "deposit" | "adjustment";

export interface RentalExtra {
  description: string;
  price: number;
}

export interface RentalRecord extends RecordModel {
  folio: string;
  customer_id: string;
  status: RentalStatus;
  returned_at: string;
  initial_rent_amount: number;
  deposit_amount: number;
  deposit_returned_amount: number;
  extras: RentalExtra[];
  created_by: string;
  updated_by: string;
  returned_by: string;
}

export interface RentalItemRecord extends RecordModel {
  rental_id: string;
  item_type: RentalItemType;
  quantity: number;
}

export interface PaymentRecord extends RecordModel {
  rental_id: string;
  amount: number;
  payment_type: PaymentType;
  note: string;
  created_by: string;
}

export interface CreateRentalInput {
  customerId: string;
  items: { itemType: RentalItemType; quantity: number }[];
  initialRentAmount: number;
  depositAmount: number;
  extras: RentalExtra[];
}

export interface CreateRentalResult {
  rental: RentalRecord;
  items: RentalItemRecord[];
  depositPayment: PaymentRecord | null;
}

export interface ReturnRentalInput {
  rentalId: string;
  amountCollected: number;
  depositReturned: number;
  note?: string;
}

// §16.6/CU2 (Dashboard) and §7.4/CU3 (Buscar) both need the customer's
// name/phone alongside a rental — expanded via PocketBase's `expand`
// query param (task 2.5/2.6) rather than a second round-trip per rental.
export interface RentalWithCustomer extends RentalRecord {
  expand?: { customer_id?: CustomerRecord };
}

const RENTALS_COLLECTION = "rentals";
const RENTAL_ITEMS_COLLECTION = "rental_items";
const PAYMENTS_COLLECTION = "payments";
const ACTIVE_RENTALS_PAGE_SIZE = 200;
const RENTAL_SEARCH_PAGE_SIZE = 20;

/**
 * Orchestrates the writes behind CU4 "Crear renta": the rental record
 * first (server assigns folio + status=ACTIVE), then one `rental_items`
 * record per selected product, then — only if a deposit was captured
 * (domain/rentals/rental.ts#shouldRegisterDepositPayment) — a single
 * `deposit` payment.
 *
 * §21 note: this isn't one atomic transaction (PocketBase's REST API
 * doesn't expose cross-collection transactions to the client) — if a later
 * step fails, earlier records already exist. That satisfies §21's actual
 * requirement ("never show saved if the DB failed" — the rental itself
 * either exists or the whole call throws before returning), not a stronger
 * atomicity guarantee the SDD never asked for.
 */
export async function createRental(
  input: CreateRentalInput,
): Promise<CreateRentalResult> {
  const rental = await pb.collection(RENTALS_COLLECTION).create<RentalRecord>(
    {
      customer_id: input.customerId,
      initial_rent_amount: input.initialRentAmount,
      deposit_amount: input.depositAmount,
      extras: input.extras,
    },
  );

  const items = await Promise.all(
    input.items.map((item) =>
      pb.collection(RENTAL_ITEMS_COLLECTION).create<RentalItemRecord>({
        rental_id: rental.id,
        item_type: item.itemType,
        quantity: item.quantity,
      }),
    ),
  );

  const depositPayment = shouldRegisterDepositPayment(input.depositAmount)
    ? await pb.collection(PAYMENTS_COLLECTION).create<PaymentRecord>({
        rental_id: rental.id,
        amount: input.depositAmount,
        payment_type: "deposit" satisfies PaymentType,
      })
    : null;

  return { rental, items, depositPayment };
}

// §16.10/CU6/CU7: `RentalDetailSheet` (task 3.3) always reloads the rental
// fresh by id — it's opened from a stale Dashboard/Search card and must
// reflect a status change (e.g. after a return) without a full page reload.
export async function getRental(
  rentalId: string,
): Promise<RentalWithCustomer> {
  return pb
    .collection(RENTALS_COLLECTION)
    .getOne<RentalWithCustomer>(rentalId, { expand: "customer_id" });
}

// §16.10: "qué tiene rentado" — the rental_items for one rental.
export async function listItemsForRental(
  rentalId: string,
): Promise<RentalItemRecord[]> {
  const result = await pb
    .collection(RENTAL_ITEMS_COLLECTION)
    .getList<RentalItemRecord>(1, ACTIVE_RENTALS_PAGE_SIZE, {
      filter: pb.filter("rental_id = {:rentalId}", { rentalId }),
    });

  return result.items;
}

/**
 * SDD.md §19.1 (endpoint custom de devolución) + §7.3 + CU6. The client
 * NEVER calls `pb.collection('rentals').update(id, { status: 'RETURNED' })`
 * directly (task 1.1's `:isset` guards would reject it anyway) — this is
 * the only path to closing a rental, mirroring `createRental`'s relationship
 * to `pb_hooks/rentals_folio.pb.js`. The real logic (status/returned_at/
 * returned_by/final payment) lives entirely in
 * `pb_hooks/rentals_return.pb.js` (task 3.1); this is a thin wrapper.
 */
export async function returnRental(
  input: ReturnRentalInput,
): Promise<RentalRecord> {
  return pb.send<RentalRecord>(`/api/rentals/${input.rentalId}/return`, {
    method: "POST",
    body: {
      amount_collected: input.amountCollected,
      deposit_returned: input.depositReturned,
      ...(input.note ? { note: input.note } : {}),
    },
  });
}

// §16.6/CU7: "Ficha de cliente" shows a customer's full rental history
// (all statuses, not just ACTIVE) — opened from Detalle de renta or from
// the customer picker in Nueva renta (task 3.4).
export async function listRentalsForCustomer(
  customerId: string,
): Promise<RentalRecord[]> {
  const result = await pb
    .collection(RENTALS_COLLECTION)
    .getList<RentalRecord>(1, ACTIVE_RENTALS_PAGE_SIZE, {
      filter: pb.filter("customer_id = {:customerId}", { customerId }),
      sort: "-created",
    });

  return result.items;
}

// §16.3/§16.6/CU2: Dashboard's active-rentals list + count. "requiere
// revisión" staleness (Anexo A.3) is a pure client-side filter over this
// result — see domain/rentals/dashboard.ts (task 2.5).
export async function listActiveRentals(): Promise<RentalWithCustomer[]> {
  const result = await pb
    .collection(RENTALS_COLLECTION)
    .getList<RentalWithCustomer>(1, ACTIVE_RENTALS_PAGE_SIZE, {
      filter: pb.filter("status = {:status}", { status: "ACTIVE" }),
      sort: "-created",
      expand: "customer_id",
    });

  return result.items;
}

// §7.4/§16.9/CU3: matches folio (parcial), nombre de cliente (contiene) o
// teléfono (contiene) in one query — PocketBase supports dot-notation
// relation filters (`customer_id.name`/`customer_id.phone`), confirmed
// live against v0.40.1 in this task's runtime harness.
export async function searchRentals(
  query: string,
): Promise<RentalWithCustomer[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const filter = pb.filter(
    "folio ~ {:q} || customer_id.name ~ {:q} || customer_id.phone ~ {:q}",
    { q: trimmed },
  );

  const result = await pb
    .collection(RENTALS_COLLECTION)
    .getList<RentalWithCustomer>(1, RENTAL_SEARCH_PAGE_SIZE, {
      filter,
      sort: "-created",
      expand: "customer_id",
    });

  return result.items;
}
