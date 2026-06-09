# 🌐 IoT Integration untuk AgriChain

## Ringkasan

Integrasi IoT telah berhasil ditambahkan ke project AgriChain untuk monitoring real-time kondisi pengiriman benih. Sistem ini mengintegrasikan sensor IoT data ke dalam blockchain transactions untuk transparansi penuh rantai pasok.

---

## 📋 Komponen yang Ditambahkan

### 1. **IoT Types** (`src/types/iot.ts`)
Definisi interface untuk semua tipe data IoT:

```typescript
// Interface Utama
- GpsLocation: Koordinat GPS pengiriman
- EnvironmentalMetrics: Suhu, kelembaban, tekanan udara
- ShipmentCondition: Deteksi getaran, jatuh, kemiringan
- IoTSensorReading: Pembacaan sensor individual
- IoTMetadata: Metadata lengkap pengiriman dengan penilaian risiko
- IoTTransactionData: Data transaksi yang embedded dengan IoT metadata
```

### 2. **IoT Controller** (`src/api/controller/IoTController.ts`)
Handler untuk 4 endpoint IoT utama:

```typescript
POST /api/iot/sensor-reading
  → Terima pembacaan sensor tunggal dari device

POST /api/iot/assess-shipment
  → Analisis risiko kerusakan dari multiple readings
  → Hitung suhu rata-rata, deteksi impact, scoring risiko
  → Return: damage risk level (LOW/MEDIUM/HIGH)

POST /api/iot/simulate-journey
  → Simulasi IoT journey dengan data acak (untuk testing)
  → Params: deviceId, readings_count, duration_hours, lokasi awal
  → Ideal untuk demo tanpa hardware fisik

GET /api/iot/health
  → Check status sistem IoT
  → Return: status dan list endpoint yang tersedia
```

### 3. **IoT Routes** (`src/api/routes/IoTRoute.ts`)
Router Express untuk endpoint IoT dengan dokumentasi lengkap.

### 4. **Enhanced Seed Script** (`seed.ps1` - UPDATED)
Seed script sekarang menjalankan IoT simulation:

```powershell
# Step 5 (NEW): Simulate IoT Sensor Journeys
- Simulate IoT journey untuk Padi (12 readings, 24 jam)
- Simulate IoT journey untuk Jagung (10 readings, 18 jam)  
- Simulate IoT journey untuk Kedelai (8 readings, 15 jam)

# Step 6-7 (UPDATED): Transfer with IoT Data
- Create transactions dengan IoT metadata embedded
- Each transaksi berisi:
  - Basic info: crop, variety, quantity, notes
  - IoT Data: temperature readings, humidity, GPS coordinates
  - Risk Assessment: damage risk level & indicators
```

### 5. **IoT Dashboard** (`dashboard.html` - UPDATED)
Dashboard sekarang menampilkan IoT metrics:

**Stat Cards:**
- 📡 Device Aktif: Jumlah IoT devices yang aktif
- 📊 Total Readings: Total pembacaan sensor
- ⚠️ Peringatan: Jumlah shipment dengan risiko MEDIUM/HIGH
- ✅ Status Baik: Jumlah shipment dengan risiko LOW

**Visualisasi:**
- 🌡️ Histogram Distribusi Suhu
- 💧 Histogram Distribusi Kelembaban
- ⚡ Pie Chart Status Risiko (LOW/MEDIUM/HIGH)
- 📍 Device Tracking List (real-time device status)

---

## 🚀 Cara Menggunakan

### 1. Jalankan Server
```bash
npm run dev
```

### 2. Jalankan Seed dengan IoT Data
```powershell
# Navigate ke project directory
cd "path/to/agrichain-capstone"

# Jalankan seed script (sekarang dengan IoT simulation)
.\seed.ps1
```

Seed script akan:
- Generate wallet untuk 3 aktor (petani, distributor, pengecer)
- Beli dan stake coin
- Registrasi 3 jenis benih
- **[NEW] Simulate IoT journeys** dengan sensor data
- Transfer benih dengan embedded IoT metadata
- Total waktu: ~3-4 menit

### 3. Akses Dashboard
Buka browser:
```
http://localhost:5010/dashboard
```

Dashboard akan menampilkan:
- Blockchain metrics (existing)
- Supply chain tracking (existing)
- **[NEW] IoT sensor metrics dan visualisasi**

---

## 📡 Test IoT Endpoints Dengan Postman

### 1. Check IoT Health
```
GET http://localhost:5010/api/iot/health
```

Response:
```json
{
  "message": "IoT system is operational",
  "status": "OPERATIONAL",
  "supportedSensors": ["DHT22", "BME280", "NEO6M", "MPU6050", "MAX30100"],
  "endpoints": {...}
}
```

### 2. Simulate IoT Journey
```
POST http://localhost:5010/api/iot/simulate-journey?deviceId=IOT_TEST_001&readings_count=12&duration_hours=24
```

Response akan berisi:
- 12 simulated sensor readings
- Temperature, humidity, GPS data untuk setiap reading
- Damage risk assessment untuk seluruh journey

### 3. Assess Shipment Risk
```
POST http://localhost:5010/api/iot/assess-shipment

Body:
{
  "readings": [
    {
      "timestamp": 1718025600,
      "deviceInfo": {"deviceId": "IOT_001"},
      "location": {"latitude": -6.1751, "longitude": 106.865},
      "environmental": {"temperature": 25.5, "humidity": 65},
      "condition": {"shaking": false, "freefall": false}
    }
  ],
  "startLocation": {"latitude": -6.1751, "longitude": 106.865},
  "endLocation": {"latitude": -6.9288, "longitude": 107.6693}
}
```

