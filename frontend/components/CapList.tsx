"use client";

import { useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
  useSuiClientQueries,
} from "@mysten/dapp-kit";
import { COIN_TYPE, MODULE_NAME, PACKAGE_ID, fromBaseUnits } from "@/lib/constants";

const DECIMALS = 9;

type CapFields = {
  id: { id: string };
  owner: string;
  agent: string;
  max_amount: string;
  spent: string;
  allowed_recipient: string;
  expiry: string;
  active: boolean;
  escrow: string;
};

export function CapList() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const { data: createdEvents, isLoading: loadingEvents, refetch: refetchEvents } =
    useSuiClientQuery(
      "queryEvents",
      {
        query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::CapCreated` },
        limit: 50,
        order: "descending",
      },
      { enabled: PACKAGE_ID !== "0x0" },
    );

  const capIds = useMemo(() => {
    if (!createdEvents || !account) return [];
    return createdEvents.data
      .filter((e) => {
        const p = e.parsedJson as { owner?: string; agent?: string; cap_id?: string };
        return p.owner === account.address || p.agent === account.address;
      })
      .map((e) => (e.parsedJson as { cap_id: string }).cap_id);
  }, [createdEvents, account]);

  const objectQueries = useSuiClientQueries({
    queries: capIds.map((id) => ({
      method: "getObject" as const,
      params: { id, options: { showContent: true } },
    })),
    combine: (results) => ({
      data: results.map((r) => r.data),
      isLoading: results.some((r) => r.isLoading),
    }),
  });

  const caps = useMemo(() => {
    return objectQueries.data
      .map((obj) => {
        const content = obj?.data?.content;
        if (!content || content.dataType !== "moveObject") return null;
        return content.fields as unknown as CapFields;
      })
      .filter((c): c is CapFields => c !== null);
  }, [objectQueries.data]);

  const handleRevoke = (capId: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::revoke_cap`,
      typeArguments: [COIN_TYPE],
      arguments: [tx.object(capId)],
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: () => refetchEvents(),
      },
    );
  };

  if (PACKAGE_ID === "0x0") {
    return <p className="muted">NEXT_PUBLIC_PACKAGE_ID ayarlanmadı.</p>;
  }
  if (loadingEvents || objectQueries.isLoading) {
    return <p className="muted">Yükleniyor...</p>;
  }
  if (caps.length === 0) {
    return <p className="muted">Henüz bir harcama izniniz yok.</p>;
  }

  return (
    <div>
      {caps.map((cap) => {
        const isExpired = Number(cap.expiry) < Date.now();
        const isOwner = account?.address === cap.owner;
        return (
          <div className="cap-item" key={cap.id.id}>
            <div>
              <div>
                <strong>
                  {fromBaseUnits(cap.spent, DECIMALS)} / {fromBaseUnits(cap.max_amount, DECIMALS)}
                </strong>{" "}
                harcandı
                <span className={`badge ${cap.active && !isExpired ? "badge-active" : "badge-inactive"}`}>
                  {cap.active ? (isExpired ? "Süresi Doldu" : "Aktif") : "İptal Edildi"}
                </span>
              </div>
              <div className="cap-meta">
                Alıcı: {cap.allowed_recipient.slice(0, 10)}...
                <br />
                Ajan: {cap.agent.slice(0, 10)}...
                <br />
                Escrow bakiyesi: {fromBaseUnits(cap.escrow, DECIMALS)}
                <br />
                Son geçerlilik: {new Date(Number(cap.expiry)).toLocaleString("tr-TR")}
              </div>
            </div>
            {isOwner && cap.active && (
              <button className="btn-danger" onClick={() => handleRevoke(cap.id.id)}>
                İptal Et
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
