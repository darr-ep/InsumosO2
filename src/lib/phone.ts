/**
 * Formats a 10-digit Mexican phone number into "XXX XXX XXXX" format.
 * If given fewer digits, groups what is available.
 */
export function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Extracts raw digits only, capped at 10 characters.
 */
export function cleanPhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}
