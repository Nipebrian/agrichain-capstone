import { Router } from "express"
import catcher from "../helper/handler"
import {
  getOverview,
  getTransactionAnalytics,
  getSupplyChainAnalytics,
  getStakingAnalytics,
  getBlockAnalytics,
  getIoTAnalytics,
} from "../controller/AnalyticsController"

const router = Router()

router.get("/overview", catcher(getOverview))
router.get("/transactions", catcher(getTransactionAnalytics))
router.get("/supply-chain", catcher(getSupplyChainAnalytics))
router.get("/staking", catcher(getStakingAnalytics))
router.get("/blocks", catcher(getBlockAnalytics))
router.get("/iot", catcher(getIoTAnalytics))

export default router
