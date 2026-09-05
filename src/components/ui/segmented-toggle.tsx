import { Button } from "@/components/ui/button";

/**
 * design-fidelity Slice C (design obs #2224 §C1): extracted from the
 * `PaymentDialog.tsx:139-156` Pago/Ajuste pill-toggle pattern, which its
 * own comment called "the only two-button toggle of this kind in the
 * app" — until now. `CustomerDetailSheet` (Activas/Historial) is the
 * second consumer, and `PaymentDialog` is refactored onto this shared
 * component too, so the "shared" abstraction doesn't immediately leave a
 * divergent copy of its own source pattern two files away.
 *
 * `role="group"` with `aria-pressed` per button — deliberately NOT
 * `role="tablist"`/`role="tab"`: there is no associated `tabpanel`, just a
 * single filtered list/region below, so the tab semantics would be
 * inaccurate.
 */
export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedToggleOption<T>[];
  ariaLabel: string;
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: SegmentedToggleProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "default" : "outline"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="h-9 rounded-full px-4"
        >
          {option.label}
          {option.count !== undefined ? ` ${option.count}` : ""}
        </Button>
      ))}
    </div>
  );
}
