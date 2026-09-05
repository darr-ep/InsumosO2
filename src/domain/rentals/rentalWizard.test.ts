import { describe, expect, it } from "vitest";
import { validateCustomerStep, validateItemsStep } from "@/domain/rentals/rentalWizard";

describe("validateCustomerStep (design-fidelity D1.1)", () => {
  it("is valid when a customer is already selected", () => {
    expect(
      validateCustomerStep({
        selectedCustomer: { id: "c1" },
        pendingNewCustomer: null,
      }),
    ).toBe(true);
  });

  it("is valid when a complete 'Cliente nuevo' draft exists instead", () => {
    expect(
      validateCustomerStep({
        selectedCustomer: null,
        pendingNewCustomer: { name: "Juan Pérez", phone: "5512345678" },
      }),
    ).toBe(true);
  });

  it("is invalid when neither a selected customer nor a draft exists", () => {
    expect(
      validateCustomerStep({ selectedCustomer: null, pendingNewCustomer: null }),
    ).toBe(false);
  });

  it("is invalid when the draft's phone is blank", () => {
    expect(
      validateCustomerStep({
        selectedCustomer: null,
        pendingNewCustomer: { name: "Juan Pérez", phone: "" },
      }),
    ).toBe(false);
  });

  it("is invalid when the draft's name is too short", () => {
    expect(
      validateCustomerStep({
        selectedCustomer: null,
        pendingNewCustomer: { name: "J", phone: "5512345678" },
      }),
    ).toBe(false);
  });

  it("is invalid when the draft's phone has the wrong number of digits", () => {
    expect(
      validateCustomerStep({
        selectedCustomer: null,
        pendingNewCustomer: { name: "Juan Pérez", phone: "123" },
      }),
    ).toBe(false);
  });
});

describe("validateItemsStep (design-fidelity D1.1)", () => {
  it("is valid with at least one item and a positive rent amount", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 1, tank: 0 },
        initialRentAmount: "2800",
        depositAmount: "1000",
      }),
    ).toBe(true);
  });

  it("is valid with a zero deposit (deposit is optional)", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 0, tank: 2 },
        initialRentAmount: "1500",
        depositAmount: "0",
      }),
    ).toBe(true);
  });

  it("is invalid with zero items even when amounts are valid", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 0, tank: 0 },
        initialRentAmount: "2800",
        depositAmount: "1000",
      }),
    ).toBe(false);
  });

  it("is invalid with a blank initial rent amount", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 1, tank: 0 },
        initialRentAmount: "",
        depositAmount: "1000",
      }),
    ).toBe(false);
  });

  it("is invalid with a zero initial rent amount (server requires > 0)", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 1, tank: 0 },
        initialRentAmount: "0",
        depositAmount: "1000",
      }),
    ).toBe(false);
  });

  it("is invalid with a negative deposit amount", () => {
    expect(
      validateItemsStep({
        itemQuantities: { concentrator: 1, tank: 0 },
        initialRentAmount: "2800",
        depositAmount: "-100",
      }),
    ).toBe(false);
  });
});
