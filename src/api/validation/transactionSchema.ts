import * as yup from "yup"

const transactionSchema = yup.object({
  privateKey: yup.string().optional(),
  from: yup.string().required(),
  to: yup.string().required(),
  data: yup.object().unknown(true),
  lastTransactionHash: yup.string().nullable().optional(),
  signature: yup.string().optional(),
})

const singTransactionSchema = yup.object({
  privateKey: yup.string().required(),
  from: yup.string().required(),
  to: yup.string().required(),
  data: yup.object().unknown(true),
  lastTransactionHash: yup.string().nullable().optional(),
})

const coinTransferSchema = yup.object({
  privateKey: yup.string().required(),
  address: yup.string().required(),
  amount: yup.number().required(),
})

const coinStakeSchema = yup.object({
  privateKey: yup.string().required(),
  amount: yup.number().required(),
})

const createBenihSchema = yup.object({
  address: yup.string().required(),
  data: yup.object().unknown(true).required(),
})

const purchaseCoinSchema = yup.object({
  address: yup.string().required(),
  amount: yup.number().required(),
})

type TransactionInterface = yup.InferType<typeof transactionSchema>
type SignTransactionInterface = yup.InferType<typeof singTransactionSchema>
type CoinTransferInterface = yup.InferType<typeof coinTransferSchema>
type CoinStakeInterface = yup.InferType<typeof coinStakeSchema>
type CreateBenihInterface = yup.InferType<typeof createBenihSchema>
type PurchaseCoinInterface = yup.InferType<typeof purchaseCoinSchema>

export {
  transactionSchema,
  coinTransferSchema,
  coinStakeSchema,
  createBenihSchema,
  purchaseCoinSchema,
  SignTransactionInterface,
  TransactionInterface,
  CoinTransferInterface,
  CoinStakeInterface,
  CreateBenihInterface,
  PurchaseCoinInterface,
}
