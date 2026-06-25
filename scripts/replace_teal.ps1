$directoriesToSearch = @("app", "components", "context", "utils", "supabase")
$extensionsToInclude = @("*.js", "*.jsx", "*.css", "*.sql")

foreach ($dir in $directoriesToSearch) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Include $extensionsToInclude -Recurse -File | ForEach-Object {
            $file = $_.FullName
            $content = Get-Content -Path $file -Raw
            if ($content -match "teal") {
                $newContent = $content -replace "teal", "violet" -replace "Teal", "Violet" -replace "TEAL", "VIOLET"
                Set-Content -Path $file -Value $newContent -NoNewline
                Write-Output "Updated: $file"
            }
        }
    }
}
Write-Output "Done replacing teal with violet."
