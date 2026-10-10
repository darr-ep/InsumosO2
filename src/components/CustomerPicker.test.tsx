import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerPicker, type CustomerPickerProps } from "@/components/CustomerPicker";
import type { CustomerFormSubmitValues } from "@/components/CustomerForm";
import type { CustomerRecord } from "@/data/customers.repo";

// design-fidelity #6's guard reads the live-reported `pendingNewCustomer`
// prop, exactly like the real caller (`RentalNewScreen`) does — a bare
// `vi.fn()` for `onSelectDraft` never feeds the draft back in, so it can't
// exercise the guard. This tiny controlled wrapper mirrors the real
// prop-drilling loop.
function ControlledPicker(
  props: Omit<CustomerPickerProps, "pendingNewCustomer" | "onSelectDraft"> & {
    onSelectDraft?: (draft: CustomerFormSubmitValues | null) => void;
  },
) {
  const [draft, setDraft] = useState<CustomerFormSubmitValues | null>(null);
  return (
    <CustomerPicker
      {...props}
      pendingNewCustomer={draft}
      onSelectDraft={(next) => {
        setDraft(next);
        props.onSelectDraft?.(next);
      }}
    />
  );
}

const searchCustomers = vi.fn();
// `createCustomer` is stubbed defensively only — `CustomerPicker` must
// never call it itself anymore (see file doc comment: "Cliente nuevo" only
// stages a draft via `onSelectDraft`; `RentalNewScreen` is the one that
// resolves it into a real `createCustomer` call, at rental-confirm time).
const createCustomer = vi.fn();

const listCustomers = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
}));

const juan = {
  id: "c1",
  name: "Juan Pérez",
  phone: "5512345678",
} as CustomerRecord;

