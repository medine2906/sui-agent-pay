"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CreateCapForm } from "@/components/CreateCapForm";
import { CapList } from "@/components/CapList";
import { PaymentHistory } from "@/components/PaymentHistory";

export default function Home() {
  const account = useCurrentAccount();

  return (
    <main>
      <div className="header-row">
        <div>
          <h1>Sui Agent Pay</h1>
          <p className="subtitle">Otonom ödeme ajanınıza harcama izni verin ve yönetin</p>
        </div>
        <ConnectButton />
      </div>

      {!account ? (
        <div className="card">
          <p className="muted">Devam etmek için Sui cüzdanınızı bağlayın.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Yeni Harcama İzni (Spending Cap) Oluştur</h2>
            <CreateCapForm />
          </div>

          <div className="card">
            <h2>Aktif Harcama İzinleri</h2>
            <CapList />
          </div>

          <div className="card">
            <h2>İşlem Geçmişi</h2>
            <PaymentHistory />
          </div>
        </>
      )}
    </main>
  );
}
