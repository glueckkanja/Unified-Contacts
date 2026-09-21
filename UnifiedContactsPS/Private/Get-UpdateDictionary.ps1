function Get-UpdateDictionary {
    #the dictionary will contain future infrastructure updates
    
    param([Parameter(Mandatory = $true)]
        [string]$AppServiceName,
        [Parameter(Mandatory = $true)]
        [string]$ResourceGroupName)
    $updateDictionary = @{
        'Add-PreAuthorizedApplicationForStandAloneApp' = [PSCustomObject]@{
            Function     = ${function:Add-PreAuthorizedApplicationForStandAloneApp}
            MinVersion   = "5.3.11"
            Dependencies = @("Add-AppIdsToAppServiceConfig")
            Parameters   = @($AppServiceName, $ResourceGroupName)
        }
        'Add-AppIdsToAppServiceConfig'                 = [PSCustomObject]@{
            Function     = ${function:Add-AppIdsToAppServiceConfig}
            MinVersion   = "1.0.0"
            Dependencies = $null
            Parameters   = @($AppServiceName, $ResourceGroupName)
        }
        'Update-DotNetVersionTo8'                      = [PSCustomObject]@{
            Function     = ${function:Update-DotNetVersionTo8}
            MinVersion   = "5.4.5"
            Dependencies = $null
            Parameters   = @($AppServiceName, $ResourceGroupName)
        }
        'Update-DotNetVersionTo10'                     = [PSCustomObject]@{
            Function     = ${function:Update-DotNetVersionTo10}
            MinVersion   = "6.1.0"
            Dependencies = $null
            Parameters   = @($AppServiceName, $ResourceGroupName)
        }
        'ApplicationPermissionEntraIdFilter'                      = [PSCustomObject]@{
            Function     = ${function:Add-ApplicationPermissionEntraIdFilter}
            MinVersion   = "5.6.6"
            Dependencies = @("Add-AppIdsToAppServiceConfig")
            Parameters   = @($AppServiceName, $ResourceGroupName)
        }
    }

    return $updateDictionary 
}
