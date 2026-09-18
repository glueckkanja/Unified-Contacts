function Copy-Binaries {
    param(
        $Destination,
        [ValidateSet('release', 'prerelease')]
        [string]$Channel = 'release'
    )
    $ErrorActionPreference = "Stop"

    # GitHub Repository Details
    $repo = $Script:repoUrl
    $assetName = "binaries.zip"
    
    try {
        # Setup Azure Storage context using the signed-in Azure AD account (requires Storage Blob Data Contributor)
        $destContext = New-AzStorageContext -StorageAccountName $Destination -UseConnectedAccount
        
        try { 
            New-AzStorageContainer -Name $Script:destinationContainer -Context $destContext -Permission Blob 
        }
        catch { 
            # Container might already exist, continue
        }

        # Get GitHub releases
        $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases"
        
        # Select release based on channel
        $selectedRelease = if ($Channel -eq 'release') {
            $releases | Where-Object { -not $_.prerelease } | Select-Object -First 1
        }
        else {
            $releases  | Where-Object { $_.prerelease } | Select-Object -First 1
        }
        
        if (-not $selectedRelease) {
            throw "No $Channel found on GitHub"
        }
        
        # Find the binaries.zip asset
        $asset = $selectedRelease.assets | Where-Object { $_.name -eq $assetName }
        if (-not $asset) {
            throw "Asset '$assetName' not found in the $Channel"
        }

        Write-Host "Downloading $assetName from $Channel $($selectedRelease.tag_name)..."

        # GitHub answers with a 302 to a CDN url, which Azure server-side copy cannot follow - download and upload instead
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) "binaries_$([guid]::NewGuid()).zip"
        try {
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tempFile
            Write-Host "Uploading $assetName to Azure Storage..."
            Set-AzStorageBlobContent -File $tempFile `
                -Container $Script:destinationContainer `
                -Blob $Script:destinationBlob `
                -Context $destContext `
                -Force | Out-Null
        }
        finally {
            Remove-Item $tempFile -ErrorAction SilentlyContinue
        }

        Write-Host "Successfully copied $assetName to Azure Storage"
        
        # Return release information for further processing
        return @{
            version     = $selectedRelease.tag_name
            downloadUrl = $asset.browser_download_url
            releaseType = $Channel
        }
    }
    catch {
        Write-Error "Failed to copy binaries: $_"
        throw
    }
}
