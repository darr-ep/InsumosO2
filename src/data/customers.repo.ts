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
  // §21/Anexo A.5: uploading the credential photo may fail or simply not
  // happen at creation time — the rental/customer must still be creatable.
  // Optional here on purpose (Phase 3 fix, see the customers migration's
  // docblock for the full story); `credencial pendiente` is then derived
  // from an empty `credential_photo` (domain/customers/customer.ts).
  credentialPhoto?: File | null;
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
  // Phase 3 fix: only append the file when present — the field is
  // `required: false` server-side now, and sending an empty/undefined file
  // part would defeat the point of making it optional.
  if (input.credentialPhoto) {
    formData.append("credential_photo", input.credentialPhoto);
  }

  return pb.collection(CUSTOMERS_COLLECTION).create<CustomerRecord>(formData);
}

// §16.13/CU7's "credencial pendiente" state needs a way out: task 3.4
// (`CustomerDetailSheet`) lets staff retry/complete the upload later,
// without recreating the customer.
export async function updateCustomerCredentialPhoto(
  customerId: string,
  credentialPhoto: File,
): Promise<CustomerRecord> {
  const formData = new FormData();
  formData.append("credential_photo", credentialPhoto);

  return pb
    .collection(CUSTOMERS_COLLECTION)
    .update<CustomerRecord>(customerId, formData);
}

// §16.6/CU7: "Ficha de cliente" needs the customer's own record on demand
// (opened from Detalle de renta or from the customer picker in Nueva
// renta) — not just whatever a search result already carried.
export async function getCustomer(customerId: string): Promise<CustomerRecord> {
  return pb.collection(CUSTOMERS_COLLECTION).getOne<CustomerRecord>(customerId);
}

/**
 * SDD.md §15 (manejo de credenciales) + CU7's second scenario. A protected
 * file is NOT resolvable by URL alone — a short-lived `pb.files.getToken()`
 * token is required first, then appended as a query param via
 * `pb.files.getURL()`. Only called on demand (task 3.4's "Ver credencial"
 * button) — never eagerly, and never rendered in any listing (§15: "no
 * aparece en listados").
 */
export async function getCredentialPhotoUrl(
  customer: CustomerRecord,
): Promise<string> {
  const token = await pb.files.getToken();
  return pb.files.getURL(customer, customer.credential_photo, { token });
}
