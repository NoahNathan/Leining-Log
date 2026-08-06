// Zero-dependency static file server for local dev / preview.
// Serves web/ as the site root, and exposes the repo-level data/ directory
// at /data so the app's fetch('/data/...') calls work without a build step.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const WEB_ROOT = join(REPO_ROOT, 'web');
const DATA_ROOT = join(REPO_ROOT, 'data');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function resolveSafe(root, urlPath) {
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    let root = WEB_ROOT;
    if (urlPath === '/') {
      urlPath = '/index.html';
    } else if (urlPath.startsWith('/data/')) {
      root = DATA_ROOT;
      urlPath = urlPath.slice('/data'.length);
    }
    const filePath = resolveSafe(root, urlPath);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const st = await stat(filePath);
    const finalPath = st.isDirectory() ? join(filePath, 'index.html') : filePath;
    const data = await readFile(finalPath);
    const ext = extname(finalPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + req.url);
  }
});

server.listen(PORT, () => {
  console.log(`Leining-Log dev server running at http://localhost:${PORT}`);
});
