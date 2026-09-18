
# PowerShell Module structure based on https://stackoverflow.com/a/44512990/4054714

#Get public and private function definition files.
$Private = @( Get-ChildItem -Path $PSScriptRoot\Private\*.ps1 -ErrorAction SilentlyContinue -Recurse )
$Public  = @( Get-ChildItem -Path $PSScriptRoot\Public\*.ps1 -ErrorAction SilentlyContinue -Recurse)

#Dot source the files
Foreach($import in @($Private + $Public))
{
    Try
    {
        .$import.fullname
        Write-Verbose "Imported $($import.fullname)"
    }
    Catch
    {
        Write-Error -Message "Failed to import function $($import.fullname): $_"
    }
}

Export-ModuleMember -Function Install-UnifiedContacts
Export-ModuleMember -Function Uninstall-UnifiedContacts
Export-ModuleMember -Function Update-UnifiedContacts
Export-ModuleMember -Function Reset-UnifiedContacts