describe("CustomerPicker (§7.1)", () => {
  beforeEach(() => {
    searchCustomers.mockReset();
    createCustomer.mockReset();
    listCustomers.mockReset();
    listCustomers.mockResolvedValue([]);
  });

  it("searches as the user types and lets them pick a result", async () => {
    searchCustomers.mockResolvedValue([juan]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} onSelectDraft={vi.fn()} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );

    const resultButton = await screen.findByRole("button", {
      name: /Juan Pérez/,
    });
    await user.click(resultButton);

    expect(onSelect).toHaveBeenCalledWith(juan);
  });

  it("shows the selected customer card with checked state and no 'Ver ficha'", () => {
    const onSelect = vi.fn();
    render(
      <CustomerPicker
        selectedCustomer={juan}
        onSelect={onSelect}
        onSelectDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("55 1234 5678")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ver ficha" }),
    ).not.toBeInTheDocument();
  });

  it("shows a tappable 'Crear cliente nuevo' button that opens the create form with the typed query", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} onSelectDraft={onSelectDraft} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );

    const createButton = await screen.findByRole("button", {
      name: /Crear cliente nuevo/,
    });
    expect(createButton).toBeInTheDocument();

    await user.click(createButton);
    expect(await screen.findByDisplayValue("Juan Pérez")).toBeInTheDocument();
  });

  it("tapping 'Crear cliente nuevo' opens the form pre-filled with the typed query, and reports the draft continuously via onSelectDraft — no submit button, and createCustomer is never called here", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} onSelectDraft={onSelectDraft} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );

    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");
    // No submit button in this flow anymore — the draft is live-reported.
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    // No photo uploaded here — `compressImage`'s canvas pipeline isn't
    // meaningfully runnable in jsdom (same documented limitation as
    // `CredentialCameraCapture.test.tsx`/`imageCompression.test.ts`).
    await waitFor(() =>
      expect(onSelectDraft).toHaveBeenLastCalledWith({
        name: "Juan Pérez",
        phone: "5512345678",
        credentialPhoto: null,
      }),
    );
    // The customer must not be persisted here — `RentalNewScreen` resolves
    // the draft into a real `createCustomer` call at rental-confirm time.
    expect(createCustomer).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clears an in-progress draft via onSelectDraft(null) after confirming discard when tapping '‹ Volver a buscar' (design-fidelity #6, guarded)", async () => {
    searchCustomers.mockResolvedValue([]);
    const draft = { name: "Juan Pérez", phone: "", credentialPhoto: null };
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const cancelCreatingRef = { current: null as (() => void) | null };
    const user = userEvent.setup();
    render(
      <CustomerPicker
        pendingNewCustomer={draft}
        onSelect={onSelect}
        onSelectDraft={onSelectDraft}
        cancelCreatingRef={cancelCreatingRef}
      />,
    );

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );

    act(() => {
      cancelCreatingRef.current?.();
    });

    // Name is non-empty (prefilled from the search query) — the discard
    // confirmation must appear before the draft is actually cleared.
    expect(
      screen.getByRole("heading", { name: "¿Descartar el cliente nuevo?" }),
    ).toBeInTheDocument();
    expect(onSelectDraft).not.toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: "Sí, descartar" }));

    expect(onSelectDraft).toHaveBeenCalledWith(null);
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
    ).toBeInTheDocument();
  });

  it("cancels the cliente-nuevo draft immediately, with no confirmation popup, when nothing has been captured yet (design-fidelity #6 guard)", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const cancelCreatingRef = { current: null as (() => void) | null };
    const user = userEvent.setup();
    render(<ControlledPicker onSelect={onSelect} onSelectDraft={onSelectDraft} cancelCreatingRef={cancelCreatingRef} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    // Clear the prefilled name so the draft is genuinely empty (no name, no
    // phone, no photo) — nothing to lose.
    await user.clear(screen.getByLabelText("Nombre"));
    await waitFor(() =>
      expect(onSelectDraft).toHaveBeenLastCalledWith({
        name: "",
        phone: "",
        credentialPhoto: null,
      }),
    );

    act(() => {
      cancelCreatingRef.current?.();
    });

    expect(
      screen.queryByRole("heading", { name: "¿Descartar el cliente nuevo?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
    ).toBeInTheDocument();
  });

  it("'Seguir capturando' keeps the cliente-nuevo draft open without discarding it (design-fidelity #6)", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const cancelCreatingRef = { current: null as (() => void) | null };
    const user = userEvent.setup();
    render(<ControlledPicker onSelect={onSelect} onSelectDraft={onSelectDraft} cancelCreatingRef={cancelCreatingRef} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    await waitFor(() =>
      expect(onSelectDraft).toHaveBeenLastCalledWith({
        name: "Juan Pérez",
        phone: "",
        credentialPhoto: null,
      }),
    );

    act(() => {
      cancelCreatingRef.current?.();
    });
    expect(
      await screen.findByRole("heading", { name: "¿Descartar el cliente nuevo?" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Seguir capturando" }),
    );

    expect(
      screen.queryByRole("heading", { name: "¿Descartar el cliente nuevo?" }),
    ).not.toBeInTheDocument();
    expect(onSelectDraft).not.toHaveBeenCalledWith(null);
    // Still on the create-customer form, not back to search.
    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");
  });

  it("reports creatingNew via onCreatingChange (design-fidelity D1.3, report-only — RentalNewScreen's breadcrumb)", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const onCreatingChange = vi.fn();
    const cancelCreatingRef = { current: null as (() => void) | null };
    const user = userEvent.setup();
    render(
      <CustomerPicker
        onSelect={onSelect}
        onSelectDraft={onSelectDraft}
        onCreatingChange={onCreatingChange}
        cancelCreatingRef={cancelCreatingRef}
      />,
    );

    // Reported as false on mount — not creating yet.
    await waitFor(() =>
      expect(onCreatingChange).toHaveBeenLastCalledWith(false),
    );

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );

    await waitFor(() =>
      expect(onCreatingChange).toHaveBeenLastCalledWith(true),
    );

    cancelCreatingRef.current?.();

    await waitFor(() =>
      expect(onCreatingChange).toHaveBeenLastCalledWith(false),
    );
  });
});
