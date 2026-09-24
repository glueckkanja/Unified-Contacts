function Update-DotNetVersionTo10 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AppServiceName,
        [Parameter(Mandatory = $true)]
        [string]$ResourceGroupName
    )
    $ErrorActionPreference = "Stop"
    $appService = Get-AzWebApp -ResourceGroupName  $ResourceGroupName -Name $AppServiceName
    if ($appService.SiteConfig.LinuxFxVersion -ne "DOTNETCORE|10.0") {
        az webapp config set --name $AppServiceName --resource-group $ResourceGroupName --linux-fx-version "DOTNETCORE|10.0"  | Out-Null
    }
}