---

## 📊 Damage Risk Calculation

Risk level dihitung berdasarkan indikator:

```
📌 Damage Indicators:
- HIGH_TEMP: Temperature > 30°C
- LOW_TEMP: Temperature < 10°C
- HUMIDITY_RISK: Humidity < 30% atau > 80%
- IMPACT_DETECTED: Freefall atau getaran terdeteksi
- EXCESSIVE_VIBRATION: Kemiringan > 45°
- POOR_GPS_SIGNAL: Signal strength rendah
- LONG_DURATION: Pengiriman terlalu lama

🎯 Risk Scoring:
- 0 indicators = LOW risk ✅
- 1-2 indicators = MEDIUM risk ⚠️
- 3+ indicators = HIGH risk ❌
```

---

## 🔗 IoT Data dalam Blockchain

Setiap transaksi supply chain sekarang dapat berisi IoT metadata:

```json
{
  "from": "petani_public_key",
  "to": "distributor_public_key",
  "lastTransactionHash": "hash_registrasi_benih",
  "data": {
    "type": "BENIH_TRANSFER",
    "crop": "Padi",
    "variety": "IR64",
    "quantity": 50,
    "unit": "kg",
    "notes": "Distribusi ke agen (monitored dengan IoT)",
    "iotMetadata": {
      "readings": [...],  // Array pembacaan sensor
      "damageRiskLevel": "LOW",
      "damageIndicators": [],
      "journeyDuration": 86400,  // detik
      "totalDistance": 45.2,     // km
      "notes": "No issues detected"
    }
  }
}
```

---

## 🛠️ Development & Hardware Integration

### Sensor yang Didukung
| Sensor | Fungsi | Harga |
|--------|--------|-------|
| **DHT22** | Temperature & Humidity | ~$5 |
| **BME280** | T, H, Pressure | ~$8 |
| **NEO6M** | GPS | ~$15 |
| **MPU6050** | Accelerometer & Gyroscope | ~$10 |
| **MAX30100** | Pulse & Oxygen (opsional) | ~$20 |

### Microcontroller
- **ESP32** (~$10): WiFi + BLE, ideal untuk IoT
- **Arduino** (~$5): Budget option

### Setup Real Hardware
1. Flash firmware ke ESP32
2. Config WiFi credentials
3. Setup MQTT/REST endpoint ke: `http://localhost:5010/api/iot/sensor-reading`
4. Device akan send sensor data secara periodik
5. Dashboard akan real-time update

---

## 📝 API Documentation

### POST `/api/iot/sensor-reading`
Receive single sensor reading
- Body: `{ deviceInfo, location, environmental, condition, timestamp? }`
- Response: 201 dengan reading yang diterima

### POST `/api/iot/assess-shipment`  
Assess damage risk untuk shipment
- Body: `{ readings[], startLocation?, endLocation?, journeyDuration?, notes? }`
- Response: Assessment dengan risk level & indicators

### POST `/api/iot/simulate-journey`
Simulate IoT journey (testing)
- Query: `?deviceId=X&readings_count=12&duration_hours=24&start_lat=X&start_lng=X`
- Response: Simulated readings dengan risk assessment

### GET `/api/iot/health`
Check IoT system health
- Response: System status & available endpoints

---

## 🎯 Next Steps (Future Enhancements)

1. **Real MQTT Broker Integration**
   - Connect actual MQTT broker untuk multiple device
   - PubSub pattern untuk live updates

2. **Database untuk IoT Readings**
   - Store readings di separate database (MongoDB/PostgreSQL)
   - Query historical data

3. **Advanced Risk Scoring**
   - Machine learning untuk predict kerusakan
   - Anomaly detection pada sensor data

4. **Mobile App**
   - Real-time notification saat ada anomali
   - QR code scanning untuk benih tracking

5. **Compliance Reporting**
   - Automated report generation
   - Export data untuk regulasi pemerintah

---

## 📚 File Structure

```
src/
  types/
    iot.ts                          [NEW] IoT type definitions
  api/
    controller/
      IoTController.ts              [NEW] IoT handlers
    routes/
      IoTRoute.ts                   [NEW] IoT router
      index.ts                      [UPDATED] Added IoT routes
dashboard.html                      [UPDATED] Added IoT metrics section
seed.ps1                            [UPDATED] Added IoT simulation
```

---

## ✅ Checklist

- [x] Create IoT types & interfaces
- [x] Create IoT Controller dengan 4 endpoints
- [x] Create IoT Routes
- [x] Update routes index.ts
- [x] Update seed.ps1 dengan IoT simulation
- [x] Update dashboard dengan IoT metrics
- [x] Add damage risk calculation logic
- [ ] Real hardware integration (future)
- [ ] MQTT broker setup (future)
- [ ] Machine learning prediction (future)

---

## 🎉 Kesimpulan

IoT integration telah sepenuhnya terintegrasi ke AgriChain! Sistem sekarang bisa:

✅ Collect IoT sensor data dari device (atau simulate)
✅ Assess damage risk secara real-time
✅ Store IoT metadata dalam blockchain transactions
✅ Visualisasi IoT metrics di dashboard
✅ Trace complete supply chain dengan sensor data

Sistem ini memberikan **full transparency** dari registrasi benih hingga ke tangan pengecer, dengan verified sensor data untuk memastikan kualitas. 🌾

---

**Created:** 2026-06-10  
**Last Updated:** 2026-06-10  
**Version:** 1.0.0
