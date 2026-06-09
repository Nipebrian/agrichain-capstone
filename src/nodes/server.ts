import WebSocket from "ws"
import { fork } from "child_process"
import { ec } from "elliptic"

import Block from "../block"
import Transaction, { type TransactionParams } from "../transaction"
import SyncQueue from "../core/queue"
import ProofOfStake from "../consensus/pos"
import changeState from "../core/state"
import api from "../api"
import cryptoHashV2 from "../crypto-hash"

import connect from "../../utils/connect"
import { getKeyPair, verifyPublicKey } from "../../utils/keypair"
import {
  MessageTypeEnum,
  TransactionTypeEnum,
  blockchainTransactions,
} from "../enum"
import { produceMessage, sendMessage } from "../../utils/message"
import { GENESIS_DATA, INITIAL_SUPPLY } from "../config"
import { verifyBlock } from "../consensus/consensus"
import {
  validateTransaction,
  clearDepreciatedTransaction,
} from "../core/txPool"
import { stateDB, bhashDB, blockDB, txhashDB } from "../helper/level.db.client"

import type { ChainInfo, ConnectedNode, MessageInterface, Peer } from "../types"
import type { Config } from "../config"

const connectedNodes = new Map<string, ConnectedNode>()

let worker = fork(`${__dirname}/../miner/worker.ts`) // Worker thread (for PoW mining).
let mined = false // This will be used to inform the node that another node has already mined before it.
let isMining = false // Guard: prevent concurrent mine() calls from loopMine

const chainInfo: ChainInfo = {
  syncQueue: new SyncQueue(),
  consensus: new ProofOfStake({}),
  latestBlock: Block.genesis(),
  transactionPool: [],
  checkedBlock: {},
  latestSyncBlock: null,
}

