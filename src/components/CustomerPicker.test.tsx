import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerPicker } from "@/components/CustomerPicker";
import type { CustomerRecord } from "@/data/customers.repo";

const searchCustomers = vi.fn();
// `createCustomer` is stubbed defensively only — `CustomerPicker` must
// never call it itself anymore (see file doc comment: "Cliente nuevo" only
// stages a draft via `onSelectDraft`; `RentalNewScreen` is the one that
// resolves it into a real `createCustomer` call, at rental-confirm time).
const createCustomer = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
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

  it("shows the selected customer with an option to change it", () => {
    const onSelect = vi.fn();
    render(
      <CustomerPicker
        selectedCustomer={juan}
        onSelect={onSelect}
        onSelectDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
    // No "Ver ficha" affordance unless the caller opts in.
    expect(
      screen.queryByRole("button", { name: "Ver ficha" }),
    ).not.toBeInTheDocument();
  });

  it("calls onViewCustomer with the selected customer's id when 'Ver ficha' is pressed (§16.6)", async () => {
    const onSelect = vi.fn();
    const onViewCustomer = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomerPicker
        selectedCustomer={juan}
        onSelect={onSelect}
        onSelectDraft={vi.fn()}
        onViewCustomer={onViewCustomer}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver ficha" }));

    expect(onViewCustomer).toHaveBeenCalledWith("c1");
  });

  it("shows a tappable 'Crear cliente nuevo' row (not plain text) when a search comes back empty", async () => {
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
    expect(createButton).toHaveTextContent("Juan Pérez");
  });

  it("does not flash 'Crear cliente nuevo' before the debounced search actually resolves", async () => {
    searchCustomers.mockResolvedValue([]);
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} onSelectDraft={onSelectDraft} />);

    // Fires the debounced-search effect via fireEvent instead of
    // user.type()'s per-keystroke delay, so the assertion right below runs
    // as close to synchronously-after-change as possible, still well inside
    // the 300ms debounce window.
    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "J",
    );

    // Right after typing, the debounce hasn't fired yet — the "no results,
    // create new" suggestion must not appear before a real search for this
    // text has actually run and confirmed zero matches.
    expect(searchCustomers).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Crear cliente nuevo/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Buscando…")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    ).toBeInTheDocument();
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

  it("clears an in-progress draft via onSelectDraft(null) when tapping '‹ Volver a buscar'", async () => {
    searchCustomers.mockResolvedValue([]);
    const draft = { name: "Juan Pérez", phone: "", credentialPhoto: null };
    const onSelect = vi.fn();
    const onSelectDraft = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomerPicker
        pendingNewCustomer={draft}
        onSelect={onSelect}
        onSelectDraft={onSelectDraft}
      />,
    );

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );

    await user.click(
      screen.getByRole("button", { name: "‹ Volver a buscar" }),
    );

    expect(onSelectDraft).toHaveBeenCalledWith(null);
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
    ).toBeInTheDocument();
  });
});
