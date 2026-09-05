import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

// shadcn/ui base Label (§9, §17).
//
// `required`'s asterisk is a CSS `::after` (not a real DOM child) on
// purpose: a real child's text is included in an associated `<input>`'s
// accessible name AND in every existing `getByLabelText("Nombre")`-style
// test query (RTL matches a `<label for>`'s raw `textContent`, which
// doesn't respect `aria-hidden`) — that broke ~14 tests across
// CustomerForm/CustomerEditForm/PaymentDialog/RentalNewScreen the first
// time this was tried. `::after` content isn't part of the DOM tree, so
// jsdom's `textContent` (and every existing exact-text test query) stays
// unaffected, while real browsers still expose generated content in the
// accessible name per the ARIA accname spec.
function Label({
  className,
  required = false,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        required && "after:content-['_*'] after:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
