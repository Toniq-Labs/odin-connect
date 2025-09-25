import { BaseToken } from "../models/token";

export function convertToOdinAmount(
  numberStr: string | number,
  token: Pick<BaseToken, "decimals" | "divisibility"> = {
    decimals: 3,
    divisibility: 8,
  }
) {
  const places = token.decimals + token.divisibility;
  // Cast input to String and Remove any whitespace
  numberStr =
    typeof numberStr === "string" ? numberStr.trim() : String(numberStr);

  if (isNaN(+numberStr)) {
    return 0n;
  }

  // Split the number into integer and decimal parts
  let [integerPart, decimalPart = ""] = numberStr.split(".");

  // Truncate decimal part to 11 places
  decimalPart = decimalPart.slice(0, places);

  // Pad with zeros if decimal part is shorter than 11 digits
  decimalPart = decimalPart.padEnd(places, "0");

  // Combine integer and decimal parts, removing any leading zeros from integer part
  // but preserving a single zero if the integer part is only zero
  integerPart = integerPart.replace(/^0+(?=\d)/, "");
  if (integerPart === "") integerPart = "0";

  // Combine parts and convert to BigInt
  const result = BigInt(integerPart + decimalPart);

  return result;
}
