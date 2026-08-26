export const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? "0x0";

export const COIN_TYPE = process.env.NEXT_PUBLIC_COIN_TYPE ?? "0x2::sui::SUI";

export const MODULE_NAME = "spending_cap";

export const SPENDING_CAP_STRUCT = `${PACKAGE_ID}::${MODULE_NAME}::SpendingCap<${COIN_TYPE}>`;

export const SUI_CLOCK_OBJECT_ID = "0x6";

/** Convert a whole-token amount (e.g. "50") into base units (u64 string) given decimals. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  const paddedFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  const wholeUnits = BigInt(whole || "0") * BigInt(10 ** decimals);
  const fracUnits = BigInt(paddedFrac || "0");
  return wholeUnits + fracUnits;
}

export function fromBaseUnits(amount: bigint | string, decimals: number): string {
  const value = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const frac = value % divisor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}
