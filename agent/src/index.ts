import cron from "node-cron";
import { SuiClient } from "@mysten/sui/client";
import { config } from "./config.js";
import { executePaymentForCap, loadAgentKeypair } from "./executePayment.js";

const client = new SuiClient({ url: config.rpcUrl });
const keypair = loadAgentKeypair();

async function runOnce(): Promise<void> {
  const agentAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`[agent] running as ${agentAddress}, ${config.spendingCapIds.length} cap(s) configured`);

  for (const capId of config.spendingCapIds) {
    try {
      const digest = await executePaymentForCap(
        client,
        keypair,
        capId,
        config.paymentAmount,
        config.recipientAddress,
      );
      console.log(`[agent] cap ${capId}: payment executed, tx ${digest}`);
    } catch (err) {
      console.error(`[agent] cap ${capId}: failed —`, err instanceof Error ? err.message : err);
    }
  }
}

async function main(): Promise<void> {
  const runOnceOnly = process.argv.includes("--once");

  if (runOnceOnly) {
    await runOnce();
    return;
  }

  console.log(`[agent] scheduling payments with cron "${config.cronSchedule}"`);
  cron.schedule(config.cronSchedule, () => {
    runOnce().catch((err) => console.error("[agent] run failed:", err));
  });
}

main().catch((err) => {
  console.error("[agent] fatal error:", err);
  process.exit(1);
});
