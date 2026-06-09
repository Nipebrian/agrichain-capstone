$ErrorActionPreference = 'Stop'
Write-Host "SEED SCRIPT STARTED" -ForegroundColor Cyan
$base = "http://localhost:5010/api"
$ordererPriv = "d9b85966f02549132e8e68ffb4f9cd5d38cfea75830286a397e17281c3f2c58b"
$ordererPub  = "047ef91754d9e78767be0abfa8cec958e8f335e042150e9cc56501df222d04a22ef0509151f15c4caa9d45ba2876d3cf0cf181732e20129c06643d8ed9ee00f6b4"

function Post($path, $body) {
    try {
        if ($body) {
            $result = Invoke-RestMethod -Method POST -Uri "$base$path" -Headers @{"Content-Type"="application/json"} -Body ($body | ConvertTo-Json -Depth 5) -ErrorAction Stop
        } else {
            $result = Invoke-RestMethod -Method POST -Uri "$base$path" -Headers @{"Content-Type"="application/json"} -ErrorAction Stop
        }
        return $result
    } catch {
        Write-Host "ERROR: POST $path - $_" -ForegroundColor Red
        return $null
    }
}

function Get($path) {
    try {
        $result = Invoke-RestMethod -Method GET -Uri "$base$path" -Headers @{"Content-Type"="application/json"} -ErrorAction Stop
        return $result
    } catch {
        Write-Host "ERROR: GET $path - $_" -ForegroundColor Red
        return $null
    }
}

Write-Host "+------------------------------------------------------------+"
Write-Host "|       AgriChain Seed Script with IoT Integration          |"
Write-Host "+------------------------------------------------------------+"
Write-Host ""

