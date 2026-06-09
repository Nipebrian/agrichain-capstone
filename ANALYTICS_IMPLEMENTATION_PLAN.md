# Implementation Plan: AgriChain Analytics

## Ringkasan

Menambahkan 5 endpoint analytics ke REST API yang sudah ada, dengan membaca dan
mengagregasi data langsung dari LevelDB. Tidak ada perubahan pada logika inti
blockchain — hanya penambahan layer baca di atas data yang sudah tersimpan.

---

## Konteks Teknis

### Database yang Digunakan

| DB | Key | Value | Kegunaan |
|----|-----|-------|----------|
| `blockDB` | blockNumber (string) | `Block` (JSON) | Semua blok beserta transaksinya |
| `txhashDB` | txHash | `"blockNumber txIndex"` | Index cepat untuk lookup transaksi |
| `stateDB` | publicKey | `UserState` (JSON) | Balance + riwayat transaksi per address |
| `stakeDb` | publicKey | `{ publicKey, stake }` (JSON) | Data staking validator |

### Jenis Transaksi yang Ada

```typescript
// Transaksi sistem (blockchainTransactions)
TransactionTypeEnum.COIN_PURCHASE   // transfer koin antar user
TransactionTypeEnum.STAKE           // staking ke validator
TransactionTypeEnum.MINING_REWARD   // reward per blok (from !== to)

// Transaksi agrikultur (data.type tidak ada di enum)
// Dibuat via POST /transaction/create-benih
// data berisi objek bebas (nama benih, varietas, kuantitas, dll)
```

### Pola Kode yang Wajib Diikuti

- Controller: async function `(req, res)` — tidak ada class
- Route: `Router()` + `catcher(handler)` + optional `validate(schema)`
- Error handling: lempar ke `next()` via `catcher`, bukan try-catch manual di route
- Import DB dari `../../helper/level.db.client`

---

## File yang Akan Dibuat / Dimodifikasi

```
src/
  analytics/
    aggregator.ts              [BARU] core scan seluruh blockDB
  api/
    controller/
      AnalyticsController.ts   [BARU] 5 handler endpoint
    routes/
      AnalyticsRoute.ts        [BARU] router definition
      index.ts                 [EDIT] tambah 1 baris use()

(opsional)
  types/
    analytics.ts               [BARU] type definitions analytics
```

---

## Tahap 1 — Aggregator (`src/analytics/aggregator.ts`)

Ini adalah satu-satunya tempat data dibaca dari DB. Semua controller memanggil
fungsi dari file ini — tidak ada akses DB langsung di controller.

### Fungsi yang Diekspos

```typescript
export async function getAllBlocks(): Promise<Block[]>
```
Baca semua blok dari `blockDB` berurutan berdasarkan `blockNumber`. Lewati block
genesis (nomor 0) untuk kalkulasi statistik mining karena tidak punya `lastHash`
yang valid sebagai acuan waktu.

```typescript
export async function classifyTransactions(blocks: Block[]): Promise<ClassifiedTxData>
```
Iterasi semua transaksi dari semua blok, pisahkan ke dalam bucket:
- `agri` — `!blockchainTransactions.includes(tx.data?.type)`
- `coinPurchase` — `tx.data?.type === COIN_PURCHASE`
- `stake` — `tx.data?.type === STAKE`
- `reward` — `tx.data?.type === MINING_REWARD` (atau `tx.from === tx.to` untuk
  reward lama)

```typescript
export async function getStakingData(): Promise<StakerEntry[]>
```
Baca semua entri dari `stakeDb`, hitung persentase masing-masing staker dari
total stake.

```typescript
export async function getUserCount(): Promise<number>
```
Hitung jumlah key di `stateDB`.

### Tipe Data Internal

```typescript
type ClassifiedTxData = {
  agri: TransactionWithMeta[]
  coinPurchase: TransactionWithMeta[]
  stake: TransactionWithMeta[]
  reward: TransactionWithMeta[]
}

type TransactionWithMeta = {
  tx: Transaction
  blockNumber: number
  blockTimestamp: number
}

type StakerEntry = {
  publicKey: string
  stake: number
  percentage: number
}
```

### Catatan Implementasi

- `blockDB.keys().all()` mengembalikan string, parse ke `parseInt` untuk sorting
- Jangan asumsikan key berurutan — selalu sort ascending sebelum dipakai
- `tx.from === tx.to` pada reward transaction lama (lihat `state.ts` baris 36)
  bisa digunakan sebagai fallback pendeteksian reward

---

## Tahap 2 — Controller (`src/api/controller/AnalyticsController.ts`)

