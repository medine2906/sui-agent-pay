"use client";

import { useMemo } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { MODULE_NAME, PACKAGE_ID, fromBaseUnits } from "@/lib/constants";

const DECIMALS = 9;

type PaymentExecutedEvent = {
  cap_id: string;
  agent: string;
  recipient: string;
  amount: string;
  spent_total: string;
};

export function PaymentHistory() {
  const account = useCurrentAccount();

  const { data, isLoading } = useSuiClientQuery(
    "queryEvents",
    {
      query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentExecuted` },
      limit: 50,
      order: "descending",
    },
    { enabled: PACKAGE_ID !== "0x0" },
  );

  const events = useMemo(() => {
    if (!data) return [];
    return data.data
      .map((e) => ({
        json: e.parsedJson as PaymentExecutedEvent,
        timestamp: e.timestampMs,
        digest: e.id.txDigest,
      }))
      .filter((e) => !account || e.json.agent === account.address || e.json.recipient === account.address);
  }, [data, account]);

  if (PACKAGE_ID === "0x0") {
    return <p className="muted">NEXT_PUBLIC_PACKAGE_ID ayarlanmadı.</p>;
  }
  if (isLoading) {
    return <p className="muted">Yükleniyor...</p>;
  }
  if (events.length === 0) {
    return <p className="muted">Henüz bir ödeme işlemi yok.</p>;
  }

  return (
    <div>
      {events.map((e) => (
        <div className="event-item" key={e.digest + e.json.spent_total}>
          <strong>{fromBaseUnits(e.json.amount, DECIMALS)}</strong> ödendi &rarr;{" "}
          {e.json.recipient.slice(0, 10)}...
          <div className="cap-meta">
            {e.timestamp && new Date(Number(e.timestamp)).toLocaleString("tr-TR")} · tx {e.digest.slice(0, 10)}...
          </div>
        </div>
      ))}
    </div>
  );
}
