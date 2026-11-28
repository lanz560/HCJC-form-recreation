import 'dotenv/config';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleComplaint } from '../server/complaints.mjs';

const host = '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const root = fileURLToPath(new URL('../dist', import.meta.url));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

async function saveComplaint(data) {
  const { prisma } = await import('../server/db.mjs');
  return prisma.complaintSubmission.create({ data, select: { id: true } });
}

export function createAppServer(options = {}) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/api/complaints') {
        await handleComplaint(request, response, options.saveComplaint || saveComplaint);
        return;
      }
      let filePath = resolve(root, `.${pathname}`);

      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      if ((await stat(filePath)).isDirectory()) {
        filePath = resolve(filePath, 'index.html');
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(filePath)] || (filePath.startsWith(`${root}${sep}assets${sep}`) ? 'image/png' : 'application/octet-stream'),
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createAppServer().listen(port, host, () => {
    console.log('');
    console.log(`  Local:   http://localhost:${port}/`);

    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) {
          console.log(`  Network: http://${address.address}:${port}/`);
        }
      }
    }

    console.log('');
  });
}
