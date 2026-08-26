"use client";

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { coinWithBalance } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { COIN_TYPE, MODULE_NAME, PACKAGE_ID, toBaseUnits } from "@/lib/constants";

const DECIMALS = 9; // SUI has 9 decimals; adjust per COIN_TYPE (e.g. USDC = 6) if needed.

const FREQUENCY_TO_MS: Record<string, number> = {
  once: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

export function CreateCapForm() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [amount, setAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!account) return;
    if (PACKAGE_ID === "0x0") {
      setError("NEXT_PUBLIC_PACKAGE_ID henüz ayarlanmadı. Önce contract'ı deploy edin.");
      return;
    }

    try {
      const maxAmount = toBaseUnits(amount, DECIMALS);
      const deposit = toBaseUnits(depositAmount || amount, DECIMALS);
      const expiry = BigInt(Date.now() + (FREQUENCY_TO_MS[frequency] ?? FREQUENCY_TO_MS.monthly));

      const tx = new Transaction();
      const depositCoin = coinWithBalance({ balance: deposit, type: COIN_TYPE })(tx);

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::create_spending_cap`,
        typeArguments: [COIN_TYPE],
        arguments: [
          depositCoin,
          tx.pure.address(agentAddress),
          tx.pure.u64(maxAmount),
          tx.pure.address(recipient),
          tx.pure.u64(expiry),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            setSuccess(`İzin oluşturuldu. İşlem: ${result.digest}`);
            setAmount("");
            setDepositAmount("");
            setRecipient("");
            setAgentAddress("");
          },
          onError: (err) => setError(err.message),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Doğal dil talimatı (bilgi amaçlı)</label>
        <input
          type="text"
          placeholder='Örn: "Her ay 50 USDC&apos;yi 0x123... adresine gönder"'
          disabled
        />
      </div>

      <div className="row">
        <div className="field">
          <label>Miktar (toplam limit)</label>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50"
          />
        </div>
        <div className="field">
          <label>İlk yatırılacak miktar (escrow)</label>
          <input
            type="number"
            step="any"
            min="0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder={amount || "50"}
          />
        </div>
      </div>

      <div className="field">
        <label>Alıcı adresi</label>
        <input
          type="text"
          required
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x123..."
        />
      </div>

      <div className="field">
        <label>Ajan (agent) cüzdan adresi</label>
        <input
          type="text"
          required
          value={agentAddress}
          onChange={(e) => setAgentAddress(e.target.value)}
          placeholder="0xagent..."
        />
      </div>

      <div className="field">
        <label>Sıklık / geçerlilik süresi</label>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="once">Tek seferlik (1 gün geçerli)</option>
          <option value="weekly">Haftalık</option>
          <option value="monthly">Aylık</option>
          <option value="yearly">Yıllık</option>
        </select>
      </div>

      <button className="btn-primary" type="submit" disabled={isPending}>
        {isPending ? "Gönderiliyor..." : "Harcama İzni Oluştur"}
      </button>

      {error && <p className="error-text">{error}</p>}
      {success && <p className="muted">{success}</p>}
    </form>
  );
}
