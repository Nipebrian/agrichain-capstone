/**
 * IoT Integration Types
 * Defines interfaces for IoT sensor data integration with AgriChain blockchain
 */

export interface GpsLocation {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
}

export interface EnvironmentalMetrics {
  temperature: number // Celsius
  humidity: number // Percentage (0-100)
  pressure?: number // hPa
  airQuality?: number // PM2.5 μg/m³
}

export interface ShipmentCondition {
  shaking: boolean // Accelerometer detects vibration
  freefall: boolean // Free-fall detected (drop/impact)
  tilt?: number // Angle in degrees
  acceleration?: number // G-force
}

export interface IoTDeviceInfo {
  deviceId: string // Unique device identifier
  deviceName?: string
  manufacturer?: string // e.g., "ESP32", "Arduino"
  firmwareVersion?: string
  batteryLevel?: number // 0-100 percentage
}

export interface IoTSensorReading {
  timestamp: number // Unix timestamp
  deviceInfo: IoTDeviceInfo
  location: GpsLocation
  environmental: EnvironmentalMetrics
  condition: ShipmentCondition
  signalStrength?: number // RSSI for WiFi/GSM (-120 to 0 dBm)
}

export interface IoTMetadata {
  readings: IoTSensorReading[]
  startLocation?: GpsLocation
  endLocation?: GpsLocation
  totalDistance?: number // km
  journeyDuration?: number // seconds
  damageRiskLevel: "LOW" | "MEDIUM" | "HIGH" // Auto-calculated
  damageIndicators: string[] // e.g., ["HIGH_TEMP", "IMPACT_DETECTED"]
  notes?: string
}

export interface IoTTransactionData {
  type: "BENIH_TRANSFER" | "BENIH_REGISTRATION" | "BENIH_RECEIVE"
  crop: string
  variety?: string
  quantity: number
  unit: string
  location?: string
  notes?: string
  // IoT specific
  iotMetadata?: IoTMetadata
}

/**
 * Damage Risk Calculation Rules
 * - Temperature > 30°C = HIGH_TEMP
 * - Humidity < 30% or > 80% = HUMIDITY_RISK
 * - Freefall/Impact detected = IMPACT_DETECTED
 * - If 2+ indicators = MEDIUM risk
 * - If 3+ indicators = HIGH risk
 * - Otherwise = LOW risk
 */
export enum DamageIndicator {
  HIGH_TEMP = "HIGH_TEMP",
  LOW_TEMP = "LOW_TEMP",
  HUMIDITY_RISK = "HUMIDITY_RISK",
  IMPACT_DETECTED = "IMPACT_DETECTED",
  EXCESSIVE_VIBRATION = "EXCESSIVE_VIBRATION",
  POOR_GPS_SIGNAL = "POOR_GPS_SIGNAL",
  LONG_DURATION = "LONG_DURATION",
}

export enum IoTSensorType {
  DHT22 = "DHT22", // Temperature & Humidity
  BME280 = "BME280", // Temperature, Humidity, Pressure
  NEO6M = "NEO6M", // GPS
  MPU6050 = "MPU6050", // Accelerometer & Gyroscope
  MAX30100 = "MAX30100", // Pulse & Oxygen
}
