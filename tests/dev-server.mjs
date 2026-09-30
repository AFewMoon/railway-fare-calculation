// 开发期静态服务器（不部署）
import http from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, p);
    const data = await readFile(file);
    res.setHeader('Content-Type', (mime[extname(file)] || 'application/octet-stream') + '; charset=utf-8');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('404');
  }
}).listen(8080, () => console.log('serving on http://localhost:8080'));
