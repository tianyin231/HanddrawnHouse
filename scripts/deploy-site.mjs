import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(root, 'output/github-pages');
function run(command, args, cwd = root, allowed = [0]) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!allowed.includes(result.status)) throw new Error(`${command} 执行失败（${result.status}）`);
  return result;
}

// 在固定的生成目录中发布 gh-pages，不切换或重置源工程的分支。
run(process.execPath, [resolve(root, 'scripts/build-site.mjs')]);
const remote = run('git', ['remote', 'get-url', 'origin']).stdout.trim();
run('git', ['init', '--initial-branch=gh-pages'], site);
run('git', ['remote', 'add', 'origin', remote], site);
const exists = run('git', ['ls-remote', '--heads', 'origin', 'gh-pages'], site).stdout.trim();
if (exists) {
  run('git', ['fetch', '--depth=1', 'origin', 'gh-pages'], site);
  // 继承远端历史，保留刚构建的文件；推送不使用 force。
  run('git', ['reset', '--soft', 'FETCH_HEAD'], site);
}
run('git', ['add', '--all'], site);
const changed = run('git', ['diff', '--cached', '--quiet'], site, [0, 1]).status;
if (changed) {
  run('git', ['commit', '-m', '更新小院在线预览'], site);
  run('git', ['push', '--set-upstream', 'origin', 'gh-pages'], site);
} else console.log('发布文件与远端一致，无需重复推送。');
