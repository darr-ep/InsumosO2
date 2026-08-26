import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentSuggestionField } from "@/components/PaymentSuggestionField";

describe("PaymentSuggestionField (§7.2, Anexo A.7, CU5)", () => {
  it("shows 'Último pago' as the reference label when there is payment history", () => {
    render(
      <PaymentSuggestionField
        suggestedAmount={3000}
        value="3000"
        onChange={() => {}}
        hasPreviousPayment
      />,
    );

    expect(screen.getByText("Último pago: $3,000.00")).toBeInTheDocument();
  });

  it("shows 'Renta' as the reference label for the first payment (no history, §A.7)", () => {
    render(
      <PaymentSuggestionField
        suggestedAmount={2800}
        value="2800"
        onChange={() => {}}
        hasPreviousPayment={false}
      />,
    );

    expect(screen.getByText("Renta: $2,800.00")).toBeInTheDocument();
  });

  it("lets the user change the suggested amount (§7.2: editable)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentSuggestionField
        suggestedAmount={3000}
        value="3000"
        onChange={onChange}
        hasPreviousPayment
      />,
    );

    await user.clear(screen.getByLabelText("Monto"));
    await user.type(screen.getByLabelText("Monto"), "3500");

    expect(onChange).toHaveBeenCalled();
  });
});
