'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/geo+json' };
function createServer() {
  return http.createServer(async (request, response) => {
    let name;
    try { name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
    catch { response.writeHead(400).end(); return; }
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || name.includes('\\') || !( ['index.html', 'theme.css', 'data.js', 'map.js', 'app.js', 'project_data.json'].includes(name) || name.startsWith('data/') && name.endsWith('.geojson'))) { response.writeHead(404).end(); return; }
    try { const body = await fs.readFile(file); response.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' }).end(body); }
    catch { response.writeHead(404).end('File unavailable'); }
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('UtiliSync: http://127.0.0.1:' + server.address().port));
}
module.exports = { createServer };
