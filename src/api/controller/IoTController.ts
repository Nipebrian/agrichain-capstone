/**
 * IoT Controller
 * Handles IoT sensor data reception, validation, and risk assessment
 */

import type { Request, Response } from "express"
import { IoTTypes } from "../../types"

/**
 * Calculate damage risk level based on sensor readings
 */
const calculateDamageRisk = (
  environmental: IoTTypes.EnvironmentalMetrics,
  condition: IoTTypes.ShipmentCondition
): { level: "LOW" | "MEDIUM" | "HIGH"; indicators: string[] } => {
  const indicators: string[] = []

  // Check temperature
  if (environmental.temperature > 30) {
    indicators.push(IoTTypes.DamageIndicator.HIGH_TEMP)
  } else if (environmental.temperature < 10) {
    indicators.push(IoTTypes.DamageIndicator.LOW_TEMP)
  }

  // Check humidity
  if (environmental.humidity < 30 || environmental.humidity > 80) {
    indicators.push(IoTTypes.DamageIndicator.HUMIDITY_RISK)
  }

  // Check shipment condition
  if (condition.freefall || condition.shaking) {
    indicators.push(IoTTypes.DamageIndicator.IMPACT_DETECTED)
  }

  if (condition.tilt && condition.tilt > 45) {
    indicators.push(IoTTypes.DamageIndicator.EXCESSIVE_VIBRATION)
  }

  // Determine risk level
  let level: "LOW" | "MEDIUM" | "HIGH" = "LOW"
  if (indicators.length >= 3) {
    level = "HIGH"
  } else if (indicators.length >= 2) {
    level = "MEDIUM"
  }

  return { level, indicators }
}

/**
 * POST /api/iot/sensor-reading
 * Receive a single IoT sensor reading
 * @body { deviceInfo, location, environmental, condition, timestamp }
 */
const receiveSensorReading = async (req: Request, res: Response) => {
  try {
    const { deviceInfo, location, environmental, condition, timestamp } =
      req.body as Omit<IoTTypes.IoTSensorReading, "timestamp"> & {
        timestamp?: number
      }

    // Validate required fields
    if (!deviceInfo || !location || !environmental || !condition) {
      return res.status(400).json({
        message: "Missing required fields: deviceInfo, location, environmental, condition",
      })
    }

    if (!deviceInfo.deviceId) {
      return res.status(400).json({
        message: "deviceInfo.deviceId is required",
      })
    }

    const reading: IoTTypes.IoTSensorReading = {
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      deviceInfo,
      location,
      environmental,
      condition,
    }

    res.status(201).json({
      message: "Sensor reading received successfully",
      data: reading,
    })
  } catch (err) {
    res.status(500).json({
      message: "Error processing sensor reading",
      error: String(err),
    })
  }
}

/**
 * POST /api/iot/assess-shipment
 * Assess damage risk for a shipment with multiple IoT readings
 * @body { readings: IoTSensorReading[], startLocation?, endLocation?, journeyDuration? }
 */
