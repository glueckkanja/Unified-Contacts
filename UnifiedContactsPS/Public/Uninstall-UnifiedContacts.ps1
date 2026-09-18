function Uninstall-UnifiedContacts {
    [CmdletBinding()]
    Param(
        [Parameter (Mandatory = $true, HelpMessage = "The Url you can copy from your browser when you open the App Service. Format: https://portal.azure.com/#<domain>/resource/subscriptions/<subscriptionId>/resourceGroups/<ressourceGroupName>/providers/Microsoft.Web/sites/<appServiceName>/appServices")][string]$AppServiceAzureUrl
    )
    $ErrorActionPreference = "Stop"

    Import-Module Az.Resources
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
    try {
        $appService = Get-AzWebApp -ResourceGroupName  $ResourceGroup -Name $AppServiceName
        if ($appService) {
            try {
                $teamsAppName = ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "AppRegistrationNameTeamsApp" }).value
                $adminAppName = ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "AppRegistrationNameAdminPage" }).value

                Remove-AzADApplication -DisplayName $teamsAppName | Out-Null
                Remove-AzADApplication -DisplayName $adminAppName | Out-Null
            }
            catch {
                Write-Warning "Could not remove app registrations: $($_.Exception.Message)"
            }
       
            try {
                $VaultName = ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "KeyVaultName" }).value
                if ($VaultName) {

                    Set-AzKeyVaultAccessPolicy -VaultName $VaultName -ObjectId (Get-SignedInUser).Id -PermissionsToSecrets get, set, delete, list | Out-Null
                    $keyVaultSecrets = Get-AzKeyVaultSecret -VaultName $VaultName
                    foreach ($secret in $keyVaultSecrets) {
                        Remove-AzKeyVaultSecret -VaultName $VaultName -Name $secret.Name -Force | Out-Null
                    }
                }
            }
            catch {
                Write-Warning "Could not remove Key Vault secrets: $($_.Exception.Message)"
            }
            try {
                $fireWallRule = Get-AzSqlServerFirewallRule -ResourceGroupName $ResourceGroup -ServerName ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "SQLServer" }).value -FirewallRuleName AllowAllAzureIPs
                if ($fireWallRule) { 
                    Remove-AzSqlServerFirewallRule -ResourceGroupName $ResourceGroup -ServerName ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq "SQLServer" }).value -FirewallRuleName $fireWallRule.FirewallRuleName
                }
            }
            catch {
                Write-Warning "Could not remove SQL firewall rule: $($_.Exception.Message)"
            }
        }
        Write-Host "Uninstallation of Unified Contacts was successful" -ForegroundColor Green
    }
    catch {
        Write-DetailedError -ErrorRecord $_ -Step "Uninstall"
    }
    
    Remove-AzResourceGroup -Name $ResourceGroup 
}