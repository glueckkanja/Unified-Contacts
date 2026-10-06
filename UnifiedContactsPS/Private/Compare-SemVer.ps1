function Compare-SemVer {
    param (
        [string]$Version1,
        [string]$Version2
    )

    # Normalize GitHub tags like 'v1.2.3', 'v.1.2.3' or 'v1.2.3-dev-abc123' to a plain version
    function ConvertTo-PlainVersion([string]$Version) {
        $normalized = $Version.Trim() -replace '^[vV]\.?', ''
        $normalized = ($normalized -split '[-+]')[0]
        return [version]$normalized
    }

    $v1 = ConvertTo-PlainVersion $Version1
    $v2 = ConvertTo-PlainVersion $Version2

    return $v1 -ge $v2
}