import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerCard } from "@/components/CustomerCard";

/**
 * design-fidelity Slice C (§4.2, design obs #2224 §C2/C3): new coverage for
 * this component — no test file existed before this batch.
 *
 * Covers three findings from the explore/design docs:
 * 1. Circular avatar (soft-primary bg, primary-colored initial).
 * 2. Badge/chevron mutual exclusion bug (both used to render together).
 * 3. `tel:` stretched-link pattern — the phone must not be a descendant of
 *    the card's own click-through control.
 */
describe("CustomerCard (design-fidelity §4.2)", () => {
  it("renders the customer's name and an avatar with their initial", () => {
    render(<CustomerCard name="Juan Pérez" onClick={vi.fn()} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("renders the phone as a tel: link that does not trigger the card's onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomerCard name="Juan Pérez" phone="5512345678" onClick={onClick} />,
    );

    const telLink = screen.getByRole("link", { name: /5512345678/ });
    expect(telLink).toHaveAttribute("href", "tel:5512345678");

    await user.click(telLink);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when the card itself is pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<CustomerCard name="Juan Pérez" onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Juan Pérez" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the active-count badge, and hides the chevron while the badge is shown (fixes the mutual-exclusion bug)", () => {
    render(<CustomerCard name="Juan Pérez" activeCount={2} onClick={vi.fn()} />);

    expect(screen.getByText("2 activas")).toBeInTheDocument();
    expect(
      document.querySelector("svg.lucide-chevron-right"),
    ).not.toBeInTheDocument();
  });

  it("shows the chevron when there is no active-count badge to show instead", () => {
    render(<CustomerCard name="Juan Pérez" activeCount={0} onClick={vi.fn()} />);

    expect(screen.queryByText(/activa/)).not.toBeInTheDocument();
    expect(document.querySelector("svg.lucide-chevron-right")).toBeInTheDocument();
  });

  it("renders custom trailing content instead of the chevron, and never together with the badge", () => {
    render(
      <CustomerCard
        name="Juan Pérez"
        activeCount={3}
        onClick={vi.fn()}
        trailing={<span>Cambiar</span>}
      />,
    );

    expect(screen.getByText("Cambiar")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-chevron-right")).not.toBeInTheDocument();
    // Badge and trailing ARE allowed together (trailing is an explicit
    // caller override, e.g. an action button) — only badge/chevron are
    // mutually exclusive.
    expect(screen.getByText("3 activas")).toBeInTheDocument();
  });

  it("renders as a plain non-interactive row when no onClick is given, and the phone link still works", () => {
    render(<CustomerCard name="Juan Pérez" phone="5512345678" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /5512345678/ })).toHaveAttribute(
      "href",
      "tel:5512345678",
    );
  });
});
