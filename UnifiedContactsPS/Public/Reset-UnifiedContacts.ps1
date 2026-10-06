function Reset-UnifiedContacts {
    [CmdletBinding()]
    Param(
        [Parameter (Mandatory = $true, HelpMessage = "The Url you can copy from your browser when you open the App Service. Format: https://portal.azure.com/#<domain>/resource/subscriptions/<subscriptionId>/resourceGroups/<ressourceGroupName>/providers/Microsoft.Web/sites/<appServiceName>/appServices")][string]$AppServiceAzureUrl
    )
    $ErrorActionPreference = "Stop"

    Import-Module Az.Resources
    try {
        Write-Host "AppServiceAzureUrl: $AppServiceAzureUrl"
        $ResourceGroup = (($AppServiceAzureUrl -Split "resourceGroups/")[1] -Split "/")[0]
        $SubscriptionId = (($AppServiceAzureUrl -Split "subscriptions/")[1] -Split "/")[0]
        $AppServiceName = (($AppServiceAzureUrl -Split "sites/")[1] -Split "/")[0]

        Write-Host "ResourceGroup: $ResourceGroup`nSubscriptionId: $SubscriptionId`nAppServiceName: $AppServiceName"
        try {
            $context = Get-AzContext
        }
        catch {
            #fall through
        }
        if (!$context -or ($context.Subscription.Id -notlike $SubscriptionId)) {
            Connect-AzAccount -Subscription $SubscriptionId -UseDeviceAuthentication | Out-Null
        }
        #refresh Context
        $context = Get-AzContext
        $appService = Get-AzWebApp -ResourceGroupName  $ResourceGroup -Name $AppServiceName
    
        $me = Get-SignedInUser
        $storageAccountName = ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "StorageAccountName" }).value 
        try {
            Remove-AzRoleAssignment -ObjectId $me.Id -Scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName/" -RoleDefinitionName "Storage Blob Data Contributor" | Out-Null
        }
        catch {
            #fall through
        }
        
        Start-Sleep -Seconds 10
        New-AzRoleAssignment -ObjectId $me.Id -Scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName/" -RoleDefinitionName "Storage Blob Data Contributor" | Out-Null
    
        Copy-Binaries -Destination $storageAccountName

    ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "WEBSITE_RUN_FROM_PACKAGE" }).value = "https://$(($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "AppSettings__BlobStorageUrl" }).value)/unified-contacts/binaries.zip"
        $settings = @{}
        foreach ($appsetting in $appService.SiteConfig.AppSettings) {
            $settings.add($appsetting.Name, $appsetting.Value)
        }
        Set-AzWebApp -ResourceGroupName $ResourceGroup -Name $AppServiceName -AppSettings $settings | Out-Null
        Write-Host "Reset of Unified Contacts was succesful" -ForegroundColor Green
    }
    catch {
        Write-DetailedError -ErrorRecord $_ -Step "Reset"
        if ($appService) {
            try {
                ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "WEBSITE_RUN_FROM_PACKAGE" }).value = "https://unifiedcontacts.blob.core.windows.net/unified-contacts-releases/stable/1.4.0/ucPublish_1.4.0_824b8e82-0fd0-4b7e-b220-bdc90fdf4f69.zip"
                $settings = @{}
                foreach ($appsetting in $appService.SiteConfig.AppSettings) {
                    $settings.add($appsetting.Name, $appsetting.Value)
                }
                Set-AzWebApp -ResourceGroupName $ResourceGroup -Name $AppServiceName -AppSettings $settings | Out-Null
            }
            catch {
                Write-Warning "Could not restore app settings: $($_.Exception.Message)"
            }
        }
        Write-Host "Reset of Unified Contacts has failed. Please try to run Reset-UnifiedContacts again or go to the Unified Contacts Admin center to update to the newest version." -ForegroundColor Red
    }
}