import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Redesign — UX/UI pass: shared −/+ stepper primitive, extracted so the
 * business-owner-editable stock totals (`DashboardStats`'s "Editar total de
 * concentradores/tanques" dialog) get the same tappable stepper `RentalNewScreen`'s
 * `ItemQuantityPicker` already established for "Qué se renta", instead of a
 * bare `<input type="number">`. `ItemQuantityPicker` itself is left as-is
 * (untouched, already tested) — it renders a *pair* of these per row with
 * per-item labels baked into its own `aria-label`s, a different shape than
 * this single-value primitive.
 */
export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  decreaseLabel: string;
  increaseLabel: string;
  valueLabel: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  decreaseLabel,
  increaseLabel,
  valueLabel,
}: QuantityStepperProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <span className="w-10 text-center text-lg font-semibold" aria-label={valueLabel}>
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={increaseLabel}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
