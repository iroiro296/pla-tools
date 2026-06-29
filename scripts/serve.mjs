import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.PORT || 5051
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' }

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/' || p === '') p = '/index.html'
    const fp = normalize(join(ROOT, p))
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden') }
    const data = await readFile(fp)
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  } catch {
    res.writeHead(404); res.end('not found')
  }
}).listen(PORT, () => console.log('serving pla-calc on http://localhost:' + PORT))
