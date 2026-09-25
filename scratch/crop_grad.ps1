Add-Type -AssemblyName System.Drawing

$src = "C:\Users\phenm\.gemini\antigravity\brain\a915e594-9ecf-4910-bb25-55137ae52c53\.user_uploaded\media_1790252632617.jpg"
$dst = "c:\Users\phenm\OneDrive\Desktop\PHENMO WEBSITE\Images\graduation-marquee-letters-balloon-arch.jpg"

$img = [System.Drawing.Bitmap]::FromFile($src)
$w = $img.Width
$h = $img.Height

# Find top boundary (skip top black bar where status bar icons are)
$top = 0
for ($y = 0; $y -lt 120; $y++) {
    $darkCount = 0
    for ($x = 50; $x -lt ($w - 50); $x += 10) {
        $p = $img.GetPixel($x, $y)
        if ($p.R -lt 30 -and $p.G -lt 30 -and $p.B -lt 30) {
            $darkCount++
        }
    }
    # If less than 60% of the sampled pixels are black, content has started
    if ($darkCount -lt (($w - 100) / 10 * 0.6)) {
        $top = $y
        break
    }
}

# Find bottom boundary
$bottom = $h - 1
for ($y = $h - 1; $y -gt ($h - 120); $y--) {
    $darkCount = 0
    for ($x = 50; $x -lt ($w - 50); $x += 10) {
        $p = $img.GetPixel($x, $y)
        if ($p.R -lt 30 -and $p.G -lt 30 -and $p.B -lt 30) {
            $darkCount++
        }
    }
    if ($darkCount -lt (($w - 100) / 10 * 0.6)) {
        $bottom = $y
        break
    }
}

Write-Host "Top=$top, Bottom=$bottom"
$cropH = $bottom - $top + 1
$rect = New-Object System.Drawing.Rectangle(0, $top, $w, $cropH)
$cropped = $img.Clone($rect, $img.PixelFormat)
$img.Dispose()

$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)

$cropped.Save($dst, $encoder, $encoderParams)
$cropped.Dispose()
Write-Host "Saved to $dst ($w x $cropH)"