Write-Host "=== [0] Waiting for server to be ready ==="
$maxRetry = 20
$attempt  = 0
$ready    = $false
while ($attempt -lt $maxRetry) {
    $attempt++
    try {
        Invoke-RestMethod -Uri "$base/blockchain/state" -Method GET -ErrorAction Stop -TimeoutSec 3 | Out-Null
        Write-Host "  Server is ready!"
        $ready = $true
        break
    } catch {
        $msg = "  Waiting for server... attempt " + $attempt + " of " + $maxRetry
        Write-Host $msg
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    Write-Host "ERROR: Server not ready. Make sure npm run dev is running." -ForegroundColor Red
    [System.Environment]::Exit(1)
}
Start-Sleep -Seconds 2



Write-Host ""
Write-Host "=== [1] Generate wallets for petani, distributor, pengecer ==="
try {
    $resp1 = Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST -ErrorAction Stop
    $petani = $resp1.data
    if (-not $petani -or -not $petani.publicKey) { Write-Host "ERROR: petani wallet null" -ForegroundColor Red; [System.Environment]::Exit(1) }
    
    $resp2 = Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST -ErrorAction Stop
    $distributor = $resp2.data
    if (-not $distributor -or -not $distributor.publicKey) { Write-Host "ERROR: distributor wallet null" -ForegroundColor Red; [System.Environment]::Exit(1) }
    
    $resp3 = Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST -ErrorAction Stop
    $pengecer = $resp3.data
    if (-not $pengecer -or -not $pengecer.publicKey) { Write-Host "ERROR: pengecer wallet null" -ForegroundColor Red; [System.Environment]::Exit(1) }
} catch {
    Write-Host "ERROR generating wallets: $_" -ForegroundColor Red
    [System.Environment]::Exit(1)
}


Write-Host "DEBUG: petani = $($petani | ConvertTo-Json)"
Write-Host "  petani=$($petani.publicKey.Substring(0,20))..."
Write-Host "  distributor=$($distributor.publicKey.Substring(0,20))..."
Write-Host "  pengecer=$($pengecer.publicKey.Substring(0,20))..."

Write-Host ""
Write-Host "=== [2] Purchase coins for all parties ==="
Post "/transaction/purchase-coin" @{ address=$ordererPub;         amount=100000 } | Out-Null
Post "/transaction/purchase-coin" @{ address=$petani.publicKey;   amount=5000   } | Out-Null
Post "/transaction/purchase-coin" @{ address=$distributor.publicKey; amount=5000 } | Out-Null
Post "/transaction/purchase-coin" @{ address=$pengecer.publicKey;   amount=5000  } | Out-Null
Write-Host "  4 purchase-coin txns in pool. Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== [3] Stake coins ==="
Post "/transaction/stake" @{ privateKey=$ordererPriv;            amount=50 } | Out-Null
Post "/transaction/stake" @{ privateKey=$petani.privateKey;      amount=5  } | Out-Null
Post "/transaction/stake" @{ privateKey=$distributor.privateKey; amount=3  } | Out-Null
Post "/transaction/stake" @{ privateKey=$pengecer.privateKey;    amount=2  } | Out-Null
Write-Host "  4 stake txns in pool. Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== [4] Register 3 benih - petani as recipient ==="
$r_padi    = Post "/transaction/create-benih" @{
    address = $petani.publicKey
    data    = @{ type="BENIH_REGISTRATION"; crop="Padi"; variety="IR64"; quantity=50; unit="kg"; location="Semarang, Jawa Tengah" }
}
$r_jagung  = Post "/transaction/create-benih" @{
    address = $petani.publicKey
    data    = @{ type="BENIH_REGISTRATION"; crop="Jagung"; variety="NK22"; quantity=30; unit="kg"; location="Magelang, Jawa Tengah" }
}
$r_kedelai = Post "/transaction/create-benih" @{
    address = $petani.publicKey
    data    = @{ type="BENIH_REGISTRATION"; crop="Kedelai"; variety="Anjasmoro"; quantity=25; unit="kg"; location="Purworejo, Jawa Tengah" }
}

$hashPadi    = $r_padi.hash
$hashJagung  = $r_jagung.hash
$hashKedelai = $r_kedelai.hash

Write-Host "  Padi hash:    $($hashPadi.Substring(0,20))..."
Write-Host "  Jagung hash:  $($hashJagung.Substring(0,20))..."
Write-Host "  Kedelai hash: $($hashKedelai.Substring(0,20))..."
Write-Host "  Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== [5] Simulate IoT Sensor Journeys ==="
Write-Host "  Simulating IoT journey for Padi..."
$iot_padi = Post '/iot/simulate-journey?deviceId=IOT_PADI_001&readings_count=12&duration_hours=24&start_lat=-7.0500&start_lng=110.3892'
Write-Host "  * Padi IoT journey created: $($iot_padi.data.assessment.damageRiskLevel) risk"

Write-Host "  Simulating IoT journey for Jagung..."
$iot_jagung = Post '/iot/simulate-journey?deviceId=IOT_JAGUNG_001&readings_count=10&duration_hours=18&start_lat=-7.4833&start_lng=109.9917'
Write-Host "  * Jagung IoT journey created: $($iot_jagung.data.assessment.damageRiskLevel) risk"

Write-Host "  Simulating IoT journey for Kedelai..."
$iot_kedelai = Post '/iot/simulate-journey?deviceId=IOT_KEDELAI_001&readings_count=8&duration_hours=15&start_lat=-7.7111&start_lng=110.3875'
Write-Host "  * Kedelai IoT journey created: $($iot_kedelai.data.assessment.damageRiskLevel) risk"

Write-Host ""
Write-Host "=== [6] Transfer benih petani -> distributor (WITH IoT DATA) ==="
$t1_padi    = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashPadi
    data                = @{ 
        type="BENIH_TRANSFER"
        crop="Padi"
        variety="IR64"
        notes="Distribusi ke agen (monitored dengan IoT)"
        quantity=50
        unit="kg"
        iotMetadata         = @{
            readings = $iot_padi.data.readings
            damageRiskLevel = $iot_padi.data.assessment.damageRiskLevel
            damageIndicators = $iot_padi.data.assessment.damageIndicators
        }
    }
}
$t1_jagung  = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashJagung
    data                = @{
        type="BENIH_TRANSFER"
        crop="Jagung"
        variety="NK22"
        notes="Distribusi ke agen (monitored dengan IoT)"
        quantity=30
        unit="kg"
        iotMetadata         = @{
            readings = $iot_jagung.data.readings
            damageRiskLevel = $iot_jagung.data.assessment.damageRiskLevel
            damageIndicators = $iot_jagung.data.assessment.damageIndicators
        }
    }
}
$t1_kedelai = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashKedelai
    data                = @{
        type="BENIH_TRANSFER"
        crop="Kedelai"
        variety="Anjasmoro"
        notes="Distribusi ke agen (monitored dengan IoT)"
        quantity=25
        unit="kg"
        iotMetadata         = @{
            readings = $iot_kedelai.data.readings
            damageRiskLevel = $iot_kedelai.data.assessment.damageRiskLevel
            damageIndicators = $iot_kedelai.data.assessment.damageIndicators
        }
    }
}

