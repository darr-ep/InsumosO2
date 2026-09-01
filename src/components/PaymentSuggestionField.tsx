import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.2 ("Ver 'Último pago: $X' (referencia informativa)" + "monto
 * sugerido = último pago (editable)") + Anexo A.7 + CU5. Purely
 * presentational — the caller (`PaymentDialog`, task 2.4) computes
 * `suggestedAmount` via domain/payments/payment.ts#suggestedPaymentAmount
 * and owns the editable `value` state.
 */

export interface PaymentSuggestionFieldProps {
  suggestedAmount: number;
  value: string;
  onChange: (value: string) => void;
  hasPreviousPayment: boolean;
}

export function PaymentSuggestionField({
  suggestedAmount,
  value,
  onChange,
  hasPreviousPayment,
}: PaymentSuggestionFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="payment-amount">Monto</Label>
      <p className="text-muted-foreground text-sm">
        {hasPreviousPayment ? "Último pago" : "Renta"}:{" "}
        {formatCurrencyMXN(suggestedAmount)}
      </p>
      <Input
        id="payment-amount"
        type="number"
        inputMode="decimal"
        placeholder={String(suggestedAmount)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
