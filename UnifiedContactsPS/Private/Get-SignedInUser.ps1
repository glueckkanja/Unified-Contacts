function Get-SignedInUser {
    # Resolves the signed-in user even when the login e-mail differs from the tenant UPN (e.g. guest accounts)
    $user = Get-AzADUser -SignedIn -ErrorAction SilentlyContinue
    if ($null -eq $user) {
        $accountId = (Get-AzContext).Account.Id
        $user = Get-AzADUser -UserPrincipalName $accountId -ErrorAction SilentlyContinue
        if ($null -eq $user) {
            $user = Get-AzADUser -Mail $accountId -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($null -eq $user) {
            # Guest UPNs look like 'user_domain.com#EXT#@tenant.onmicrosoft.com'
            $guestUpnPrefix = ($accountId -replace '@', '_') -replace "'", "''"
            $user = Get-AzADUser -Filter "startsWith(userPrincipalName, '$guestUpnPrefix')" -ErrorAction SilentlyContinue | Select-Object -First 1
        }
    }
    if ($null -eq $user) {
        throw "Could not resolve the signed-in user '$((Get-AzContext).Account.Id)' in Microsoft Entra ID. Please make sure the account exists in the target tenant."
    }
    return $user
}
