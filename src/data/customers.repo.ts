import type { RecordModel } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";

/**
 * SDD.md §7.1 (buscar/crear cliente) + §11 (customers) + §15 (credencial
 * protegida). Thin wrapper over the PocketBase SDK — no business rules
 * here, those live in domain/customers (task 1.5); this file only knows
 * how to talk to the `customers` collection.
 */

export interface CustomerRecord extends RecordModel {
  name: string;
  phone: string;
  credential_photo: string;
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  credentialPhoto: File;
}

const CUSTOMERS_COLLECTION = "customers";
const CUSTOMER_SEARCH_PAGE_SIZE = 20;

// §7.4/§16.9-style match (name/phone contains) scoped to the customer
// picker inside "Nueva renta" (§7.1) — full rentals-aware search (folio
// too) is the dedicated Buscar tab, Phase 2 task 2.6.
export async function searchCustomers(
  query: string,
): Promise<CustomerRecord[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const filter = pb.filter("name ~ {:q} || phone ~ {:q}", { q: trimmed });

  const result = await pb
    .collection(CUSTOMERS_COLLECTION)
    .getList<CustomerRecord>(1, CUSTOMER_SEARCH_PAGE_SIZE, {
      filter,
      sort: "-created",
    });

  return result.items;
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<CustomerRecord> {
  const formData = new FormData();
  formData.append("name", input.name);
  formData.append("phone", input.phone);
  formData.append("credential_photo", input.credentialPhoto);

  return pb.collection(CUSTOMERS_COLLECTION).create<CustomerRecord>(formData);
}
