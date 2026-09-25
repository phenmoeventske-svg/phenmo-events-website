Add-Type -AssemblyName System.Drawing

function Crop-Borders($path) {
    $img = [System.Drawing.Bitmap]::FromFile($path)
    $w = $img.Width
    $h = $img.Height
    Write-Host "Processing $path ($w x $h)"
    
    # Find top boundary (where row is not mostly near-black)
    $top = 0
    for ($y = 0; $y -lt ($h / 3); $y++) {
        $isDark = $true
        for ($x = [int]($w * 0.2); $x -lt [int]($w * 0.8); $x += 10) {
            $p = $img.GetPixel($x, $y)
            if ($p.R -gt 25 -or $p.G -gt 25 -or $p.B -gt 25) {
                $isDark = $false
                break
            }
        }
        if (-not $isDark) {
            $top = $y
            break
        }
    }

    # Find bottom boundary
    $bottom = $h - 1
    for ($y = $h - 1; $y -gt [int]($h * 0.66); $y--) {
        $isDark = $true
        for ($x = [int]($w * 0.2); $x -lt [int]($w * 0.8); $x += 10) {
            $p = $img.GetPixel($x, $y)
            if ($p.R -gt 25 -or $p.G -gt 25 -or $p.B -gt 25) {
                $isDark = $false
                break
            }
        }
        if (-not $isDark) {
            $bottom = $y
            break
        }
    }

    Write-Host "Detected content boundaries: Top=$top, Bottom=$bottom"
    if ($top -gt 10 -or $bottom -lt ($h - 15)) {
        $cropH = $bottom - $top + 1
        $rect = New-Object System.Drawing.Rectangle(0, $top, $w, $cropH)
        $cropped = $img.Clone($rect, $img.PixelFormat)
        $img.Dispose()
        
        $tempPath = $path + ".tmp.jpg"
        $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
        
        $cropped.Save($tempPath, $encoder, $encoderParams)
        $cropped.Dispose()
        Move-Item -Force $tempPath $path
        Write-Host "Successfully cropped $path to $w x $cropH"
    } else {
        $img.Dispose()
        Write-Host "No significant black bars found."
    }
}

Crop-Borders "c:\Users\phenm\OneDrive\Desktop\PHENMO WEBSITE\Images\nightclub-lounge-pioneer-dj-setup.jpg"
Crop-Borders "c:\Users\phenm\OneDrive\Desktop\PHENMO WEBSITE\Images\outdoor-pergola-pioneer-cdj-rig.jpg"

