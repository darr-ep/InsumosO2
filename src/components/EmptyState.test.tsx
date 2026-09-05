import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

/**
 * design-fidelity Slice C (design obs #2224 §5, task 5): extends this
 * pre-existing component with an optional action-button slot, needed by
 * `CustomerDetailSheet`'s "Sin rentas" empty state (+ Nueva renta CTA).
 */
describe("EmptyState", () => {
  it("renders the title and description without an action by default", () => {
    render(
      <EmptyState icon={PackageOpen} title="Sin rentas" description="Aún no hay rentas para este cliente." />,
    );

    expect(screen.getByText("Sin rentas")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an action button and calls onClick when tapped, given the optional action prop", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        icon={PackageOpen}
        title="Sin rentas"
        action={{ label: "+ Nueva renta", onClick }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "+ Nueva renta" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
