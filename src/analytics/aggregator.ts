import { blockDB, stakeDb, stateDB, txhashDB } from "../helper/level.db.client"
import { TransactionTypeEnum } from "../enum"
import { cryptoHashV2 } from "../crypto-hash"

export type RawTransaction = {
  from: string
  to: string
  data: any
  lastTransactionHash?: string
  signature?: string
}

export type RawBlock = {
  timestamp: number
  lastHash: string
  hash: string
  data: RawTransaction[]
  difficulty: number
  nonce: number
  number: number
}

export type TransactionWithMeta = RawTransaction & {
  blockNumber: number
  blockTimestamp: number
}

export type ClassifiedTransactions = {
  agri: TransactionWithMeta[]
  coinPurchase: TransactionWithMeta[]
  stake: TransactionWithMeta[]
  reward: TransactionWithMeta[]
}

export type StakerEntry = {
  publicKey: string
  stake: number
  percentage: number
}

export type SupplyChainStats = {
  totalBenihRegistered: number
  totalTransfers: number
  avgChainDepth: number
  longestChain: number
  totalUniqueOwners: number
}

export async function getAllBlocks(): Promise<RawBlock[]> {
  const keys = await blockDB.keys().all()
  const sortedKeys = keys.map((k) => parseInt(k)).sort((a, b) => a - b)

  return Promise.all(
    sortedKeys.map((k) =>
      blockDB.get(k.toString()).then((data) => JSON.parse(data) as RawBlock)
    )
  )
}

export async function classifyTransactions(
  blocks: RawBlock[]
): Promise<ClassifiedTransactions> {
  const result: ClassifiedTransactions = {
    agri: [],
    coinPurchase: [],
    stake: [],
    reward: [],
  }

  for (const block of blocks) {
    if (block.lastHash === "----") continue // skip genesis

    block.data.forEach((tx, index) => {
      const meta: TransactionWithMeta = {
        ...tx,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
      }

      // First tx in every non-genesis block is always the forger reward
      if (index === 0) {
        result.reward.push(meta)
        return
      }

      const txType = tx.data?.type

      if (txType === TransactionTypeEnum.COIN_PURCHASE) {
        result.coinPurchase.push(meta)
      } else if (txType === TransactionTypeEnum.STAKE) {
        result.stake.push(meta)
      } else {
        // No system type → agricultural transaction
        result.agri.push(meta)
      }
    })
  }

  return result
}

export function computeSupplyChainStats(
  agriTxs: TransactionWithMeta[]
): SupplyChainStats {
  if (agriTxs.length === 0) {
    return {
      totalBenihRegistered: 0,
      totalTransfers: 0,
      avgChainDepth: 0,
      longestChain: 0,
      totalUniqueOwners: 0,
    }
  }

  const computeTxHash = (tx: TransactionWithMeta): string =>
    cryptoHashV2(tx.from, tx.to, tx.data, tx.lastTransactionHash)

  // Map parent hash → children, for forward traversal
  const childrenMap = new Map<string, TransactionWithMeta[]>()
  for (const tx of agriTxs) {
    if (tx.lastTransactionHash) {
      const existing = childrenMap.get(tx.lastTransactionHash) ?? []
      existing.push(tx)
      childrenMap.set(tx.lastTransactionHash, existing)
    }
  }

  const getDepth = (txHash: string): number => {
    const children = childrenMap.get(txHash) ?? []
    if (children.length === 0) return 1
    return 1 + Math.max(...children.map((c) => getDepth(computeTxHash(c))))
  }

  const roots = agriTxs.filter((tx) => !tx.lastTransactionHash)
  const transfers = agriTxs.filter((tx) => !!tx.lastTransactionHash)
  const uniqueOwners = new Set(agriTxs.map((tx) => tx.to)).size

  const chainDepths = roots.map((root) => getDepth(computeTxHash(root)))
  const longestChain = chainDepths.length > 0 ? Math.max(...chainDepths) : 0
  const avgChainDepth =
    chainDepths.length > 0
      ? parseFloat(
          (chainDepths.reduce((s, d) => s + d, 0) / chainDepths.length).toFixed(1)
        )
      : 0

  return {
    totalBenihRegistered: roots.length,
    totalTransfers: transfers.length,
    avgChainDepth,
    longestChain,
    totalUniqueOwners: uniqueOwners,
  }
}

export async function getStakingData(): Promise<StakerEntry[]> {
  const rawEntries = await stakeDb.values().all()
  const entries = rawEntries.map(
    (v) => JSON.parse(v) as { publicKey: string; stake: number }
  )
  const totalStake = entries.reduce((sum, e) => sum + e.stake, 0)

  return entries
    .map((e) => ({
      publicKey: e.publicKey,
      stake: e.stake,
      percentage:
        totalStake > 0
          ? parseFloat(((e.stake / totalStake) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.stake - a.stake)
}

export async function getUserCount(): Promise<number> {
  const keys = await stateDB.keys().all()
  return keys.length
}

export async function getTotalTransactionCount(): Promise<number> {
  const keys = await txhashDB.keys().all()
  return keys.length
}
