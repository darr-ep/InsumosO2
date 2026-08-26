import type { RecordModel } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";
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

const RENTALS_COLLECTION = "rentals";
const RENTAL_ITEMS_COLLECTION = "rental_items";
const PAYMENTS_COLLECTION = "payments";

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
