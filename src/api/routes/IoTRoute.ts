/**
 * IoT Routes
 * Endpoints for IoT sensor data management
 */

import { Router } from "express"
import {
  receiveSensorReading,
  assessShipment,
  simulateIoTJourney,
  getIoTHealth,
} from "../controller/IoTController"
import catcher from "../helper/handler"

const router = Router()

/**
 * @route GET /api/iot/health
 * @desc Check IoT system health
 * @access Public
 */
router.get("/health", catcher(getIoTHealth))

/**
 * @route POST /api/iot/sensor-reading
 * @desc Receive a single IoT sensor reading from a device
 * @access Public
 * @body {
 *   deviceInfo: { deviceId, deviceName?, manufacturer?, firmwareVersion?, batteryLevel? },
 *   location: { latitude, longitude, altitude?, accuracy? },
 *   environmental: { temperature, humidity, pressure?, airQuality? },
 *   condition: { shaking, freefall, tilt?, acceleration? },
 *   timestamp?: number (unix timestamp)
 * }
 * @example
 * POST /api/iot/sensor-reading
 * {
 *   "deviceInfo": { "deviceId": "IOT_001", "manufacturer": "ESP32" },
 *   "location": { "latitude": -6.1751, "longitude": 106.865 },
 *   "environmental": { "temperature": 25.5, "humidity": 65.0 },
 *   "condition": { "shaking": false, "freefall": false }
 * }
 */
router.post("/sensor-reading", catcher(receiveSensorReading))

/**
 * @route POST /api/iot/assess-shipment
 * @desc Assess damage risk for a complete shipment with multiple IoT readings
 * @access Public
 * @body {
 *   readings: IoTSensorReading[],
 *   startLocation?: { latitude, longitude },
 *   endLocation?: { latitude, longitude },
 *   journeyDuration?: number (seconds),
 *   notes?: string
 * }
 * @example
 * POST /api/iot/assess-shipment
 * {
 *   "readings": [
 *     {
 *       "timestamp": 1718025600,
 *       "deviceInfo": { "deviceId": "IOT_001" },
 *       "location": { "latitude": -6.1751, "longitude": 106.865 },
 *       "environmental": { "temperature": 25.5, "humidity": 65.0 },
 *       "condition": { "shaking": false, "freefall": false }
 *     }
 *   ],
 *   "startLocation": { "latitude": -6.1751, "longitude": 106.865 },
 *   "endLocation": { "latitude": -6.9288, "longitude": 107.6693 }
 * }
 */
router.post("/assess-shipment", catcher(assessShipment))

/**
 * @route POST /api/iot/simulate-journey
 * @desc Simulate an IoT journey with randomly generated sensor data (for testing/demo)
 * @access Public
 * @query {
 *   deviceId: string (required),
 *   readings_count?: number (default: 12),
 *   duration_hours?: number (default: 24),
 *   start_lat?: number (default: -6.1751),
 *   start_lng?: number (default: 106.865)
 * }
 * @example
 * POST /api/iot/simulate-journey?deviceId=IOT_001&readings_count=24&duration_hours=48
 */
router.post("/simulate-journey", catcher(simulateIoTJourney))

export default router
