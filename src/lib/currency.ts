// Shared MXN currency formatter (§22 comprobantes, §7.2 "Último pago: $X").
// Extracted here starting Phase 2 since PaymentSuggestionField, PaymentDialog
// and DashboardScreen all need it — ReceiptDialog.tsx (task 1.9) keeps its
// own local instance, not touched here.
const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function formatCurrencyMXN(amount: number): string {
  return currencyFormatter.format(amount);
}
