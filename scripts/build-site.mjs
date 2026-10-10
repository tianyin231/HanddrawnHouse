import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(root, 'output');
const destination = resolve(outputRoot, 'github-pages');
const base = process.argv[2] ?? '/HanddrawnHouse/';
if (!/^(\/[\w.-]+)*\/$/.test(base) || base.includes('..')) throw new Error('站点路径应为 / 或 /仓库名/');

// 发布目录固定在 output 内；只清理构建产物，工程文件不进入公开站点。
if (!destination.startsWith(outputRoot + sep)) throw new Error('发布目录超出 output');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

async function copy(source, target = source) {
  const to = resolve(destination, target);
  await mkdir(dirname(to), { recursive: true });
  await cp(resolve(root, source), to, { recursive: true });
}

// 保留本机预览路径；仅在发布副本中添加 GitHub 项目站点前缀。
const assetPath = /(["'`])\/(?=viewer\/|output\/|work\/|node_modules\/three\/|house_parameters\.json|plan_floor_[12]\.json)/g;
function publishPaths(text) {
  return text.replace(assetPath, `$1${base}`)
    .replaceAll('href="/"', `href="${base}"`)
    .replaceAll('href="/?', `href="${base}?`)
    .replaceAll(`${base}node_modules/three/`, `${base}vendor/three/`);
}

await copy('viewer');
for (const name of await readdir(resolve(destination, 'viewer'))) {
  if (!/\.(html|js|css)$/.test(name)) continue;
  const file = resolve(destination, 'viewer', name);
  await writeFile(file, publishPaths(await readFile(file, 'utf8')));
}
await copy('node_modules/three/build/three.module.js', 'vendor/three/build/three.module.js');
await copy('node_modules/three/build/three.core.js', 'vendor/three/build/three.core.js');
await copy('node_modules/three/examples/jsm', 'vendor/three/examples/jsm');
await copy('node_modules/three/LICENSE', 'vendor/three/LICENSE');
for (const name of ['house_parameters.json', 'plan_floor_1.json', 'plan_floor_2.json']) await copy(name);
for (const name of ['house.glb', 'house.blend', 'house-stacked.png', 'house-exploded.png',
  'floor-1-plan.png', 'floor-2-plan.png', 'floor-1-3d.png', 'floor-2-3d.png', 'kitchen-window-inside.png']) {
  await copy(`output/${name}`);
}
for (const floor of [1, 2]) await copy(`work/reference-floor-${floor}.png`);
await writeFile(resolve(destination, 'index.html'), await readFile(resolve(destination, 'viewer/index.html')));
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(`静态网站已生成：${destination}\n站点路径：${base}`);
