$base = "http://localhost:5010/api"
$ordererPriv = "d9b85966f02549132e8e68ffb4f9cd5d38cfea75830286a397e17281c3f2c58b"
$ordererPub  = "047ef91754d9e78767be0abfa8cec958e8f335e042150e9cc56501df222d04a22ef0509151f15c4caa9d45ba2876d3cf0cf181732e20129c06643d8ed9ee00f6b4"

function Post($path, $body) {
    Invoke-RestMethod -Method POST -Uri "$base$path" -Headers @{"Content-Type"="application/json"} -Body ($body | ConvertTo-Json -Depth 5)
}

Write-Host "=== [1] Generate wallets for petani, distributor, pengecer ==="
$petani     = (Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST).data
$distributor = (Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST).data
$pengecer   = (Invoke-RestMethod -Uri "$base/user/generate-wallet" -Method POST).data

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
Write-Host "=== [4] Register 3 benih (petani as recipient) ==="
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
Write-Host "=== [5] Transfer benih petani -> distributor ==="
$t1_padi    = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashPadi
    data                = @{ type="BENIH_TRANSFER"; crop="Padi"; notes="Distribusi ke agen"; quantity=50; unit="kg" }
}
$t1_jagung  = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashJagung
    data                = @{ type="BENIH_TRANSFER"; crop="Jagung"; notes="Distribusi ke agen"; quantity=30; unit="kg" }
}
$t1_kedelai = Post "/transaction/create" @{
    from                = $petani.publicKey
    to                  = $distributor.publicKey
    privateKey          = $petani.privateKey
    lastTransactionHash = $hashKedelai
    data                = @{ type="BENIH_TRANSFER"; crop="Kedelai"; notes="Distribusi ke agen"; quantity=25; unit="kg" }
}

$hashT1Padi    = $t1_padi.hash
$hashT1Jagung  = $t1_jagung.hash
$hashT1Kedelai = $t1_kedelai.hash

Write-Host "  Transfer1 Padi:    $($hashT1Padi.Substring(0,20))..."
Write-Host "  Transfer1 Jagung:  $($hashT1Jagung.Substring(0,20))..."
Write-Host "  Transfer1 Kedelai: $($hashT1Kedelai.Substring(0,20))..."
Write-Host "  Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== [6] Transfer benih distributor -> pengecer ==="
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Padi
    data                = @{ type="BENIH_TRANSFER"; crop="Padi"; notes="Distribusi ke pengecer"; quantity=50; unit="kg" }
} | Out-Null
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Jagung
    data                = @{ type="BENIH_TRANSFER"; crop="Jagung"; notes="Distribusi ke pengecer"; quantity=30; unit="kg" }
} | Out-Null
Post "/transaction/create" @{
    from                = $distributor.publicKey
    to                  = $pengecer.publicKey
    privateKey          = $distributor.privateKey
    lastTransactionHash = $hashT1Kedelai
    data                = @{ type="BENIH_TRANSFER"; crop="Kedelai"; notes="Distribusi ke pengecer"; quantity=25; unit="kg" }
} | Out-Null

Write-Host "  3 final transfer txns in pool. Waiting 20s for block..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== SEED COMPLETE ==="
Write-Host "Expected: 6 blocks (genesis + 5 data blocks), 9 agri txns"
