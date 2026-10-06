function Write-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][int]$Percent,
        [string]$Activity = "Unified Contacts"
    )
    # Track the current phase in the caller so its catch block can report where the failure happened
    Set-Variable -Name currentStep -Value $Status -Scope 1
    Write-Progress -Activity $Activity -Status $Status -PercentComplete $Percent
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Status" -ForegroundColor Gray
}

function Write-DetailedError {
    param(
        [Parameter(Mandatory = $true)][System.Management.Automation.ErrorRecord]$ErrorRecord,
        [string]$Step = "Unknown"
    )
    Write-Host ""
    Write-Host "===== ERROR DETAILS =====" -ForegroundColor Red
    Write-Host "Failed step:  $Step" -ForegroundColor Red
    Write-Host "Error:        $($ErrorRecord.Exception.Message)" -ForegroundColor Red
    Write-Host "Exception:    $($ErrorRecord.Exception.GetType().FullName)" -ForegroundColor Red
    $inner = $ErrorRecord.Exception.InnerException
    while ($null -ne $inner) {
        Write-Host "Inner:        [$($inner.GetType().FullName)] $($inner.Message)" -ForegroundColor Red
        $inner = $inner.InnerException
    }
    if ($ErrorRecord.InvocationInfo -and $ErrorRecord.InvocationInfo.PositionMessage) {
        Write-Host "Location:" -ForegroundColor Red
        Write-Host $ErrorRecord.InvocationInfo.PositionMessage -ForegroundColor DarkGray
    }
    if ($ErrorRecord.ScriptStackTrace) {
        Write-Host "Stack trace:" -ForegroundColor Red
        Write-Host $ErrorRecord.ScriptStackTrace -ForegroundColor DarkGray
    }
    Write-Host "=========================" -ForegroundColor Red
}
