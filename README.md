# Sui Agent Pay

Sui üzerinde çalışan, kullanıcı adına önceden tanımlanmış kurallar dahilinde
ödeme yapabilen otonom bir ödeme ajanı. Kullanıcı private key'ini paylaşmaz;
bunun yerine on-chain bir **capability** (`SpendingCap`) oluşturur ve bu
object, ajan cüzdanının hangi adrese, ne kadara kadar, ne zamana dek ödeme
yapabileceğini tanımlar.

## Proje yapısı

```
/move      Sui Move smart contract'ları (spending_cap paketi)
/frontend  Next.js + TypeScript + @mysten/dapp-kit web arayüzü
/agent     Node.js off-chain servis: execute_payment'ı zamanlanmış olarak çağırır
```

## Mimari özeti

- `SpendingCap<T>` shared bir object'tir; sahibi (`owner`) onu oluştururken
  `Coin<T>` yatırır (escrow). Ajan private key veya coin object'i asla
  eline almaz — sadece `execute_payment` çağırma **yetkisine** sahiptir.
- `execute_payment`, çağıranın `agent` adresi olduğunu, cap'in aktif ve
  süresinin dolmamış olduğunu, alıcının `allowed_recipient` ile eşleştiğini
  ve `spent + amount <= max_amount` olduğunu kontrol eder; sonra escrow'dan
  ödemeyi gönderir.
- `revoke_cap`, sadece `owner` tarafından çağrılabilir, cap'i anında
  geçersiz kılar ve kalan escrow bakiyesini owner'a iade eder.
- `CapCreated`, `PaymentExecuted`, `CapRevoked` event'leri her işlemde
  emit edilir; frontend işlem geçmişini bunlardan okur.

---

## 1) Move contract — build, test, testnet deploy

