$file = (Get-Item "index.html").FullName
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$target = @"
                    window._ai = { db, ref, get, child, update,
                        getIS_ADMIN: () => IS_ADMIN,
                        getDeviceUser: () => DEVICE_USER,
                        getMasterTasks: () => masterTasks,
                        showToast, showLoader, getTodayYMD, formatDMY, nvxnSyncDailyEntries };
"@

$replacement = @"
                    window._ai = { db, ref, get, child, update,
                        getIS_ADMIN: () => IS_ADMIN,
                        getDeviceUser: () => DEVICE_USER,
                        getMasterTasks: () => masterTasks,
                        getStaffs: () => STAFFS,
                        showToast, showLoader, getTodayYMD, formatDMY, nvxnSyncDailyEntries };
"@

$newContent = $content.Replace($target, $replacement)
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "Done. Changed:" ($content.Length -ne $newContent.Length)
