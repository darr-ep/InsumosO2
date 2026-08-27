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
 */
describe("RentalCard (§17)", () => {
  it("renders the customer name and the given content", () => {
    render(
      <RentalCard customerName="Juan Pérez" onClick={vi.fn()}>
        <p>Folio: R-000001</p>
      </RentalCard>,
    );

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Folio: R-000001")).toBeInTheDocument();
  });

  it("calls onClick when the card is pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RentalCard customerName="Juan Pérez" onClick={onClick}>
        <p>Folio: R-000001</p>
      </RentalCard>,
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies an optional cardClassName override (e.g. the stale-rental amber border)", () => {
    render(
      <RentalCard
        customerName="Juan Pérez"
        onClick={vi.fn()}
        cardClassName="border-amber-500"
      >
        <p>10 días activa · Revisar renta</p>
      </RentalCard>,
    );

    const name = screen.getByText("Juan Pérez");
    const card = name.closest(".border-amber-500");
    expect(card).not.toBeNull();
  });
});
