function Get-LatestModuleVersion {

    $ModuleName = "UnifiedContactsPS"
    $installedModule = Get-InstalledModule -Name $ModuleName -ErrorAction SilentlyContinue
    if ($installedModule) {
        $latestModule = Find-Module -Name $ModuleName

        if ($latestModule) {
            $installedVersion = $installedModule.Version
            $latestVersion = $latestModule.Version

            if ($installedVersion -lt $latestVersion) {
                throw "You have version $installedVersion of $ModuleName installed, but the latest version is $latestVersion. Please update the module first: Update-Module $ModuleName"
            }
        }
    }

    $ModuleName = "AzTable"
    if ($null -eq (Get-InstalledModule -Name $ModuleName -ErrorAction SilentlyContinue)) {
        Write-Host "Installing required module $($ModuleName)" -ForegroundColor Green
        Install-Module $ModuleName -Scope CurrentUser -Force
        if ($null -eq (Get-InstalledModule -Name $ModuleName -ErrorAction SilentlyContinue)) {
            throw "Failed to install module $($ModuleName)"
        }
    }
}