async function startServer(params: Config) {
  const {
    PRIVATE_KEY,
    APP_PORT,
    API_PORT,
    MY_ADDRESS,
    PEERS,
    ENABLE_CHAIN_REQUEST,
    ENABLE_MINING,
    ENABLE_API,
    IS_ORDERER_NODE,
    GENESIS_PRIVATE_KEY,
    ALLOWED_PEERS,
  } = params

  const keyPair = getKeyPair(PRIVATE_KEY)
  const genesisKeyPair = getKeyPair(GENESIS_PRIVATE_KEY)
  chainInfo.consensus = await ProofOfStake.initialize()

  const publicKey = keyPair.getPublic("hex")
  const genesisPublicKey = genesisKeyPair.getPublic("hex")
  const signedPubKey = keyPair.sign(cryptoHashV2(publicKey)).toDER("hex")
  let chainRequestEnabled = ENABLE_CHAIN_REQUEST
  let currentSyncBlock = 1

  const server = new WebSocket.Server({
    port: APP_PORT,

    verifyClient: async (info, cb) => {
      const clientAddress = info.req.socket.remoteAddress
      const peerAddress = info.req.headers["x-address"] as string
      const signature = info.req.headers["x-signature"] as string

      // Check if the client's address or key is in the allowed list
      if (
        peerAddress &&
        ALLOWED_PEERS.includes(peerAddress) &&
        verifyPublicKey(peerAddress, cryptoHashV2(peerAddress), signature)
      ) {
        cb(true) // Accept the connection
      } else {
        console.log(
          `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Connection attempt from unauthorized server at ${clientAddress}.`
        )
        cb(false, 403, "Unauthorized server") // Reject the connection
      }
    },
  })

  process.on("uncaughtException", (err) =>
    console.log(
      `\x1b[31mERROR\x1b[0m [${new Date().toISOString()}] Uncaught Exception`,
      err
    )
  )

  process.on("exit", (err) => {
    worker.kill()
  })

  console.log(
    `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] P2P server listening on PORT`,
    APP_PORT
  )

  server.on("connection", async (socket, req) => {
    // Message handler
    socket.on("message", async (message) => {
      const _message: MessageInterface<any> = JSON.parse(message.toString())

      switch (_message.type) {
        case MessageTypeEnum.HANDSHAKE:
          const nodes: Array<Peer> = _message.data

          const newNodes = nodes.filter(
            (node) =>
              !connectedNodes.has(node.publicKey) &&
              node.publicKey !== publicKey
          )

          newNodes.forEach((node) =>
            connect({
              currentNode: {
                publicKey: publicKey,
                wsAddress: MY_ADDRESS,
              },
              peer: node,
              connectedNodes,
              signature: signedPubKey,
            })
          )
          break

        case MessageTypeEnum.CREATE_TRANSACTION:
          if (chainRequestEnabled) break // Unsynced nodes should not be able to proceed.

          let transaction: Transaction
          try {
            transaction = new Transaction(_message.data)
          } catch (err) {
            // If transaction can not be initialized, it's faulty
            console.log(
              `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Received invalid block.`
            )
            break
          }

          const isAddressExist = async () => {
            const existedAddresses = await stateDB.keys().all()

            return (
              existedAddresses.includes(transaction.from) ||
              chainInfo.transactionPool.findIndex(
                (tx) => tx.to === transaction.from
              ) !== -1
            )
          }

          const isTransactionExist = () =>
            [...chainInfo.transactionPool]
              .reverse()
              .findIndex((tx) => tx.getHash() === transaction.getHash()) !== -1

          // Skip invalid transaction, empty address, and added transaction
          if (
            !transaction.isValid() ||
            !isAddressExist() ||
            isTransactionExist()
            // TODO: implement check last transaction hash existence
          )
            break

          chainInfo.transactionPool.push(transaction)
          sendMessage(
            message,
            Array.from(connectedNodes.values(), (data) => data.socket)
          )

          console.log(
            `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] New transaction received, broadcasted and added to pool.`
          )
          break

        case MessageTypeEnum.REQUEST_BLOCK:
          const { blockNumber, requestAddress } = _message.data

          let requestedBlock

          try {
            const blockData = await blockDB
              .get(blockNumber.toString())
              .then((data) => JSON.parse(data))
            requestedBlock = blockData
          } catch (e) {
            // If block does not exist, break
            break
          }

          const node = connectedNodes.get(requestAddress)

          if (node) {
            node.socket.send(
              produceMessage(MessageTypeEnum.SEND_BLOCK, requestedBlock)
            ) // Send block

            console.log(
              `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Sent block at position ${blockNumber} to ${requestAddress}.`
            )
          }
          break

        case MessageTypeEnum.SEND_BLOCK:
          let block: Block

          try {
            block = new Block({
              ..._message.data,
              data: _message.data.data.map(
                (tx: TransactionParams) => new Transaction(tx)
              ),
            })
          } catch (err) {
            // If block fails to be initialized, it's faulty
            console.log(
              `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Received invalid block.`
            )
            return
          }

          if (ENABLE_CHAIN_REQUEST && block.number === currentSyncBlock) {
            chainInfo.syncQueue.add(block, async function (block: Block) {
              if (
                (chainInfo.latestSyncBlock === null &&
                  GENESIS_DATA.hash === block.hash) || // For genesis
                (await verifyBlock(block, chainInfo, stateDB)) // For all others
              ) {
                const blockNumberStr = block.number.toString()
                await blockDB.put(blockNumberStr, JSON.stringify(block)) // Add block to chain
                await bhashDB.put(block.hash, blockNumberStr) // Assign block number to the matching block hash

                // Assign transaction index and block number to transaction hash
                for (let txIndex = 0; txIndex < block.data.length; txIndex++) {
                  const tx = block.data[txIndex]

                  await txhashDB.put(
                    tx.getHash(),
                    block.number.toString() + " " + txIndex.toString()
                  )

                  // update the node stake
                  if (tx.data.type === TransactionTypeEnum.STAKE)
                    await chainInfo.consensus.update(tx.to, tx.data.amount)
                }

                if (!chainInfo.latestSyncBlock) {
                  chainInfo.latestSyncBlock = block // Update latest synced block.

                  await changeState(block, stateDB) // Force transit state
                }

                chainInfo.latestBlock = block // Update latest block cache

                console.log(
                  `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Synced block at position ${
                    block.number
                  }.`
                )

                // Wipe sync queue
                chainInfo.syncQueue.wipe()

                currentSyncBlock++

                // Continue requesting the next block
                for (const node of [...connectedNodes.values()]) {
                  node.socket.send(
                    produceMessage(MessageTypeEnum.REQUEST_BLOCK, {
                      blockNumber: currentSyncBlock,
                      requestAddress: publicKey,
                    })
                  )
                }

                return true
              } else {
                console.log(
                  `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Received invalid block ${JSON.stringify(
                    block.hash
                  )}.`
                )
              }

              return false
            })
          }
          break

        case MessageTypeEnum.PUBLISH_BLOCK:
          let newBlock: Block

          try {
            newBlock = new Block({
              ..._message.data,
              data: _message.data.data.map(
                (tx: TransactionParams) => new Transaction(tx)
              ),
            })
          } catch (err) {
            // If block fails to be initialized, it's faulty
            return
          }

          if (!chainInfo.checkedBlock[newBlock.hash]) {
            chainInfo.checkedBlock[newBlock.hash] = true
          } else {
            return
          }

          if (
            newBlock.lastHash !== chainInfo.latestBlock.lastHash &&
            (!chainRequestEnabled ||
              (chainRequestEnabled && currentSyncBlock > 1))
            // Only proceed if syncing is disabled or enabled but already synced at least the genesis block
          ) {
            if (await verifyBlock(newBlock, chainInfo, stateDB)) {
              console.log(
                `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] New block received.`
              )

              // If mining is enabled, we will set mined to true, informing that another node has mined before us.
              if (ENABLE_MINING) {
                mined = true

                worker.kill() // Stop the worker thread

                worker = fork(`${__dirname}/../miner/worker.ts`) // Renew
              }

              const blockNumberStr = newBlock.number.toString()

              await blockDB.put(blockNumberStr, JSON.stringify(_message.data)) // Add block to chain
              await bhashDB.put(newBlock.hash, blockNumberStr) // Assign block number to the matching block hash

              // Apply to all txns of the block: Assign transaction index and block number to transaction hash
              for (let txIndex = 0; txIndex < newBlock.data.length; txIndex++) {
                const tx = newBlock.data[txIndex]

                await txhashDB.put(
                  tx.getHash(),
                  blockNumberStr + " " + txIndex.toString()
                )

                // update the node stake
                if (tx.data.type === TransactionTypeEnum.STAKE)
                  await chainInfo.consensus.update(tx.to, tx.data.amount)
              }

              chainInfo.latestBlock = newBlock // Update latest block cache

              // Update the new transaction pool (remove all the transactions that are no longer valid).
              chainInfo.transactionPool = clearDepreciatedTransaction(
                chainInfo.transactionPool,
                newBlock.data
              )

              console.log(
                `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Block #${
                  newBlock.number
                } synced, state transited.`
              )

              sendMessage(
                message,
                Array.from(connectedNodes.values(), (data) => data.socket)
              ) // Broadcast block to other nodes

              if (ENABLE_CHAIN_REQUEST) chainRequestEnabled = false
            }
          }

          break

        case MessageTypeEnum.START_MINING:
          if (chainInfo.transactionPool.length > 0)
            mine(publicKey, genesisKeyPair)
          break

        case MessageTypeEnum.REQUEST_POOL:
          const { poolRequestAddress } = _message.data

          const poolRequestNode = connectedNodes.get(poolRequestAddress)

          if (poolRequestNode) {
            poolRequestNode.socket.send(
              produceMessage(
                MessageTypeEnum.SEND_POOL,
                chainInfo.transactionPool
              )
            )

            console.log(
              `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Sent transaction pool to ${poolRequestAddress}.`
            )
          }
          break

        case MessageTypeEnum.SEND_POOL:
          const txPool = _message.data

          try {
            const newTxPool: Array<Transaction> = txPool.map(
              (tx: TransactionParams) => new Transaction(tx)
            )

            if (newTxPool.length > 0) {
              if (!newTxPool.every((tx) => tx.isValid()))
                throw "Invalid transaction pool!"

              chainInfo.transactionPool = newTxPool

              console.log(
                `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Synced ${
                  newTxPool.length
                } transactions.`
              )
            }
          } catch (err) {
            // If tx pool fails to be initialized, it's faulty
            console.log(
              `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Failed to initialize transaction pool: ${err}`
            )
          }
          break
      }
    })
  })

  if (!chainRequestEnabled) {
    const blockchain = await blockDB.keys().all()

    if ((blockchain.length as number) === 0) {
      // Add initial coin supply
      await stateDB.put(
        genesisPublicKey,
        JSON.stringify({
          address: genesisPublicKey,
          balance: INITIAL_SUPPLY,
        })
      )

      if (IS_ORDERER_NODE) {
        // Set orderer as the initial stakers
        await chainInfo.consensus.update(publicKey, 1)
      }

      // store genesis block
      await blockDB.put(
        chainInfo.latestBlock.number.toString(),
        JSON.stringify(chainInfo.latestBlock)
      )

      // assign block number to the matching block hash
      await bhashDB.put(
        chainInfo.latestBlock.hash,
        chainInfo.latestBlock.number.toString()
      )

      await changeState(chainInfo.latestBlock, stateDB)

      console.log(
        `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Created Genesis Block with:\n` +
          `    Block number: ${chainInfo.latestBlock.number.toString()}\n` +
          `    Timestamp: ${chainInfo.latestBlock.timestamp.toString()}\n` +
          `    Difficulty: ${chainInfo.latestBlock.difficulty.toString()}\n` +
          `    Hash: ${chainInfo.latestBlock.hash.toString()}\n`
      )
    } else {
      const lastStoredBlockKey = Math.max(
        ...blockchain.map((key) => parseInt(key))
      )

      chainInfo.latestBlock = await blockDB
        .get(lastStoredBlockKey.toString())
        .then((data) => JSON.parse(data))
    }
  }

  try {
    PEERS.forEach((peer) =>
      connect({
        peer,
        currentNode: {
          publicKey: publicKey,
          wsAddress: MY_ADDRESS,
        },
        connectedNodes,
        signature: signedPubKey,
      })
    ) // Connect to peers
  } catch (e) {}

  // Sync chain
  if (chainRequestEnabled) {
    const blockNumbers = await blockDB.keys().all()

    if ((blockNumbers.length as number) !== 0) {
      currentSyncBlock = Math.max(...blockNumbers.map((key) => parseInt(key)))
      chainInfo.latestBlock = await blockDB
        .get(String(currentSyncBlock))
        .then((data) => JSON.parse(data))

      currentSyncBlock += 1
    }

    if (currentSyncBlock === 1) {
      // Add initial coin supply
      await stateDB.put(
        genesisPublicKey,
        JSON.stringify({
          address: genesisPublicKey,
          balance: INITIAL_SUPPLY,
        })
      )

      if (IS_ORDERER_NODE) {
        // Set orderer as the initial stakers
        await chainInfo.consensus.update(publicKey, 1)
      }
    }

    setTimeout(async () => {
      for (const node of [...connectedNodes.values()]) {
        node.socket.send(
          produceMessage(MessageTypeEnum.REQUEST_BLOCK, {
            blockNumber: currentSyncBlock,
            requestAddress: publicKey,
          })
        )
        node.socket.send(
          produceMessage(MessageTypeEnum.REQUEST_POOL, {
            poolRequestAddress: publicKey,
          })
        )
      }
      chainRequestEnabled = false
    }, 5000)
  }

  // orderer scheduler for mining
  if (IS_ORDERER_NODE) loopMine(publicKey, MY_ADDRESS, genesisKeyPair)

  if (ENABLE_API)
    api(
      API_PORT,
      {
        publicKey,
        chainInfo,
        mining: ENABLE_MINING,
        connectedNodes,
      },
      transactionHandler
    )
}