### Gereksinimler

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (testnet ile aynı sürüm, bu depo `testnet-v1.40.1` framework rev'ine pinlenmiştir)

### Build & test

```bash
cd move
sui move build
sui move test
```

8 unit testi içerir: başarılı ödeme, limit aşımı, süre dolması, yanlış
alıcı, yetkisiz çağıran, iptal sonrası ödeme engeli, iptal sonrası owner'a
para iadesi, owner olmayanın iptal edememesi.

### Testnet'e deploy

> Not: Bu depo bu oturumda (sandboxed ajan ortamı) hazırlandı; ortamın ağ
> politikası Sui RPC uç noktalarına (`fullnode.testnet.sui.io`) erişimi
> engelliyor, bu yüzden gerçek deploy işlemini **siz** kendi makinenizde
> çalıştırmalısınız. Adımlar:

```bash
# 1. Testnet ortamını ekleyin ve aktif edin
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet

# 2. Yeni bir adres oluşturun (veya var olanı kullanın)
sui client new-address ed25519
sui client switch --address <yeni-adresiniz>

# 3. Testnet SUI alın (faucet)
sui client faucet
# veya https://faucet.sui.io/ üzerinden manuel talep edin

# 4. Paketi deploy edin
cd move
sui client publish --gas-budget 100000000
```

Çıktıda göreceğiniz **Package ID**'yi not edin — frontend ve agent bu ID'yi
kullanacak (`NEXT_PUBLIC_PACKAGE_ID`, `PACKAGE_ID`).

### Testnet'te manuel test (CLI ile)

```bash
# Owner: yeni bir spending cap oluştur (100 SUI limit, 30 gün geçerli, 10 SUI escrow)
sui client call --package <PACKAGE_ID> --module spending_cap --function create_spending_cap \
  --type-args 0x2::sui::SUI \
  --args <deposit-coin-object-id> <agent-address> 100000000000 <allowed-recipient-address> <expiry-ms-timestamp> \
  --gas-budget 50000000

# Agent: ödeme çalıştır (agent cüzdanıyla imzalanmalı)
sui client call --package <PACKAGE_ID> --module spending_cap --function execute_payment \
  --type-args 0x2::sui::SUI \
  --args <spending-cap-object-id> <allowed-recipient-address> 1000000000 0x6 \
  --gas-budget 50000000

# Owner: cap'i iptal et
sui client call --package <PACKAGE_ID> --module spending_cap --function revoke_cap \
  --type-args 0x2::sui::SUI \
  --args <spending-cap-object-id> \
  --gas-budget 50000000
```

---

## 2) Frontend

```bash
cd frontend
cp .env.local.example .env.local
# .env.local içine deploy'dan aldığınız NEXT_PUBLIC_PACKAGE_ID'yi yazın
npm install
npm run dev
```

`http://localhost:3000` adresine gidin, Sui Wallet (testnet moduna alınmış)
ile bağlanın:

1. **Yeni Harcama İzni Oluştur** formunda miktar, alıcı adresi, ajan cüzdan
   adresi ve sıklığı (süre) girip işlemi onaylayın.
2. **Aktif Harcama İzinleri** bölümünde cap'lerinizi ve harcanan/limit
   oranını görün; owner'ıysanız **İptal Et** ile anında iptal edebilirsiniz.
3. **İşlem Geçmişi** bölümünde `PaymentExecuted` event'lerinden gelen
   geçmiş ödemeleri görürsünüz.

`NEXT_PUBLIC_COIN_TYPE` ile SUI yerine testnet USDC coin type'ını
girerseniz (örn. Circle'ın testnet USDC paket adresi), form o coin
cinsinden çalışır — `DECIMALS` sabitini (`components/CreateCapForm.tsx`,
`components/CapList.tsx`) USDC için 6'ya güncellemeyi unutmayın.

---

## 3) Agent servisi

```bash
cd agent
cp .env.example .env
# .env içine PACKAGE_ID, SPENDING_CAP_IDS, AGENT_PRIVATE_KEY, RECIPIENT_ADDRESS vs. girin
npm install
npm run run-once   # tek seferlik test çalıştırması
npm start           # CRON_SCHEDULE'a göre sürekli çalışır
```

Agent'ın private key'ini almak için (test amaçlı, yeni ajan cüzdanı):

```bash
sui client new-address ed25519 --alias agent
sui keytool export --key-identity agent
```

Çıkan `suiprivkey1...` değerini `.env` dosyasındaki `AGENT_PRIVATE_KEY`'e
yazın. Ajan cüzdanının testnet gas'ı için de faucet'ten SUI alması gerekir
(`sui client faucet --address <agent-address>`), çünkü işlem ücretini agent
öder (aktardığı miktar escrow'dan gelir, gas kendi cüzdanından).

### ⚠️ Production / mainnet güvenlik notu

`.env` dosyasında düz metin private key tutmak **yalnızca test/testnet
içindir**. Mainnet'te:

- Private key'i bir KMS/HSM'de tutun (AWS KMS, GCP Cloud KMS, HashiCorp
  Vault Transit, veya Sui'nin desteklediği bir MPC/threshold imzalama
  servisi) ve imzalama işlemini oradan yapın — key hiçbir zaman servis
  belleğine düz metin olarak yüklenmemeli.
- Agent servisini en az ayrıcalık ile çalıştırın: yalnızca kendi
  `SPENDING_CAP_IDS` listesindeki cap'lere erişimi olsun.
- `max_amount`, `expiry` ve `allowed_recipient` limitlerini olabildiğince
  dar tutun; her cap tek bir alıcı/amaç için oluşturulmalı.
- Anomalileri (beklenmeyen `spent` artışları, tekrarlayan başarısız
  çağrılar) izleyen bir alarm/log pipeline'ı ekleyin.
- Cron job'ı çalıştıran altyapıyı (container, sunucu) izole edin ve
  secret'ları ortam değişkeni yerine KMS referansı olarak enjekte edin.

---

## Öneri: uçtan uca test akışı (testnet)

1. Move contract'ı deploy edin, `PACKAGE_ID`'yi not edin.
2. İki test cüzdanı oluşturun: owner (siz) ve agent. İkisine de faucet'ten
   testnet SUI verin.
3. Frontend'i başlatın, owner cüzdanınızla bağlanın, agent adresini ve bir
   alıcı adresini (üçüncü bir test cüzdanı olabilir) girerek bir
   `SpendingCap` oluşturun.
4. Oluşan cap'in object ID'sini Sui Explorer'da (`https://suiscan.xyz/testnet`
   veya `suivision.xyz`) doğrulayın.
5. `agent/.env` dosyasına bu cap ID'sini, `PACKAGE_ID`'yi ve agent private
   key'ini girip `npm run run-once` çalıştırın; ödemenin gittiğini
   frontend'deki **İşlem Geçmişi**'nde görün.
6. Owner cüzdanıyla **İptal Et**'e basıp, agent'ı tekrar çalıştırıp artık
   ödemenin `ECapInactive` hatasıyla reddedildiğini doğrulayın.
