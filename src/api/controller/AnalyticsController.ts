import type { Request, Response } from "express"
import {
  getAllBlocks,
  classifyTransactions,
  computeSupplyChainStats,
  getStakingData,
  getUserCount,
  getTotalTransactionCount,
} from "../../analytics/aggregator"

const truncateAddress = (addr: string) =>
  addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr

const getOverview = async (_req: Request, res: Response) => {
  const [blocks, totalTransactions, totalUsers, stakingData] =
    await Promise.all([
      getAllBlocks(),
      getTotalTransactionCount(),
      getUserCount(),
      getStakingData(),
    ])

  const nonGenesisBlocks = blocks.filter((b) => b.number > 0)
  const totalStaked = stakingData.reduce((sum, s) => sum + s.stake, 0)
  const avgTransactionsPerBlock =
    nonGenesisBlocks.length > 0
      ? parseFloat((totalTransactions / nonGenesisBlocks.length).toFixed(2))
      : 0

  const lastBlock = blocks[blocks.length - 1] ?? null

  res.json({
    data: {
      totalBlocks: blocks.length,
      totalTransactions,
      totalUsers,
      totalStaked,
      avgTransactionsPerBlock,
      latestBlockNumber: lastBlock?.number ?? 0,
      latestBlockTimestamp: lastBlock?.timestamp ?? null,
    },
  })
}

const getTransactionAnalytics = async (_req: Request, res: Response) => {
  const blocks = await getAllBlocks()
  const classified = await classifyTransactions(blocks)

  const byType = {
    agri: classified.agri.length,
    COIN_PURCHASE: classified.coinPurchase.length,
    STAKE: classified.stake.length,
    MINING_REWARD: classified.reward.length,
  }

  const volumePerBlock = blocks
    .filter((b) => b.number > 0)
    .map((b) => ({
      blockNumber: b.number,
      txCount: Math.max(0, b.data.length - 1),
      timestamp: b.timestamp,
    }))

  const senderCount: Record<string, number> = {}
  const receiverCount: Record<string, number> = {}

  for (const tx of [...classified.agri, ...classified.coinPurchase]) {
    senderCount[tx.from] = (senderCount[tx.from] ?? 0) + 1
    receiverCount[tx.to] = (receiverCount[tx.to] ?? 0) + 1
  }

  const topSenders = Object.entries(senderCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, sentCount]) => ({ address: truncateAddress(address), sentCount }))

  const topReceivers = Object.entries(receiverCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, receivedCount]) => ({
      address: truncateAddress(address),
      receivedCount,
    }))

  res.json({
    data: {
      byType,
      volumePerBlock,
      topSenders,
      topReceivers,
    },
  })
}

const getSupplyChainAnalytics = async (_req: Request, res: Response) => {
  const blocks = await getAllBlocks()
  const { agri } = await classifyTransactions(blocks)
  const stats = computeSupplyChainStats(agri)

  res.json({ data: stats })
}

const getStakingAnalytics = async (_req: Request, res: Response) => {
  const distribution = await getStakingData()
  const totalStakers = distribution.length
  const totalStakedCoins = distribution.reduce((sum, s) => sum + s.stake, 0)

  res.json({
    data: {
      totalStakers,
      totalStakedCoins,
      distribution: distribution.map((s) => ({
        address: truncateAddress(s.publicKey),
        stake: s.stake,
        percentage: s.percentage,
      })),
    },
  })
}

const getBlockAnalytics = async (_req: Request, res: Response) => {
  const blocks = await getAllBlocks()
  const nonGenesis = blocks.filter((b) => b.number > 0)

  const blockTimeline = nonGenesis.map((block) => {
    const prevBlock = blocks.find((b) => b.number === block.number - 1)
    const miningTimeMs =
      prevBlock != null ? block.timestamp - prevBlock.timestamp : null

    return {
      blockNumber: block.number,
      timestamp: block.timestamp,
      miningTimeMs,
      txCount: Math.max(0, block.data.length - 1),
    }
  })

  const validTimes = blockTimeline
    .map((b) => b.miningTimeMs)
    .filter((t): t is number => t !== null && t > 0)

  const avgMiningTimeMs =
    validTimes.length > 0
      ? Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length)
      : 0
  const minMiningTimeMs = validTimes.length > 0 ? Math.min(...validTimes) : 0
  const maxMiningTimeMs = validTimes.length > 0 ? Math.max(...validTimes) : 0

  const difficultyTrend = blocks.map((b) => ({
    blockNumber: b.number,
    difficulty: b.difficulty,
  }))

  res.json({
    data: {
      avgMiningTimeMs,
      minMiningTimeMs,
      maxMiningTimeMs,
      difficultyTrend,
      blockTimeline,
    },
  })
}

export {
  getOverview,
  getTransactionAnalytics,
  getSupplyChainAnalytics,
  getStakingAnalytics,
  getBlockAnalytics,
}
