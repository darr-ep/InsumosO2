import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyInput, formatCurrencyDigits } from "@/components/ui/currency-input";

// A controlled `CurrencyInput` needs real state to type into across
// keystrokes — a bare `onChange` mock that never updates `value` would reset
// the field to empty after every character (React controlled-input
// behavior), so `userEvent.type` would only ever report the last keystroke.
function ControlledCurrencyInput({
  onChange,
}: {
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <CurrencyInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("formatCurrencyDigits", () => {
  it("formats a 4+ digit value with a thousands comma and a $ prefix", () => {
    expect(formatCurrencyDigits("2500")).toBe("$ 2,500");
  });

  it("returns an empty string for an empty or zero value", () => {
    expect(formatCurrencyDigits("")).toBe("");
    expect(formatCurrencyDigits("0")).toBe("");
    expect(formatCurrencyDigits(0)).toBe("");
  });
});

describe("CurrencyInput", () => {
  it("shows the placeholder when the value is empty", () => {
    render(<CurrencyInput value="" onChange={() => {}} />);

    expect(screen.getByPlaceholderText("$ 0")).toBeInTheDocument();
  });

  it("displays a formatted value and reports only raw digits on change", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ControlledCurrencyInput onChange={onChange} />);

    await user.type(screen.getByPlaceholderText("$ 0"), "2500");

    // Each keystroke reports the raw digits typed so far (no $ or comma).
    expect(onChange).toHaveBeenLastCalledWith("2500");
    expect(screen.getByDisplayValue("$ 2,500")).toBeInTheDocument();
  });

  it("renders an already-set value with the $ and comma formatting", () => {
    render(<CurrencyInput value="2500" onChange={() => {}} />);

    expect(screen.getByDisplayValue("$ 2,500")).toBeInTheDocument();
  });
});
