import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RentalCard } from "@/components/RentalCard";

/**
 * SDD.md §17 ("RentalCard (folio, cliente, estado, tiempo transcurrido)").
 * Gap-fill finding 5: extracted out of the identical inline
 * Card/CardHeader/CardContent block DashboardScreen and SearchScreen both
 * had — this is a pure structural extraction, so these tests lock the
 * shared contract (clickable card, customer name heading, optional
 * className overrides), while DashboardScreen.test.tsx/SearchScreen.test.tsx
 * remain the source of truth for each screen's actual usage/content.
 *
 * Redesign Batch D (business-owner brief, round 4): "Una renta debe mostrar
 * rápidamente: nombre del cliente, folio, producto, fecha de inicio,
 * costo/renta, estado." Status was NOT shown anywhere on the card before
 * this batch — RentalCard now owns `status` (rendered via the existing
 * `RentalStatusBadge`, unchanged) and `folio` (promoted out of the generic
 * `children` blob into its own prop) so the 2-tier hierarchy — folio
 * prominent, everything else in `children` metadata-weight — lives inside
 * the component instead of being left to each call site.
 */
describe("RentalCard (§17)", () => {
  it("renders the customer name, folio (no 'Folio:' prefix — design-fidelity §4.1), and the given metadata content", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("R-000001")).toBeInTheDocument();
    expect(screen.queryByText(/Folio:/)).not.toBeInTheDocument();
    expect(screen.getByText("Desde: 20/08/2026")).toBeInTheDocument();
  });

  // design-fidelity §4.1 (design obs #2224 §C3): the amount is now the
  // visually prominent element on the card (promoted out of the generic
  // `children` blob into its own `amount` prop), not the folio.
  it("renders the amount prop when given, separate from the metadata children", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
        amount="$2,800.00"
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByText("$2,800.00")).toBeInTheDocument();
    expect(screen.getByText("Desde: 20/08/2026")).toBeInTheDocument();
  });

  it("renders no amount at all when the amount prop isn't given", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders the status as visible text, not just color (ACTIVE) — §16.4 via RentalStatusBadge", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("renders the status as visible text, not just color (RETURNED) — a search result can be a returned rental too", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="RETURNED"
        folio="R-000001"
        onClick={vi.fn()}
      >
        <p>Devuelta: 25/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByText("Devuelta")).toBeInTheDocument();
  });

  it("calls onClick when the card is pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={onClick}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the customer's phone when given (Redesign — UX/UI pass, optional/free from already-expanded data)", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
        phone="5512345678"
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByText("5512345678")).toBeInTheDocument();
  });

  // design-fidelity §4.1/§6 (design obs #2224 §C2, stretched-link pattern):
  // the phone is a real `tel:` link and must NOT be a descendant of the
  // card's own click-through control, so tapping it never also opens the
  // rental detail.
  it("renders the phone as a tel: link that does not trigger the card's onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={onClick}
        phone="5512345678"
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    const telLink = screen.getByRole("link", { name: /5512345678/ });
    expect(telLink).toHaveAttribute("href", "tel:5512345678");

    await user.click(telLink);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders no phone line at all when phone isn't given (e.g. search-result cards without expanded customer data)", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.queryByText("5512345678")).not.toBeInTheDocument();
  });

  it("renders the given itemTypeIcon next to the folio", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
        itemTypeIcon={<span data-testid="item-icon">icon</span>}
      >
        <p>Desde: 20/08/2026</p>
      </RentalCard>,
    );

    expect(screen.getByTestId("item-icon")).toBeInTheDocument();
  });

  it("applies an optional cardClassName override (e.g. the stale-rental --warning border token)", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        status="ACTIVE"
        folio="R-000001"
        onClick={vi.fn()}
        cardClassName="border-warning"
      >
        <p>10 días activa · Revisar renta</p>
      </RentalCard>,
    );

    const name = screen.getByText("Juan Pérez");
    const card = name.closest(".border-warning");
    expect(card).not.toBeNull();
  });
});
