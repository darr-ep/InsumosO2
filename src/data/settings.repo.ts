import type { RecordModel } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced). Thin wrapper over the PocketBase SDK
 * for the `business_settings` collection — no business rules here (see
 * `domain/settings/businessSettings.ts` for the total-stock validation
 * schema), mirrors this project's other `*.repo.ts` files
 * (`customers.repo.ts`/`rentals.repo.ts`).
 *
 * `business_settings` is a SINGLETON collection by design: exactly one row
 * exists, ever, seeded by `pb_migrations/*_business_settings_collection.js`
 * (`createRule`/`deleteRule` are superuser-only, same "admin-panel-only"
 * pattern `users.createRule = null` already established — see that
 * migration's docblock). `getFirstListItem("")` is the PocketBase SDK's own
 * documented idiom for "fetch the first (only) record, no filter needed".
 */

export interface BusinessSettingsRecord extends RecordModel {
  total_concentradores: number;
  total_tanques: number;
}

export interface UpdateBusinessSettingsInput {
  totalConcentradores?: number;
  totalTanques?: number;
}

const BUSINESS_SETTINGS_COLLECTION = "business_settings";

export async function getBusinessSettings(): Promise<BusinessSettingsRecord> {
  return pb
    .collection(BUSINESS_SETTINGS_COLLECTION)
    .getFirstListItem<BusinessSettingsRecord>("", { requestKey: null });
}

// Business owner (verbatim): needs to be editable "tanto para aumentar como
// disminuir" — both directions are this exact same call, there is no
// separate increase/decrease code path. Only the field(s) actually passed
// are sent in the update body, so editing one total never touches the
// other.
export async function updateBusinessSettings(
  input: UpdateBusinessSettingsInput,
): Promise<BusinessSettingsRecord> {
  const settings = await getBusinessSettings();

  const body: Partial<
    Pick<BusinessSettingsRecord, "total_concentradores" | "total_tanques">
  > = {};
  if (input.totalConcentradores !== undefined) {
    body.total_concentradores = input.totalConcentradores;
  }
  if (input.totalTanques !== undefined) {
    body.total_tanques = input.totalTanques;
  }

  return pb
    .collection(BUSINESS_SETTINGS_COLLECTION)
    .update<BusinessSettingsRecord>(settings.id, body);
}
