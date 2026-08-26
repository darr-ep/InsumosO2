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
});