$hashT1Padi    = $t1_padi.hash
$hashT1Jagung  = $t1_jagung.hash
$hashT1Kedelai = $t1_kedelai.hash

Write-Host "  Transfer1 Padi:    $($hashT1Padi.Substring(0,20))... (Risk: $($iot_padi.data.assessment.damageRiskLevel))"
Write-Host "  Transfer1 Jagung:  $($hashT1Jagung.Substring(0,20))... (Risk: $($iot_jagung.data.assessment.damageRiskLevel))"
Write-Host "  Transfer1 Kedelai: $($hashT1Kedelai.Substring(0,20))... (Risk: $($iot_kedelai.data.assessment.damageRiskLevel))"
Write-Host "  Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== [7] Transfer benih distributor -> pengecer (WITH IoT DATA) ==="
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Padi
    data                = @{
        type="BENIH_TRANSFER"
        crop="Padi"
        variety="IR64"
        notes="Distribusi ke pengecer (monitored dengan IoT)"
        quantity=50
        unit="kg"
        iotMetadata         = @{
            readings = $iot_padi.data.readings
            damageRiskLevel = $iot_padi.data.assessment.damageRiskLevel
            damageIndicators = $iot_padi.data.assessment.damageIndicators
        }
    }
} | Out-Null
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Jagung
    data                = @{
        type="BENIH_TRANSFER"
        crop="Jagung"
        variety="NK22"
        notes="Distribusi ke pengecer (monitored dengan IoT)"
        quantity=30
        unit="kg"
        iotMetadata         = @{
            readings = $iot_jagung.data.readings
            damageRiskLevel = $iot_jagung.data.assessment.damageRiskLevel
            damageIndicators = $iot_jagung.data.assessment.damageIndicators
        }
    }
} | Out-Null
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Kedelai
    data                = @{
        type="BENIH_TRANSFER"
        crop="Kedelai"
        variety="Anjasmoro"
        notes="Distribusi ke pengecer (monitored dengan IoT)"
        quantity=25
        unit="kg"
        iotMetadata         = @{
            readings = $iot_kedelai.data.readings
            damageRiskLevel = $iot_kedelai.data.assessment.damageRiskLevel
            damageIndicators = $iot_kedelai.data.assessment.damageIndicators
        }
    }
} | Out-Null

Write-Host "  3 final transfer txns in pool. Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== SEED COMPLETE WITH IoT INTEGRATION ==="
Write-Host "Expected: 8 blocks (genesis + 7 data blocks), 9 agri txns with IoT metadata"
Write-Host ""
Write-Host "[*] IoT Dashboard endpoints available:"
Write-Host "  - GET http://localhost:5010/api/iot/health"
Write-Host "  - POST http://localhost:5010/api/iot/assess-shipment"
Write-Host "  - POST http://localhost:5010/api/iot/sensor-reading"
Write-Host ""
