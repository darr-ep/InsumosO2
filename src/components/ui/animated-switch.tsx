import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Owner reversal (post-implementation audit, design-fidelity): the owner
 * explicitly reversed the earlier decision behind `ui/segmented-toggle.tsx`
 * (a `role="group"` two-separate-buttons pattern). The real design (Pencil
 * frames "Modal Cliente" `TelOa` and "Modal Renta" `vY2FC`, Activas/
 * Historial and Pago/Ajuste) shows a genuine sliding/animated switch: a
 * single track with one indicator that animates between two positions, not
 * two independently-styled buttons swapping variants instantly.
 *
 * This component is built alongside `segmented-toggle.tsx` (not a
 * replacement — that file is still used by its 2 existing consumers,
 * `CustomerDetailSheet.tsx` and `PaymentDialog.tsx`, which a later wave will
 * migrate onto this one) with a matching functional API shape: `value`,
 * `onChange`, `options` (`value`/`label`/optional `count`), `ariaLabel` —
 * so callers won't need a rewrite when they switch over.
 *
 * ARIA: `role="radiogroup"` + `role="radio"` per option, `aria-checked`,
 * roving `tabIndex`, and Left/Right/Home/End arrow-key navigation per the
 * WAI-ARIA APG radio-group pattern — a genuine "select exactly one of two
 * mutually exclusive states" widget, unlike `segmented-toggle.tsx`'s
 * deliberately-not-tablist choice (there, no `role` fit better than
 * `group`; here, `radiogroup` is the correct native semantic for a
 * slides-between-2-states switch).
 *
 * The indicator's `width` is a fixed CSS percentage of the track's content
 * box (`(100% - padding) / optionCount`); its `transform: translateX(N *
 * 100%)` then shifts by N times ITS OWN width (percentages in `transform`
 * are relative to the element's own bounding box, not the parent), which
 * lands it exactly under option N regardless of the track's real pixel
 * width — no measured/JS-computed layout needed, just a CSS transition on
 * `transform` for the slide animation.
 */
export interface AnimatedSwitchOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface AnimatedSwitchProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: AnimatedSwitchOption<T>[];
  ariaLabel: string;
  className?: string;
}

export function AnimatedSwitch<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: AnimatedSwitchProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function selectByIndex(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectByIndex((selectedIndex + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectByIndex((selectedIndex - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        selectByIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectByIndex(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shrink-0 shadow-2xs",
        className,
      )}
    >
      <div
        aria-hidden="true"
        data-testid="animated-switch-indicator"
        className="absolute inset-y-1 left-1 rounded-full bg-primary shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => selectByIndex(index)}
            className={cn(
              "relative z-10 flex-1 rounded-full px-4 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap shrink-0",
              isSelected
                ? "font-bold text-primary-foreground"
                : "font-medium text-muted-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? ` ${option.count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