Setiap handler memanggil fungsi aggregator, tidak ada logika DB langsung.
Semua handler async, tidak ada return value eksplisit selain via `res`.

### Handler 1: `getOverview`

**Endpoint:** `GET /analytics/overview`

Agregasi:
- `totalBlocks` — `blockDB.keys().all().length`
- `totalTransactions` — `txhashDB.keys().all().length`
- `totalUsers` — `stateDB.keys().all().length` (via `getUserCount`)
- `totalStaked` — sum semua stake dari `stakeDb`
- `avgTransactionsPerBlock` — `totalTransactions / totalBlocks` (exclude genesis)
- `latestBlockNumber` — key terbesar di `blockDB`
- `latestBlockTimestamp` — timestamp blok terakhir (ms epoch)

**Contoh Response:**
```json
{
  "data": {
    "totalBlocks": 24,
    "totalTransactions": 87,
    "totalUsers": 12,
    "totalStaked": 450,
    "avgTransactionsPerBlock": 3.6,
    "latestBlockNumber": 23,
    "latestBlockTimestamp": 1749400000000
  }
}
```

---

### Handler 2: `getTransactionAnalytics`

**Endpoint:** `GET /analytics/transactions`

Agregasi:
- `byType` — count per bucket dari `classifyTransactions`
- `volumePerBlock` — array `{ blockNumber, txCount, timestamp }`, iterasi semua
  blok, hitung `block.data.length - 1` (kurangi reward tx)
- `topSenders` — frekuensi `tx.from` dari semua transaksi agri+coin, ambil top 5,
  truncate address jadi `addr.slice(0,8)...addr.slice(-6)` untuk display
- `topReceivers` — frekuensi `tx.to` dari transaksi agri, ambil top 5

**Contoh Response:**
```json
{
  "data": {
    "byType": {
      "agri": 52,
      "COIN_PURCHASE": 18,
      "STAKE": 9,
      "MINING_REWARD": 8
    },
    "volumePerBlock": [
      { "blockNumber": 1, "txCount": 3, "timestamp": 1749400120000 },
      { "blockNumber": 2, "txCount": 5, "timestamp": 1749400240000 }
    ],
    "topSenders": [
      { "address": "04ab12...f3e1", "sentCount": 15 }
    ],
    "topReceivers": [
      { "address": "04cd34...a2b7", "receivedCount": 12 }
    ]
  }
}
```

---

### Handler 3: `getSupplyChainAnalytics`

**Endpoint:** `GET /analytics/supply-chain`

Fokus: transaksi agri saja (yang tidak punya `data.type` sistem).

Agregasi:
- `totalBenihRegistered` — count agri transactions tanpa `lastTransactionHash`
  (ini adalah transaksi asal / root benih)
- `totalTransfers` — count agri transactions yang punya `lastTransactionHash`
  (ini adalah perpindahan kepemilikan)
- `avgChainDepth` — untuk setiap root benih, hitung panjang rantainya dengan
  mengikuti `lastTransactionHash`. Rata-ratakan semua panjang rantai.
- `longestChain` — panjang rantai terpanjang
- `totalUniqueOwners` — count unique addresses yang pernah jadi `to` pada
  transaksi agri

**Cara Hitung Panjang Rantai:**
Gunakan data yang sudah di-scan (jangan query DB berulang). Bangun map
`hash → tx` dari semua agri transactions, lalu BFS/iterasi dari setiap root.

**Contoh Response:**
```json
{
  "data": {
    "totalBenihRegistered": 35,
    "totalTransfers": 17,
    "avgChainDepth": 2.8,
    "longestChain": 5,
    "totalUniqueOwners": 9
  }
}
```

---

### Handler 4: `getStakingAnalytics`

**Endpoint:** `GET /analytics/staking`

Agregasi dari `getStakingData()`:
- `totalStakers` — jumlah entri di stakeDb
- `totalStakedCoins` — sum semua nilai stake
- `distribution` — array `{ address (truncated), stake, percentage }` sorted
  descending by stake

**Contoh Response:**
```json
{
  "data": {
    "totalStakers": 4,
    "totalStakedCoins": 450,
    "distribution": [
      { "address": "04ab12...f3e1", "stake": 200, "percentage": 44.4 },
      { "address": "04cd34...a2b7", "stake": 150, "percentage": 33.3 },
      { "address": "04ef56...c1d0", "stake": 100, "percentage": 22.2 }
    ]
  }
}
```

---

### Handler 5: `getBlockAnalytics`

**Endpoint:** `GET /analytics/blocks`

