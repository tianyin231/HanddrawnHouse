import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仅在本机提供这个项目的预览资源，不暴露工作区其他目录。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4179);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.blend': 'application/octet-stream' };

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/viewer/index.html';
    if (!/^\/(viewer\/|output\/|node_modules\/three\/|work\/reference-floor-[12]\.png$|plan_floor_[12]\.json$|house_parameters\.json$)/.test(pathname)) {
      res.writeHead(404).end(); return;
    }
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('未找到文件');
  }
}).listen(port, '127.0.0.1', () => console.log(`住宅预览：http://127.0.0.1:${port}`));
