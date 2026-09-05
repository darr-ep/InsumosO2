import { Input } from "@/components/ui/input";

/**
 * Formats a raw digit string/number as a whole-peso amount: "$ " (dollar
 * sign, literal space) + thousands-comma grouping, e.g. "2500" → "$ 2,500".
 * No decimals — every money `Input` in this app is whole pesos only. Returns
 * `""` for an empty/zero-ish input so callers can fall back to a plain
 * placeholder instead of showing "$ 0".
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared formatter, tightly coupled to this component's value contract; not worth a separate file.
export function formatCurrencyDigits(value: string | number): string {
  const digits =
    typeof value === "number" ? String(value) : value.replace(/\D/g, "");

  if (!digits || Number(digits) === 0) {
    return "";
  }

  return "$ " + Number(digits).toLocaleString("es-MX");
}

export interface CurrencyInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Wraps `Input` to live-format a peso amount as the user types — same
 * raw-digit-string contract every money field in this app already uses
 * (`value`/`onChange` in, out), so swapping this in for a plain
 * `type="number"` Input needs no changes to surrounding state logic.
 *
 * `type="text"` (not `type="number"`): a native number input rejects the
 * "$ 2,500" display string outright. Cursor always lands at the end after
 * each keystroke, since the displayed string is fully re-derived every
 * render — accepted tradeoff, matches how simple POS money inputs behave
 * (type/backspace from the end); not worth custom selection-restoring logic
 * for this app's use case.
 *
 * `autoComplete="off"`: switching to `type="text"` made this eligible for
 * the browser/keyboard's own "previously typed values" suggestions (a real
 * `type="number"` input is exempt from that on most platforms) — a
 * suggestion chip showing an old amount was mistaken for the placeholder.
 */
export function CurrencyInput({
  id,
  value,
  onChange,
  placeholder = "$ 0",
  className,
}: CurrencyInputProps) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={formatCurrencyDigits(value)}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      className={className}
    />
  );
}
