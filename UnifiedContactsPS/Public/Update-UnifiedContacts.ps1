function Update-UnifiedContacts {
    [CmdletBinding()]
    Param(
        [Parameter (Mandatory = $true, HelpMessage = "The Url you can copy from your browser when you open the App Service. Format: https://portal.azure.com/#<domain>/resource/subscriptions/<subscriptionId>/resourceGroups/<ressourceGroupName>/providers/Microsoft.Web/sites/<appServiceName>/appServices")][string]$AppServiceAzureUrl,
        [Parameter (Mandatory = $false, HelpMessage = "Choose your release channel.")][ValidateSet('Release', 'Prerelease')][string]$ReleaseChannel
    )
    $ErrorActionPreference = "Stop"
    $currentStep = "Initialization"
    $resourceGroup = (($AppServiceAzureUrl -Split "resourceGroups/")[1] -Split "/")[0]
    $subscriptionId = (($AppServiceAzureUrl -Split "subscriptions/")[1] -Split "/")[0]
    $appServiceName = (($AppServiceAzureUrl -Split "sites/")[1] -Split "/")[0]


    Write-Host "ResourceGroup: $resourceGroup`nSubscriptionId: $subscriptionId`nAppServiceName: $appServiceName"
    Import-Module Az.Resources
    try {
        Get-LatestModuleVersion
        try {
            $context = Get-AzContext
        }
        catch {
            #fall through
        }
        if ($null -eq $context) {
            [void] (Connect-AzAccount -Subscription $subscriptionId)
        }
        elseif ($context.Subscription.Id -ne $subscriptionId) {
            [void] (Set-AzContext -Subscription $subscriptionId)
        }
        Write-Step "Get Web App Information" 5 -Activity "Update Unified Contacts"
        $appService = Get-AzWebApp -ResourceGroupName  $resourceGroup -Name $appServiceName
        if ($null -eq ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq $Script:AppServiceAzureUrlPropertyName })) {
            $settings = @{}
            foreach ($appsetting in $appService.SiteConfig.AppSettings) {
                $settings.add($appsetting.Name, $appsetting.Value)
            }
            $settings.add($Script:appServiceAzureUrlPropertyName, $AppServiceAzureUrl)
            Set-AzWebApp -ResourceGroupName $resourceGroup -Name $appServiceName -AppSettings $settings
        }
        
        $storageAccountName = ($appService.SiteConfig.AppSettings | where-object { $_.Name -eq $Script:storageAccountPropertyName }).value 
        $destContext = New-AzStorageContext -StorageAccountName $storageAccountName -UseConnectedAccount
        $me = Get-SignedInUser
        
        Write-Step "Check necessary permissions" 15 -Activity "Update Unified Contacts"
        # Update-Infrastructure creates the UpdateLog table, so both blob and table roles are needed up front
        foreach ($roleName in @("Storage Blob Data Contributor", "Storage Table Data Contributor")) {
            $role = Get-AzRoleAssignment -ObjectId $me.Id -Scope "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName/" -RoleDefinitionName $roleName
            if ($null -eq $role) {
                New-AzRoleAssignment -ObjectId $me.Id -Scope "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName/" -RoleDefinitionName $roleName | Out-Null
                $roleReady = $null 
                while ($null -eq $roleReady) {
                    Start-Sleep -Seconds 10 #wait for roleassignment to be present in Entra Id
                    $roleReady = Get-AzRoleAssignment -ObjectId $me.Id -Scope "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Storage/storageAccounts/$storageAccountName/" -RoleDefinitionName $roleName
                }
            }
        }

        Write-Step "Get selected release channel" 25 -Activity "Update Unified Contacts"

        # Get releases from GitHub
        $repoReleases = Invoke-RestMethod -Uri "https://api.github.com/repos/$($Script:repoUrl)/releases"
        
        # Default to latest stable release if no channel specified
        if ([string]::IsNullOrEmpty($ReleaseChannel)) {
            $title = "From which release channel do you want to update?"
            $prompt = "Enter your choice"
            $default = 0
            $choices = [System.Management.Automation.Host.ChoiceDescription[]] @(
                [System.Management.Automation.Host.ChoiceDescription]"&Release"
                [System.Management.Automation.Host.ChoiceDescription]"&Prerelease"
            )
            $choice = $host.UI.PromptForChoice($title, $prompt, $choices, $default)
            $ReleaseChannel = if ($choice -eq 0) { 'Release' } else { 'Prerelease' }
        }
        
        # Select the appropriate release based on channel
        if ($ReleaseChannel -eq 'Release') {
            # Latest stable release
            $selectedRelease = $repoReleases | Where-Object { -not $_.prerelease } | Select-Object -First 1
        } else {
            # Latest prerelease
            $selectedRelease = $repoReleases | Where-Object { $_.prerelease } | Select-Object -First 1
        }
        
        if ($null -eq $selectedRelease) {
            throw "No $ReleaseChannel found on GitHub ($($Script:repoUrl))"
        }
        
        $selectedChannel = @{
            name = $ReleaseChannel.ToLower()
            latestVersion = $selectedRelease.tag_name
            latestVersionRef = ($selectedRelease.assets | Where-Object { $_.name -eq "binaries.zip" }).browser_download_url
        }
        
        if ($null -eq $selectedChannel.latestVersionRef) {
            throw "Asset 'binaries.zip' not found in release $($selectedRelease.tag_name)"
        }

        Write-Step "Update Infrastructure" 40 -Activity "Update Unified Contacts"
        Update-Infrastructure -SubscriptionId  $subscriptionId -destContext $destContext -resourceGroupName $resourceGroup -storageAcccountName $storageAccountName -AppServiceName $appServiceName -selectedVersion $selectedChannel.latestVersion

        $currentVersion = ((Get-Version -AppService $appService).Content | ConvertFrom-Json).version
        if ($currentVersion -eq $selectedChannel.latestVersion) {
            Write-Host "The latest version is already deployed." -ForegroundColor Yellow
            return; 
        }
        Write-Step "Copy Binaries" 65 -Activity "Update Unified Contacts"
        Copy-Binaries -Destination $storageAccountName -Channel $selectedChannel.name | Out-Null

        Write-Step "Restart Web App" 75 -Activity "Update Unified Contacts"
        Restart-AzWebApp -ResourceGroupName $resourceGroup -Name $appServiceName | Out-Null
        Start-Sleep -Seconds 20
        $timeout = (Get-Date).AddMinutes(5)
        $responseReady = $null 
        $timeout = (Get-Date).AddMinutes(10)
        $restartedWebApp = $false
        while ((Get-Date) -lt $timeout) {
            Start-Sleep -Seconds 5 
            if ((Get-AzWebApp -Name $appServiceName -ResourceGroupName $resourceGroup).State -eq "Running") {
                # AppService has successfully restarted if we get a 2XX returned with the current version
                $responseReady = $null
                try {
                    $responseReady = Get-Version -AppService $appService -ErrorAction 'SilentlyContinue'
                }
                catch [Microsoft.PowerShell.Commands.HttpResponseException] {
                    $responseReady = $_.Exception.Response
                }
                catch {
                    Write-Warning "No Http-Error was thrown: $_"
                }
                if ($null -ne $responseReady -and $responseReady.StatusCode -ge 200 -and $responseReady.StatusCode -le 299 -and $null -ne $responseReady.Content -and ($responseReady.Content | ConvertFrom-Json).version -eq $selectedChannel.latestVersion) {
                    Write-Host "AppService successfully restarted" -ForegroundColor Green
                    $restartedWebApp = $true
                    break;
                }
            }
        }
        if ($restartedWebApp) { 
            Write-Host "Go to https://$($appService.hostnames[0]) to upload the Manifest."  -ForegroundColor Yellow
            Write-Host "Please refresh the Unified Contacts Admin Portal using Shift+F5 to refresh the cache."  -ForegroundColor Yellow
        }
        else {
            Write-Error "Restarting of App Service failed. Please try to restart the App Service manually ($appServiceAzureUrl) or try to update Unified Contacts again."
        }
    }
    catch {
        Write-DetailedError -ErrorRecord $_ -Step $currentStep
        Write-Error "Update failed at step '$currentStep'. Please try again later. Error: $($_.Exception.Message)" -ErrorAction 'Continue'
    }
}