Iterasi blok berurutan (skip genesis untuk mining time):
- `avgMiningTimeMs` — rata-rata `block[n].timestamp - block[n-1].timestamp`
- `minMiningTimeMs` / `maxMiningTimeMs` — nilai min/max
- `difficultyTrend` — array `{ blockNumber, difficulty }` semua blok
- `blockTimeline` — array `{ blockNumber, timestamp, miningTimeMs, txCount }`

**Contoh Response:**
```json
{
  "data": {
    "avgMiningTimeMs": 3200,
    "minMiningTimeMs": 800,
    "maxMiningTimeMs": 9100,
    "difficultyTrend": [
      { "blockNumber": 1, "difficulty": 3 },
      { "blockNumber": 5, "difficulty": 4 },
      { "blockNumber": 10, "difficulty": 3 }
    ],
    "blockTimeline": [
      { "blockNumber": 1, "timestamp": 1749400000000, "miningTimeMs": 1200, "txCount": 3 }
    ]
  }
}
```

---

## Tahap 3 — Route (`src/api/routes/AnalyticsRoute.ts`)

Mengikuti pola file route yang sudah ada. Tidak ada middleware `validate` karena
semua endpoint adalah `GET` tanpa body.

```typescript
import { Router } from "express"
import catcher from "../helper/handler"
import {
  getOverview,
  getTransactionAnalytics,
  getSupplyChainAnalytics,
  getStakingAnalytics,
  getBlockAnalytics,
} from "../controller/AnalyticsController"

const router = Router()

router.get("/overview",      catcher(getOverview))
router.get("/transactions",  catcher(getTransactionAnalytics))
router.get("/supply-chain",  catcher(getSupplyChainAnalytics))
router.get("/staking",       catcher(getStakingAnalytics))
router.get("/blocks",        catcher(getBlockAnalytics))

export default router
```

---

## Tahap 4 — Registrasi Route (`src/api/routes/index.ts`)

Tambahkan **1 baris** di antara route yang sudah ada:

```typescript
// Tambahkan import
import AnalyticsRoute from "./AnalyticsRoute"

// Tambahkan setelah router.use("/user", UserRoute)
router.use("/analytics", AnalyticsRoute)
```

---

## Urutan Implementasi yang Disarankan

```
1. src/analytics/aggregator.ts          → tidak ada dependency baru
2. src/api/controller/AnalyticsController.ts  → bergantung pada aggregator
3. src/api/routes/AnalyticsRoute.ts     → bergantung pada controller
4. src/api/routes/index.ts              → tambah 2 baris
5. Test tiap endpoint dengan data dummy di blockchain
```

---

## Risiko dan Mitigasi

| Risiko | Kemungkinan | Mitigasi |
|--------|-------------|----------|
| `blockDB` kosong saat dipanggil | Rendah | Guard: jika `keys.length === 0`, return data kosong dengan status 200 |
| Format data agri tidak konsisten (`data` bisa null/undefined) | Sedang | Optional chaining `tx.data?.type` sebelum semua akses |
| Scan semua blok lambat jika chain panjang | Rendah (demo) | Acceptable untuk capstone; catatan sebagai "future: caching" di laporan |
| `lastTransactionHash` mengarah ke tx yang belum di-index | Rendah | Gunakan map in-memory dari scan awal, bukan re-query DB |

---

## Nilai Presentasi per Endpoint

| Endpoint | Narasi Presentasi |
|----------|-------------------|
| `/overview` | "Ini kondisi jaringan AgriChain secara real-time" |
| `/transactions` | "Mayoritas transaksi adalah aktivitas agri, bukan sekadar koin — sistem benar-benar dipakai" |
| `/supply-chain` | "Setiap benih bisa ditelusuri perjalanannya, rata-rata berpindah tangan X kali" |
| `/staking` | "Validasi blok dilakukan oleh staker, bukan komputasi berat — ini PoS yang sudah berjalan" |
| `/blocks` | "Difficulty otomatis menyesuaikan, mining time stabil di sekitar X detik" |

---

## Checklist Sebelum Demo

- [ ] Pastikan ada minimal 5–10 blok di chain (jalankan miner dulu)
- [ ] Pastikan ada minimal 2–3 transaksi `create-benih` dengan `lastTransactionHash`
      yang saling terhubung (untuk supply chain depth > 1)
- [ ] Pastikan ada minimal 2 staker berbeda (untuk pie chart distribusi)
- [ ] Test semua 5 endpoint mengembalikan `200` bukan `500`
- [ ] Catat nilai "menarik" dari data nyata untuk dipaparkan saat presentasi
