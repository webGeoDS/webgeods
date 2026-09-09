# See cleanup-test-processes.sh for the context/why — this file does
# the actual work, called from there to avoid the multi-level quoting
# (bash -> powershell -Command -> WQL) of an inline script.

$killed = 0

# Playwright launches either chrome.exe (Chrome "channel") or
# chrome-headless-shell.exe (the default headless bundle in recent
# versions) depending on configuration - both need to be checked.
# Filtering on the executable path (the ms-playwright folder, where
# Playwright installs its own browsers) reliably distinguishes an
# instance launched by Playwright from the user's "normal" Chrome.
foreach ($procName in @('chrome.exe', 'chrome-headless-shell.exe')) {
  Get-CimInstance Win32_Process -Filter "Name = '$procName'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match 'playwright' -or
      $_.CommandLine -match '--headless' -or
      $_.ExecutablePath -match 'ms-playwright'
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $killed++
    }
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -match 'map-tests' -or
    $_.CommandLine -match 'smoke-test' -or
    $_.CommandLine -match 'static-server' -or
    $_.CommandLine -match 'run-map-tests'
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $killed++
  }

Write-Host "cleanup-test-processes: killed $killed leftover process(es)."
