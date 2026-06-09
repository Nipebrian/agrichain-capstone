import express from "express"
import StateRoute from "./StateRoute"
import BlockRoute from "./BlockRoute"
import BlockchainRoute from "./BlockchainRoute"
import TransactionRoute from "./TransactionRoute"
import UserRoute from "./UserRoute"
import AnalyticsRoute from "./AnalyticsRoute"
import IoTRoute from "./IoTRoute"

const router = express.Router()

router.get("/", function (_req, res) {
  return res.status(200).json({
    message: "Welcome to API. Check the documentation for more information",
  })
})

router.use("/node", StateRoute)
router.use("/block", BlockRoute)
router.use("/blockchain", BlockchainRoute)
router.use("/transaction", TransactionRoute)
router.use("/user", UserRoute)
router.use("/analytics", AnalyticsRoute)
router.use("/iot", IoTRoute)

export default router