const assessShipment = async (req: Request, res: Response) => {
  try {
    const { readings, startLocation, endLocation, journeyDuration, notes } =
      req.body as Partial<IoTTypes.IoTMetadata>

    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({
        message: "readings array is required and must not be empty",
      })
    }

    // Aggregate readings to get overall statistics
    let avgTemp = 0
    let avgHumidity = 0
    let maxTemp = -Infinity
    let minTemp = Infinity
    let hasImpact = false
    let hasShaking = false

    const damageIndicators: Set<string> = new Set()

    readings.forEach((reading) => {
      avgTemp += reading.environmental.temperature
      avgHumidity += reading.environmental.humidity
      maxTemp = Math.max(maxTemp, reading.environmental.temperature)
      minTemp = Math.min(minTemp, reading.environmental.temperature)

      if (reading.condition.freefall) hasImpact = true
      if (reading.condition.shaking) hasShaking = true
    })

    avgTemp /= readings.length
    avgHumidity /= readings.length

    // Calculate overall risk based on aggregated data
    const aggregatedEnv: IoTTypes.EnvironmentalMetrics = {
      temperature: avgTemp,
      humidity: avgHumidity,
    }

    const aggregatedCondition: IoTTypes.ShipmentCondition = {
      shaking: hasShaking,
      freefall: hasImpact,
    }

    const riskAssessment = calculateDamageRisk(aggregatedEnv, aggregatedCondition)

    // Calculate journey distance if coordinates available
    let totalDistance = 0
    if (startLocation && endLocation) {
      const R = 6371 // Earth's radius in km
      const dLat =
        ((endLocation.latitude - startLocation.latitude) * Math.PI) / 180
      const dLng =
        ((endLocation.longitude - startLocation.longitude) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((startLocation.latitude * Math.PI) / 180) *
          Math.cos((endLocation.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      totalDistance = R * c
    }

    const metadata: IoTTypes.IoTMetadata = {
      readings,
      startLocation,
      endLocation,
      totalDistance,
      journeyDuration,
      damageRiskLevel: riskAssessment.level,
      damageIndicators: riskAssessment.indicators,
      notes,
    }

    res.json({
      message: "Shipment assessment completed",
      data: {
        metadata,
        statistics: {
          readingsCount: readings.length,
          temperatureStats: {
            average: parseFloat(avgTemp.toFixed(2)),
            max: parseFloat(maxTemp.toFixed(2)),
            min: parseFloat(minTemp.toFixed(2)),
          },
          humidityAverage: parseFloat(avgHumidity.toFixed(2)),
          hasImpact,
          hasShaking,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      message: "Error assessing shipment",
      error: String(err),
    })
  }
}

/**
 * POST /api/iot/simulate-journey
 * Simulate an IoT journey with random sensor data (for testing/demo)
 * @query { deviceId, readings_count?, duration_hours? }
 */
const simulateIoTJourney = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      readings_count = 12,
      duration_hours = 24,
      start_lat = -6.1751,
      start_lng = 106.865,
    } = req.query as Record<string, any>

    if (!deviceId) {
      return res.status(400).json({
        message: "Query parameter 'deviceId' is required",
      })
    }

    const readingsCount = parseInt(readings_count) || 12
    const durationHours = parseInt(duration_hours) || 24
    const startLat = parseFloat(start_lat) || -6.1751
    const startLng = parseFloat(start_lng) || 106.865

    const readings: IoTTypes.IoTSensorReading[] = []
    const startTime = Math.floor(Date.now() / 1000) - durationHours * 3600
    const timeInterval = Math.floor((durationHours * 3600) / readingsCount)

    for (let i = 0; i < readingsCount; i++) {
      const timestamp = startTime + i * timeInterval

      // Simulate moving coordinates
      const latChange = (Math.random() - 0.5) * 0.02
      const lngChange = (Math.random() - 0.5) * 0.02

      // Simulate temperature variation
      const tempBase = 20 + Math.sin((i / readingsCount) * Math.PI * 2) * 8
      const tempVariation = (Math.random() - 0.5) * 4
      const temperature = Math.max(5, Math.min(35, tempBase + tempVariation))

      // Simulate humidity variation
      const humidityBase = 65 + Math.sin((i / readingsCount) * Math.PI * 4) * 15
      const humidity = Math.max(30, Math.min(90, humidityBase))

      // Random chance of impact/shaking
      const hasImpact = Math.random() > 0.95
      const hasShaking = Math.random() > 0.8

      const reading: IoTTypes.IoTSensorReading = {
        timestamp,
        deviceInfo: {
          deviceId,
          deviceName: `Device-${deviceId}`,
          manufacturer: "ESP32",
          firmwareVersion: "1.0.0",
          batteryLevel: Math.max(10, 100 - (i / readingsCount) * 30),
        },
        location: {
          latitude: startLat + latChange,
          longitude: startLng + lngChange,
          altitude: 100 + Math.random() * 50,
          accuracy: 5 + Math.random() * 10,
        },
        environmental: {
          temperature: parseFloat(temperature.toFixed(1)),
          humidity: parseFloat(humidity.toFixed(1)),
          pressure: 1013 + Math.random() * 20,
        },
        condition: {
          shaking: hasShaking,
          freefall: hasImpact,
          tilt: Math.random() * 30,
        },
        signalStrength: -60 - Math.random() * 40,
      }

      readings.push(reading)
    }

    // Assess the simulated journey
    const riskAssessment = calculateDamageRisk(
      readings[readings.length - 1].environmental,
      readings[readings.length - 1].condition
    )

    res.json({
      message: "IoT journey simulated successfully",
      data: {
        deviceId,
        readingsCount: readings.length,
        readings,
        assessment: {
          damageRiskLevel: riskAssessment.level,
          damageIndicators: riskAssessment.indicators,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      message: "Error simulating IoT journey",
      error: String(err),
    })
  }
}

/**
 * GET /api/iot/health
 * Check IoT system health and connectivity
 */
const getIoTHealth = async (req: Request, res: Response) => {
  res.json({
    message: "IoT system is operational",
    status: "OPERATIONAL",
    supportedSensors: Object.values(IoTTypes.IoTSensorType),
    endpoints: {
      receiveSensorReading: "POST /api/iot/sensor-reading",
      assessShipment: "POST /api/iot/assess-shipment",
      simulateJourney: "POST /api/iot/simulate-journey",
    },
    timestamp: new Date().toISOString(),
  })
}

export {
  receiveSensorReading,
  assessShipment,
  simulateIoTJourney,
  getIoTHealth,
  calculateDamageRisk,
}
