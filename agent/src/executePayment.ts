import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { config } from "./config.js";

const SUI_CLOCK_OBJECT_ID = "0x6";

export function loadAgentKeypair(): Ed25519Keypair {
  const { schema, secretKey } = decodeSuiPrivateKey(config.agentPrivateKey);
  if (schema !== "ED25519") {
    throw new Error(`Unsupported key scheme: ${schema}. Only ed25519 agent keys are supported.`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export async function executePaymentForCap(
  client: SuiClient,
  keypair: Ed25519Keypair,
  capId: string,
  amount: bigint,
  recipient: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::execute_payment`,
    typeArguments: [config.coinType],
    arguments: [
      tx.object(capId),
      tx.pure.address(recipient),
      tx.pure.u64(amount),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status.status !== "success") {
    throw new Error(
      `Payment failed for cap ${capId}: ${result.effects?.status.error ?? "unknown error"}`,
    );
  }

  return result.digest;
}
