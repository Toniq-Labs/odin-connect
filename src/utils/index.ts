import { BaseToken, Token } from "../models/token";

export { isDelegationValid } from "./session";

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

type TokenValue = string | File | null | bigint;

export const createTokenValidators: Partial<
  Record<keyof Token, (value: TokenValue) => string | undefined>
> = {
  name: validateName,
  image: validateImage,
  ticker: validateTicker,
  description: validateDescription,
  twitter: validateTwitter,
  website: validateWebsite,
  telegram: validateTelegram,
};

function validateName(name: TokenValue): string | undefined {
  if (typeof name !== "string") {
    return "Name must be a string.";
  }
  if (!name || name.trim() === "") {
    return "Name is required.";
  }
  if (name.length < 3 || name.length > 30) {
    return "Name must be between 3 and 30 characters.";
  }
}

function validateDescription(description: TokenValue): string | undefined {
  if (!description) {
    return;
  }
  if (typeof description !== "string") {
    return "Description must be a string.";
  }
  if (description && description.length > 100) {
    return "Description must not exceed 100 characters.";
  }
}

function validateTicker(ticker: TokenValue): string | undefined {
  if (typeof ticker !== "string") {
    return "Ticker must be a string.";
  }
  if (!ticker || ticker.trim() === "") {
    return "Ticker is required.";
  }
  if (ticker.length < 3 || ticker.length > 10) {
    return "Ticker must be between 3 and 10 characters.";
  }
  if (!/^[A-Z0-9]+$/.test(ticker)) {
    return "Ticker must be alphanumeric characters in uppercase only.";
  }
  if (!/(?=(.*[A-Z].*[A-Z]))/.test(ticker)) {
    return "Ticker must have at least 2 alpha characters.";
  }
}

function validateImage(file: TokenValue): string | undefined {
  if (!(file instanceof File)) {
    return "Image must be a file.";
  }
  const allowedFileTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg",
    "image/gif",
    "image/avif",
  ];
  const maxFileSize = 200 * 1024; // 200KB

  if (!file) {
    return "Image file is required.";
  }

  if (!allowedFileTypes.includes(file.type)) {
    return `Invalid file type. Allowed types are: ${allowedFileTypes.join(
      ", "
    )}`;
  }

  if (file.size > maxFileSize) {
    return `File size exceeds the maximum limit of ${maxFileSize / 1024}KB.`;
  }
}

function validateTwitter(value: TokenValue): string | undefined {
  // it's optional
  if (!value) {
    return;
  }
  if (typeof value !== "string") {
    return "Twitter handle must be a string.";
  }
  if (
    value &&
    !/^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[A-Za-z0-9_]{1,15}\/?$/.test(
      value
    )
  ) {
    return "Twitter must be a valid twitter URL.";
  }
}

function validateWebsite(value: TokenValue): string | undefined {
  if (!value) {
    return;
  }
  if (typeof value !== "string") {
    return "Website must be a string.";
  }
  if (
    value &&
    !/^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(\/[\w-./?%&=]*)?$/.test(value)
  ) {
    return "Website must be a valid URL.";
  }
}

function validateTelegram(value: TokenValue): string | undefined {
  if (!value) {
    return;
  }
  if (typeof value !== "string") {
    return "Telegram must be a string.";
  }
  if (
    value &&
    !/^(https?:\/\/)?(t\.me|telegram\.me|telegram\.org)\/[A-Za-z0-9_]{5,32}\/?$/.test(
      value
    )
  ) {
    return "Telegram must be a valid telegram URL.";
  }
}
