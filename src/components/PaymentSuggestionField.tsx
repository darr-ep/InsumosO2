import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.2 ("Ver 'Último pago: $X' (referencia informativa)" + "monto
 * sugerido = último pago (editable)") + Anexo A.7 + CU5. Purely
 * presentational — the caller (`PaymentDialog`, task 2.4) computes
 * `suggestedAmount` via domain/payments/payment.ts#suggestedPaymentAmount
 * and owns the editable `value` state.
 *
 * Post-launch UX fix: once there's payment history, `suggestedAmount` is
 * just the LAST payment — if payments have drifted down over time (informal
 * discounts, etc.), the originally agreed rent became invisible with only
 * one reference line. Now always shows `initialRentAmount` ("Renta
 * acordada") alongside `suggestedAmount` ("Último pago") when there's
 * history, so a real drift is visible instead of hidden. `ReturnDialog`
 * mirrors this exact same two-line wording for consistency.
 */

export interface PaymentSuggestionFieldProps {
  suggestedAmount: number;
  initialRentAmount: number;
  value: string;
  onChange: (value: string) => void;
  hasPreviousPayment: boolean;
}

export function PaymentSuggestionField({
  suggestedAmount,
  initialRentAmount,
  value,
  onChange,
  hasPreviousPayment,
}: PaymentSuggestionFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="payment-amount">Monto</Label>
      {hasPreviousPayment ? (
        <>
          <p className="text-muted-foreground text-sm">
            Renta acordada: {formatCurrencyMXN(initialRentAmount)}
          </p>
          <p className="text-muted-foreground text-sm">
            Último pago: {formatCurrencyMXN(suggestedAmount)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Renta: {formatCurrencyMXN(initialRentAmount)}
        </p>
      )}
      <CurrencyInput
        id="payment-amount"
        placeholder="$ 0"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
