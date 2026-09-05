import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";

describe("RentalStatusBadge (§16.4, task 3.3)", () => {
  it("always renders the status as text, not just color (ACTIVE)", () => {
    render(<RentalStatusBadge status="ACTIVE" />);
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("always renders the status as text, not just color (RETURNED)", () => {
    render(<RentalStatusBadge status="RETURNED" />);
    expect(screen.getByText("Devuelta")).toBeInTheDocument();
  });

  // Redesign Round 2, Batch 5 (Color Increase Pass): the business owner's
  // color legend reserves --primary (blue) for actions and --success
  // (green) for positive/ongoing states. An ACTIVE rental is a state, not
  // an action, so it must use --success, not --primary.
  it("uses the --success token for ACTIVE (a state, not an action) — never --primary", () => {
    render(<RentalStatusBadge status="ACTIVE" />);
    const badge = screen.getByText("Activa");
    expect(badge).toHaveClass("text-success");
    expect(badge).not.toHaveClass("bg-primary/10");
    expect(badge).not.toHaveClass("text-primary");
  });

  it("keeps RETURNED muted/neutral (a closed-out state, correctly not color-coded)", () => {
    render(<RentalStatusBadge status="RETURNED" />);
    const badge = screen.getByText("Devuelta");
    expect(badge).toHaveClass("bg-muted");
    expect(badge).toHaveClass("text-muted-foreground");
  });

  // design-fidelity Slice C (§4.1, design obs #2224 §C3): the "Activa" pill
  // now carries a small leading dot as a second, redundant color signal
  // (soft-fill + dot) — RETURNED intentionally has neither, since it's a
  // closed-out state that should read as visually quiet.
  it("renders a leading dot indicator only for ACTIVE, never for RETURNED", () => {
    const { container: activeContainer } = render(
      <RentalStatusBadge status="ACTIVE" />,
    );
    expect(
      screen.getByText("Activa").querySelector("span[aria-hidden]"),
    ).not.toBeNull();
    activeContainer.remove();

    render(<RentalStatusBadge status="RETURNED" />);
    expect(
      screen.getByText("Devuelta").querySelector("span[aria-hidden]"),
    ).toBeNull();
  });
});
