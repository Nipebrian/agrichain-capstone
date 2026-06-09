# 🌾 AgriChain — Blockchain Rantai Pasok Benih Pertanian

Sistem pelacakan rantai pasok benih berbasis blockchain dengan mekanisme konsensus **Proof-of-Stake**. Setiap benih yang beredar dapat ditelusuri dari registrasi oleh pemerintah hingga ke tangan pengecer, seluruhnya tercatat *on-chain* dan tidak dapat dimanipulasi.

> **Proyek Capstone** — Sistem Informasi / Teknik Informatika

---

## Daftar Isi

- [🌾 AgriChain — Blockchain Rantai Pasok Benih Pertanian](#-agrichain--blockchain-rantai-pasok-benih-pertanian)
  - [Daftar Isi](#daftar-isi)
  - [Fitur Utama](#fitur-utama)
  - [Arsitektur Sistem](#arsitektur-sistem)
  - [Teknologi](#teknologi)
  - [Instalasi](#instalasi)
  - [Menjalankan Server](#menjalankan-server)
  - [Demo Data (Seed)](#demo-data-seed)
  - [API Reference](#api-reference)
    - [Pengguna](#pengguna)
    - [Transaksi](#transaksi)
    - [Blok](#blok)
    - [Analitik](#analitik)
  - [Dashboard Analitik](#dashboard-analitik)
  - [Struktur Proyek](#struktur-proyek)
  - [Cara Kerja Blockchain](#cara-kerja-blockchain)
    - [Proof-of-Stake Consensus](#proof-of-stake-consensus)
    - [Supply Chain Linkage](#supply-chain-linkage)
    - [Difficulty Adjustment](#difficulty-adjustment)
  - [Menjalankan Unit Test](#menjalankan-unit-test)
  - [Lisensi](#lisensi)

---

## Fitur Utama

| Fitur | Keterangan |
|---|---|
| **Supply Chain Tracking** | Lacak perjalanan benih dari registrasi hingga pengecer via `lastTransactionHash` |
| **Proof-of-Stake** | Konsensus berbasis lot — validator dipilih proporsional terhadap jumlah stake |
| **REST API** | 15+ endpoint untuk manajemen transaksi, blok, dan pengguna |
| **Analytics Dashboard** | 5 endpoint analitik + visualisasi interaktif berbasis HTML/Chart.js |
| **P2P Network** | Node terhubung via WebSocket, mendukung multi-node |
| **LevelDB Storage** | Penyimpanan persisten untuk blok, state, tx hash, dan stake |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT / DAPP                     │
│          (browser, Postman, seed.ps1)               │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP :5010
┌─────────────────▼───────────────────────────────────┐
│               EXPRESS REST API                      │
│  /user  /transaction  /block  /state  /analytics   │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│              NODE SERVER (server.ts)                │
│  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  P2P (WS)    │  │  loopMine (setInterval 5s) │  │
│  │  :3000       │  │  isMining guard            │  │
│  └──────────────┘  └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │           Proof-of-Stake Consensus           │  │
│  │   validatorLots → winnerLot → forger()       │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│                  LevelDB                            │
│  blockStore │ stateStore │ txhashStore │ stakeStore │
└─────────────────────────────────────────────────────┘
```

**Alur Rantai Pasok:**
```
🏛️ Pemerintah  →  👨‍🌾 Petani  →  🏭 Distributor  →  🏪 Pengecer
  (registrasi)      (terima)       (transfer)        (transfer)
```

---

## Teknologi

| Layer | Teknologi |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | LevelDB (classic-level) |
| Kriptografi | elliptic (ECDSA secp256k1) + SHA-256 |
| P2P | WebSocket (ws) |
| Testing | Jest + ts-jest |
| Dashboard | HTML + Chart.js (CDN) |

---

## Instalasi

```bash
# Clone repository
git clone https://github.com/Nipebrian/agrichain-capstone.git
cd agrichain-capstone

# Install dependencies
yarn install
# atau
npm install
```

**Salin file konfigurasi:**

```bash
cp .env.example .env   # atau edit .env langsung
```

Isi `.env` yang dibutuhkan:

```env
APP_PORT=3000          # Port P2P WebSocket
API_PORT=5010          # Port REST API
PRIVATE_KEY=           # Private key node ini
GENESIS_PRIVATE_KEY=   # Private key genesis (issuer benih)
PUBLIC_KEY=            # Public key node ini
MY_ADDRESS=ws://localhost:3000
IS_ORDERED_NODE=true   # true = node ini adalah orderer (yang mining)
ENABLE_API=true
```

---

## Menjalankan Server

```bash
# Development (dengan auto-reload)
yarn dev

# Atau langsung dengan ts-node
npx ts-node index.ts
```

Server berjalan di:
- **REST API** → `http://localhost:5010`
- **P2P WebSocket** → `ws://localhost:3000`

**Multi-node (opsional):**
```bash
# Terminal 1 — Orderer node
npx ts-node index.ts

# Terminal 2 — Peer node 1
APP_ENV=node-1 npx ts-node index.ts

# Terminal 3 — Peer node 2
APP_ENV=node-2 npx ts-node index.ts
```

---

## Demo Data (Seed)

Jalankan script berikut di terminal **terpisah** setelah server hidup:

```powershell
.\seed.ps1
```

Script ini otomatis membuat:
1. **3 wallet** — Petani, Distributor, Pengecer
2. **Pembelian koin** untuk semua aktor
3. **Staking** koin ke konsensus PoS
4. **Registrasi 3 benih** — Padi (IR64), Jagung (NK22), Kedelai (Anjasmoro)
5. **Transfer benih** Petani → Distributor
6. **Transfer benih** Distributor → Pengecer

Estimasi waktu: ±2 menit (6 blok × 20 detik).

Untuk reset data dan mulai dari awal:
```powershell
Remove-Item -Recurse -Force log
npx ts-node index.ts   # restart server
# lalu di terminal lain:
.\seed.ps1
```

---

## API Reference

Base URL: `http://localhost:5010/api`

### Pengguna

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/user` | Daftar semua pengguna |
| `GET` | `/user/:address` | Detail pengguna |
| `POST` | `/user/generate-wallet` | Buat wallet baru |

### Transaksi

| Method | Endpoint | Body | Keterangan |
|---|---|---|---|
| `POST` | `/transaction/purchase-coin` | `{ address, amount }` | Beli koin (dari genesis) |
| `POST` | `/transaction/stake` | `{ privateKey, amount }` | Stake koin ke konsensus |
| `POST` | `/transaction/transfer-coin` | `{ privateKey, address, amount }` | Transfer koin |
| `POST` | `/transaction/create-benih` | `{ address, data }` | Registrasi benih baru |
| `POST` | `/transaction/create` | `{ from, to, data, privateKey, lastTransactionHash }` | Buat transaksi kustom (transfer benih) |
| `GET` | `/transaction/pool` | — | Lihat tx pool |
| `GET` | `/transaction/:hash` | — | Detail transaksi |
| `GET` | `/transaction/:hash/flow` | — | Riwayat lengkap benih |

### Blok

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/block` | Semua blok |
| `GET` | `/block/:number` | Detail blok |

### Analitik

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/analytics/overview` | Ringkasan blockchain |
| `GET` | `/analytics/transactions` | Analisis transaksi by type, volume, top sender/receiver |
| `GET` | `/analytics/supply-chain` | Statistik rantai pasok (depth, transfer count) |
| `GET` | `/analytics/staking` | Distribusi stake per validator |
| `GET` | `/analytics/blocks` | Mining time, difficulty trend, block timeline |

**Contoh response `/analytics/supply-chain`:**
```json
{
  "data": {
    "totalBenihRegistered": 3,
    "totalTransfers": 6,
    "avgChainDepth": 3,
    "longestChain": 3,
    "totalUniqueOwners": 3
  }
}
```

---

## Dashboard Analitik

Buka file `dashboard.html` langsung di browser (tidak perlu server tambahan):

```
agrichain-capstone/dashboard.html  →  double-click atau drag ke Chrome

atau

install http-server:
npm install -g http-server

Jalankan dari folder project:
http-server -p 8080 -o

Akses: http://localhost:8080/dashboard.html
```

Pastikan server sedang berjalan. Dashboard memuat semua data otomatis dan memiliki tombol **↻ Refresh**.

**Visualisasi yang tersedia:**
- Kartu ringkasan (blok, transaksi, pengguna, staked)
- Diagram alur rantai pasok
- Doughnut chart komposisi jenis transaksi
- Bar chart volume transaksi per blok
- Doughnut chart distribusi Proof-of-Stake
- Line chart tren difficulty mining
- Timeline blok dengan waktu mining

---

## Struktur Proyek

```
agrichain-capstone/
├── index.ts                    # Entry point
├── dashboard.html              # Analytics dashboard (buka di browser)
├── seed.ps1                    # Script demo data
├── .env                        # Konfigurasi environment
│
├── src/
│   ├── nodes/
│   │   └── server.ts           # P2P server, loopMine, transactionHandler
│   ├── block.ts                # Block class + PoW mining + difficulty adjust
│   ├── transaction.ts          # Transaction class + ECDSA signing
│   ├── blockchain.ts           # Chain validation
│   ├── crypto-hash.ts          # SHA-256 hash utility
│   │
│   ├── consensus/
│   │   ├── pos.ts              # ProofOfStake — stakers, forger()
│   │   └── lot.ts              # Lot — lotHash() untuk pemilihan validator
│   │
│   ├── core/
│   │   ├── txPool.ts           # Validasi & pembersihan tx pool
│   │   ├── state.ts            # State transition saat blok masuk
│   │   └── queue.ts            # SyncQueue untuk sinkronisasi blok
│   │
│   ├── analytics/
│   │   └── aggregator.ts       # Scanner LevelDB — classifyTransactions, supplyChainStats
│   │
│   ├── api/
│   │   ├── index.ts            # Express app setup
│   │   ├── routes/             # Routing (transaction, block, user, analytics)
│   │   ├── controller/         # Handler per endpoint
│   │   ├── middleware/         # Validation, error handler
│   │   └── validation/         # Yup schemas
│   │
│   ├── miner/
│   │   └── worker.ts           # Child process untuk PoW mining
│   │
│   ├── helper/
│   │   └── level.db.client.ts  # LevelDB instances (blockDB, stateDB, dll)
│   │
│   └── config/                 # App config, genesis data, blockchain constants
│
├── utils/                      # Keypair, message, connect helpers
└── test/                       # Unit tests (Jest)
```

---

## Cara Kerja Blockchain

### Proof-of-Stake Consensus
1. Setiap node dapat melakukan **stake** koin ke konsensus
2. Setiap unit stake = 1 lot dalam undian validator
3. Node dengan lot yang hash-nya paling dekat ke hash blok terakhir menjadi **forger**
4. Forger menjalankan `mine()` dan mendapat **Mining Reward**

### Supply Chain Linkage
Setiap transaksi benih menyimpan `lastTransactionHash` — pointer ke transaksi sebelumnya. Ini membentuk **linked list on-chain** yang dapat ditelusuri mundur ke sumber registrasi:

```
Registrasi (genesis→petani)
    └── Transfer #1 (petani→distributor) [lastTxHash = hash registrasi]
            └── Transfer #2 (distributor→pengecer) [lastTxHash = hash transfer #1]
```

Gunakan `GET /api/transaction/:hash/flow` untuk melihat riwayat lengkap satu komoditas.

### Difficulty Adjustment
Difficulty menyesuaikan otomatis per blok:
- Blok muncul **lebih cepat** dari `MINE_RATE` (6 detik) → difficulty **naik**
- Blok muncul **lebih lambat** → difficulty **turun** (minimum 0)

---

## Menjalankan Unit Test

```bash
yarn test
# atau
npx jest
```

---

## Lisensi

MIT
