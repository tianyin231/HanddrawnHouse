$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPython = 'C:\Users\86166\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$taskBlender = 'E:\bleder\blender.exe'

# 改 house_parameters.json 后运行此文件，重建两层模型和交换格式。
& $taskPython -X utf8 scripts\prepare_plans.py
if ($LASTEXITCODE -ne 0) { throw '户型数据生成失败' }
foreach ($level in @(1, 2)) {
    & $taskPython -X utf8 .agents\skills\floorplan-digitization\scripts\build_floorplan_artifacts.py "plan_floor_$level.json" --output-dir "work\qa-floor-$level" *> "work\plan-$level.log"
    if ($LASTEXITCODE -ne 0) { throw "第 $level 层平面检查失败" }
    & $taskBlender --background --factory-startup --python-exit-code 1 --python scripts\build_house.py -- $level *> "work\build-floor-$level.log"
    if ($LASTEXITCODE -ne 0) { throw "第 $level 层建模失败" }
    & $taskPython -X utf8 .agents\skills\cad-2d-to-3d\scripts\compare_projection.py "work\qa-floor-$level\floorplan_cut_1200_mask.png" "work\qa-floor-$level\blender-cut-1200.png" --report "work\qa-floor-$level\projection-comparison.json" --overlay "work\qa-floor-$level\projection-comparison.png" *> "work\projection-$level.log"
    if ($LASTEXITCODE -ne 0) { throw "第 $level 层投影检查失败" }
}
& $taskBlender --background --factory-startup --python-exit-code 1 --python scripts\build_house.py -- assemble *> work\build-house.log
if ($LASTEXITCODE -ne 0) { throw '组合模型生成失败' }
& $taskBlender --background --factory-startup --python-exit-code 1 --python scripts\verify_house.py *> work\verify-house.log
if ($LASTEXITCODE -ne 0) { throw '模型回读检查失败' }
Write-Output '模型已更新：output\house.blend 和 output\house.glb'