const loopMine = (
  publicKey: string,
  ordererAddress: string,
  keyPair: ec.KeyPair
) => {
  setInterval(async () => {
    if (isMining) return
    if (chainInfo.transactionPool.length > 0) {
      const forgerPublicKey = chainInfo.consensus.forger(
        chainInfo.latestBlock.hash
      )

      if (forgerPublicKey) {
        if (forgerPublicKey === publicKey) {
          isMining = true
          try {
            await mine(publicKey, keyPair)
          } finally {
            isMining = false
          }
        } else {
          const forgerNode = connectedNodes.get(forgerPublicKey)

          if (forgerNode) {
            forgerNode.socket.send(
              produceMessage(MessageTypeEnum.START_MINING, {
                ordererAddress,
              })
            )
          } else {
            // FALLBACK: If the selected forger is offline/not running a P2P node,
            // the orderer node mines the transactions to prevent the blockchain from freezing.
            isMining = true
            try {
              console.log(
                `\x1b[33mWARN\x1b[0m Selected forger ${forgerPublicKey} is offline. Fallback to orderer node for mining.`
              )
              await mine(publicKey, keyPair)
            } finally {
              isMining = false
            }
          }
        }
      }
    }
  }, 5000)
}

const mine = async (publicKey: string, keyPair: ec.KeyPair) => {
  const startWorker = (lastBlock: Block, transactions: Array<Transaction>) => {
    return new Promise<Block>((resolve, reject) => {
      worker.addListener("message", (message: any) => resolve(message.result))

      worker.send({
        type: "MINE",
        data: {
          lastBlock,
          transactions,
        },
      }) // Send a message to the worker thread, asking it to mine.
    })
  }

  // Collect a list of transactions to mine
  const states: Record<string, any> = {}
  const transactionsToMine = []

  const existedAddresses = await stateDB.keys().all()

  for (const tx of chainInfo.transactionPool) {
    const txSenderAddress = tx.from

    // NOTES: update sender's balance
    if (
      tx.data.type === TransactionTypeEnum.STAKE ||
      tx.data.type === TransactionTypeEnum.COIN_PURCHASE
    ) {
      if (!states[txSenderAddress]) {
        const senderState = await stateDB
          .get(txSenderAddress)
          .then((data) => JSON.parse(data))

        // skip stake if the sender doesn't have enough balance
        if (senderState.balance < tx.data.amount) continue

        states[txSenderAddress] = senderState
        states[txSenderAddress].balance -= tx.data.amount
      } else {
        // skip stake if the sender doesn't have enough balance
        if (states[txSenderAddress].balance < tx.data.amount) continue

        states[txSenderAddress].balance -= tx.data.amount
      }
    }

    // NOTES: update receiver's balance
    if (tx.data.type === TransactionTypeEnum.COIN_PURCHASE) {
      if (!existedAddresses.includes(tx.to) && !states[tx.to]) {
        states[tx.to] = {
          address: tx.to,
          balance: 0,
        }
      }

      if (existedAddresses.includes(tx.to) && !states[tx.to]) {
        states[tx.to] = await stateDB
          .get(tx.to)
          .then((data) => JSON.parse(data))
      }

      states[tx.to].balance += tx.data.amount
    }

    // NOTES: update user transaction history
    if (!blockchainTransactions.includes(tx.data.type)) {
      const txHash = tx.getHash()

      // NOTES: update sender outgoing transactions
      if (!states[txSenderAddress]) {
        const senderState = await stateDB
          .get(txSenderAddress)
          .then((data) => JSON.parse(data))

        states[txSenderAddress] = senderState
      }
      states[txSenderAddress].outgoingTransactions = [
        ...(states[txSenderAddress].outgoingTransactions ?? []),
        txHash,
      ]

      // NOTES: update receiver incoming transactions
      if (!existedAddresses.includes(tx.to) && !states[tx.to]) {
        states[tx.to] = {
          address: tx.to,
          balance: 0,
          incomingTransactions: [],
        }
      }
      if (existedAddresses.includes(tx.to) && !states[tx.to]) {
        states[tx.to] = await stateDB
          .get(tx.to)
          .then((data) => JSON.parse(data))
      }
      states[tx.to].incomingTransactions = [
        ...(states[tx.from].incomingTransactions ?? []),
        txHash,
      ]
    }

    // add to the list of transactions to mine
    transactionsToMine.push(tx)
  }

  const rewardTransaction = new Transaction({
    from: keyPair.getPublic("hex"),
    to: publicKey,
    data: {
      type: TransactionTypeEnum.MINING_REWARD,
      minedTransaction: transactionsToMine.map((tx) => tx.getHash()),
    },
  })
  rewardTransaction.sign(keyPair)

  transactionsToMine.unshift(rewardTransaction)

  // Mine the block. `return` ensures `await mine()` in loopMine waits for full completion.
  return startWorker(chainInfo.latestBlock, transactionsToMine)
    .then(async (result) => {
      // If the block is not mined before, we will add it to our chain and broadcast this new block.
      if (!mined) {
        const newBlock = new Block({
          ...result,
          data: result.data.map((tx) => new Transaction(tx)),
        })

        await blockDB.put(newBlock.number.toString(), JSON.stringify(newBlock)) // Add block to chain
        await bhashDB.put(newBlock.hash, newBlock.number.toString()) // Assign block number to the matching block hash

        // Assign transaction index and block number to transaction hash
        for (let txIndex = 0; txIndex < newBlock.data.length; txIndex++) {
          const tx = newBlock.data[txIndex]
          const txHash = tx.getHash()

          await txhashDB.put(
            txHash,
            newBlock.number.toString() + " " + txIndex.toString()
          )

          // update the node stake
          if (tx.data.type === TransactionTypeEnum.STAKE)
            await chainInfo.consensus.update(tx.to, tx.data.amount)
        }

        chainInfo.latestBlock = newBlock // Update latest block cache

        // Reward
        const rewardTransaction = newBlock.data[0]
        const isMinerAddressExist = existedAddresses.includes(
          rewardTransaction.to
        )
        const totalTransaction = newBlock.data.length - 1

        if (!isMinerAddressExist && !states[rewardTransaction.to]) {
          states[rewardTransaction.to] = {
            address: rewardTransaction.to,
            balance: 0,
          }
        }

        if (isMinerAddressExist && !states[rewardTransaction.to]) {
          states[rewardTransaction.to] = await stateDB
            .get(rewardTransaction.to)
            .then((data) => JSON.parse(data))
        }

        states[rewardTransaction.to].balance += totalTransaction

        for (const account of Object.keys(states))
          await stateDB.put(account, JSON.stringify(states[account]))

        // Update the new transaction pool (remove all the transactions that are no longer valid).
        chainInfo.transactionPool = clearDepreciatedTransaction(
          chainInfo.transactionPool,
          newBlock.data
        )

        sendMessage(
          produceMessage(MessageTypeEnum.PUBLISH_BLOCK, newBlock),
          [...connectedNodes.values()].map((node) => node.socket)
        ) // Broadcast the new block

        console.log(
          `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Block #${
            chainInfo.latestBlock.number
          } mined and synced, state transited.`
        )
      } else {
        mined = false
      }

      // Re-create the worker thread
      worker.kill()

      worker = fork(`${__dirname}/../miner/worker.ts`)
    })
    .catch((err) =>
      console.log(
        `\x1b[31mERROR\x1b[0m [${new Date().toISOString()}] Error at mining child process`,
        err
      )
    )
}

const transactionHandler = async (transaction: Transaction) => {
  const [isValid, error] = await validateTransaction(
    transaction,
    chainInfo,
    stateDB
  )

  if (isValid) {
    chainInfo.transactionPool.push(transaction)
    console.log(
      `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Added one transaction to pool.`
    )

    sendMessage(
      produceMessage(MessageTypeEnum.CREATE_TRANSACTION, transaction),
      [...connectedNodes.values()].map((node) => node.socket)
    )
    console.log(
      `\x1b[32mLOG\x1b[0m [${new Date().toISOString()}] Sent one transaction.`
    )
  } else {
    console.log(
      `\x1b[31mERROR\x1b[0m [${new Date().toISOString()}] Failed to add one transaction to pool: ${error}`
    )
  }

  return isValid
}

export { startServer }
