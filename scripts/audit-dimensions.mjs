import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {auditDimensions} from '../viewer/dimension-audit.js';

const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log('用法：node scripts/audit-dimensions.mjs [--json]\n不依赖 Blender 或 npm ci；仅检查参数与两层平面 JSON，不修改源文件。\n退出码：0 数据一致（非现场验收）；1 数据冲突；2 读取或参数错误。');
} else if(args.some(arg=>arg!=='--json')||args.length>1) {
  console.error('未知参数。使用 --help 查看用法。');process.exitCode=2;
} else {
  try {
    const root=new URL('../',import.meta.url);
    const names=['house_parameters.json','plan_floor_1.json','plan_floor_2.json'];
    const [parameters,...plans]=await Promise.all(names.map(async name=>JSON.parse(await readFile(new URL(name,root),'utf8'))));
    const report=auditDimensions(parameters,plans);
    if(args.includes('--json')) console.log(JSON.stringify(report,null,2));
    else {
      console.log(`尺寸数据校核：${report.data_status==='pass'?'未发现数据冲突':'发现冲突'}\n范围：house_parameters.json + 两层平面 JSON\n空间 ${report.rooms.length}，洞口 ${report.openings.length}，待现场记录项 ${report.measurements.length}。`);
      for(const issue of report.issues) console.log(`[${issue.code}] ${issue.level?`${issue.level}层 `:''}${issue.entity??''} ${issue.message}`);
      console.log('模型仍为 needs_review；未验证现场、Blender/GLB 实体、结构、日照或施工条件。');
      console.log(`项目：${fileURLToPath(root)}`);
    }
    process.exitCode=report.data_status==='pass'?0:1;
  } catch(error) {
    console.error(`校核无法完成：${error.message}`);process.exitCode=2;
  }
}
