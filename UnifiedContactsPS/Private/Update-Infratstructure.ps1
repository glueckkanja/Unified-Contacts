function Update-Infrastructure {
    param(
        $SubscriptionId,
        $DestContext,
        $ResourceGroupName,
        $StorageAcccountName,
        $AppServiceName,
        $SelectedVersion
    )
    $updateDictionary = Get-UpdateDictionary -AppServiceName $AppServiceName -ResourceGroupName $ResourceGroupName

    # Sort the keys based on dependencies
    $updateSteps = Get-UpdateStepKeysInOrderByDependency -UpdateDictionary $updateDictionary
    Set-AzStorageAccount -ResourceGroup $ResourceGroupName -Name $StorageAcccountName -AllowSharedKeyAccess $true | out-null
    Start-Sleep -Seconds 20 # Wait for the storage account to be updated
    $timeout = (Get-Date).AddMinutes(10)

    while (-not ((Get-AzStorageAccount -ResourceGroup $ResourceGroupName -Name $StorageAcccountName).AllowSharedKeyAccess) -and (Get-Date) -lt $timeout) {
        Start-Sleep -Seconds 5
    }

    if ($null -eq (Get-AzStorageTable -Name $Script:tableName -Context $DestContext -ErrorAction SilentlyContinue)) {
        New-AzStorageTable -Name $Script:tableName -Context $DestContext | Out-Null
    }
    $timeout = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $timeout) {
        
        $AzureTable = Get-AzTableTable -TableName $Script:tableName -ResourceGroup $ResourceGroupName -StorageAccountName $StorageAcccountName
        if ($null -ne $AzureTable) {
            break
        }
        Start-Sleep -Seconds 5
    }
    
    foreach ($updateStep in $updateSteps) {
        if ($null -eq (Get-AzTableRow -table $AzureTable -partitionKey $Script:partitionKey -rowKey $updateStep) -and (Compare-SemVer $SelectedVersion $updateDictionary[$updateStep].MinVersion)) {
            foreach ($dependency in $updateDictionary[$updateStep].Dependencies) {
                if ($null -eq (Get-AzTableRow -table $AzureTable -partitionKey $Script:partitionKey -rowKey $dependency)) {
                    throw "Update step $updateStep has not been executed because dependency $dependency has not been executed"
                    exit 1;
                }
            }
            $checkAllowSharedKeyAccess = $true
            $tryCount = 0
            while ($checkAllowSharedKeyAccess) {
                try {
                    $tryCount++
                    Invoke-Command -ScriptBlock $updateDictionary[$updateStep].Function -ArgumentList $updateDictionary[$updateStep].Parameters
                    Add-AzTableRow -table  $AzureTable -partitionKey $Script:partitionKey -rowKey $updateStep | Out-Null
                    $checkAllowSharedKeyAccess = $false
                }
                catch [System.Management.Automation.MethodInvocationException] {
                    if ($tryCount -gt 5) {
                        Write-Error "Update step $updateStep failed Error: $_" -ErrorAction 'Continue'
                        throw "Update step $updateStep failed Error: $_"
                        exit 1;
                    }
                    Start-Sleep -Seconds 30
                }
                catch {
                    Write-Error "Update step $updateStep failed Error: $_" -ErrorAction 'Continue'
                    throw "Update step $updateStep failed Error: $_"
                    exit 1;
                }
            }
        }
    }
}