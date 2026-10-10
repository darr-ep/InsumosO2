/**
 * Formats a 10-digit Mexican phone number into "XXX XXX XXXX" format.
 * If given fewer digits, groups what is available.
 */
export function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const is2DigitPrefix = /^(55|56|33|81)/.test(digits);

  if (is2DigitPrefix) {
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 6) {
      return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }

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

/**
 * Calculates the appropriate cursor position in a formatted phone string
 * after a user types or deletes a character in an input field.
 */
export function getCursorPositionAfterFormat(
  rawTargetValue: string,
  selectionStart: number | null,
  formattedResult: string,
): number {
  if (selectionStart === null) {
    return formattedResult.length;
  }

  const digitsBefore = rawTargetValue.slice(0, selectionStart).replace(/\D/g, "").length;

  if (digitsBefore === 0) {
    return 0;
  }

  let digitCount = 0;
  for (let i = 0; i < formattedResult.length; i++) {
    if (/\d/.test(formattedResult[i])) {
      digitCount++;
      if (digitCount === digitsBefore) {
        return i + 1;
      }
    }
  }

  return formattedResult.length;
}
