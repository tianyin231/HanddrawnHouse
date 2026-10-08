$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# 浏览器打开 http://127.0.0.1:4179；运行期间保留此进程。
node scripts\serve.mjs
