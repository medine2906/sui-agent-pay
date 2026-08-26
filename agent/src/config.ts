import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  agentPrivateKey: required("AGENT_PRIVATE_KEY"),
  rpcUrl: process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443",
  packageId: required("PACKAGE_ID"),
  moduleName: process.env.MODULE_NAME || "spending_cap",
  coinType: process.env.COIN_TYPE || "0x2::sui::SUI",
  spendingCapIds: required("SPENDING_CAP_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  paymentAmount: BigInt(process.env.PAYMENT_AMOUNT || "0"),
  recipientAddress: required("RECIPIENT_ADDRESS"),
  cronSchedule: process.env.CRON_SCHEDULE || "0 9 1 * *",
};
