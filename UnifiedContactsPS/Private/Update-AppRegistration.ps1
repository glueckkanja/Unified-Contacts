function Update-AppRegistration {
    param(
        $App,
        $AdminConsentDisplayName,
        $PermissionScopeValue,
        $Permissions,
        $AppRegistrationName,
        $AdminConsentDescription,
        $ApplicationIdUri,
        $RequestedAccessTokenVersion,
        $AddAppRole
    )
    $ErrorActionPreference = "Stop"

    $permissionScope = New-Object Microsoft.Azure.Powershell.Cmdlets.Resources.MSGraph.Models.ApiV10.MicrosoftGraphPermissionScope
    $permissionScope.Id = New-Guid
    $permissionScope.AdminConsentDescription = $AdminConsentDescription
    $permissionScope.AdminConsentDisplayName = $AdminConsentDisplayName
    $permissionScope.IsEnabled = $true
    $permissionScope.Type = "Admin" 
    $permissionScope.UserConsentDescription = $null
    $permissionScope.UserConsentDisplayName = $null
    $permissionScope.Value = $PermissionScopeValue


    $api = $App.Api
    $api.Oauth2PermissionScope = $permissionScope
    $api.RequestedAccessTokenVersion = $RequestedAccessTokenVersion

    # Newly created app registrations may not be replicated in Microsoft Graph yet
    $timeout = (Get-Date).AddMinutes(5)
    while ($null -eq (Get-AzADApplication -ObjectId $App.Id -ErrorAction SilentlyContinue) -and (Get-Date) -lt $timeout) {
        Start-Sleep -Seconds 10
    }

    if ($AddAppRole) {
        $appRole = New-Object Microsoft.Azure.PowerShell.Cmdlets.Resources.MSGraph.Models.ApiV10.MicrosoftGraphAppRole
        $appRole.AllowedMemberType = @("Application")
        $appRole.Description = "Allows to read and write (create, update, delete) database contacts"
        $appRole.DisplayName = "Contacts.Database.ReadWrite.All"
        $appRole.Id = New-Guid
        $appRole.IsEnabled = $true
        $appRole.Value = "Contacts.Database.ReadWrite.All"
    }

    $tryCount = 0
    while ($true) {
        try {
            if ($AddAppRole) {
                Update-AzADApplication -ObjectId $App.Id -Api $api -AppRole $appRole -IdentifierUri $ApplicationIdUri | Out-Null
            }
            else {
                Update-AzADApplication -ObjectId $App.Id -Api $api -IdentifierUri $ApplicationIdUri | Out-Null
            }
            break
        }
        catch {
            $tryCount++
            # Retry NotFound - Graph replication can lag behind Get-AzADApplication
            if ($tryCount -ge 6 -or $_.Exception.Message -notmatch 'NotFound') { throw }
            Start-Sleep -Seconds 10
        }
    }
    $graphID = "00000003-0000-0000-c000-000000000000" 

    foreach ($id in $Permissions) {
        Add-AzADAppPermission -ApiId $graphID -ObjectId $App.Id -PermissionId $id | Out-Null
    }

    try {
        $logoUri = "https://graph.microsoft.com/v1.0/applications/$($App.Id)/logo"
        $graphTokenSecure = Get-AzAccessToken -ResourceUrl https://graph.microsoft.com -AsSecureString
        # Convert SecureString to plain text for API call
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($graphTokenSecure.Token)
        $graphToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        $header = @{"Authorization" = "Bearer $graphToken" } 
        Invoke-WebRequest -Uri  "https://unifiedcontacts.blob.core.windows.net/arm-templates/Unified-Contacts-Pro-350.png" -OutFile "./Unified-Contacts-Pro-350.png" | Out-Null
        $logoFilePath = "./Unified-Contacts-Pro-350.png"
        Invoke-RestMethod -Method Put -Uri $logoUri -ContentType 'image/png' -InFile $logoFilePath -Headers $header | Out-Null
    }
    catch {
        #fall through
    }
   
}

function Set-TeamsAsAuthorizedClientApplication {
    param(
        $App
    )

    $scope = $App.Api.Oauth2PermissionScope[0]

    $api = $app.Api

    foreach ($clientId in @("cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", "1fec8e78-bce4-4aaf-ab1b-5451cc387264", "e1829006-9cf1-4d05-8b48-2e665cb48e6a", "5e3ce6c0-2b1f-4285-8d4b-75ee78787346")) {
        
        $PreAuthorizedApplicationObject = New-Object Microsoft.Azure.Powershell.Cmdlets.Resources.MSGraph.Models.ApiV10.MicrosoftGraphPreAuthorizedApplication

        $PreAuthorizedApplicationObject.AppId = $clientId
        $PreAuthorizedApplicationObject.DelegatedPermissionId = $scope.Id
        $api.PreAuthorizedApplication += $PreAuthorizedApplicationObject
    }

    Update-AzADApplication -ObjectId $App.Id -Api $api | Out-Null
}