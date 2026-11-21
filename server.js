import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import qrcode from 'qrcode-generator';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    port: { type: 'string', default: '8787' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (values.help) {
  console.log('node server.js [--dir "共享目录"] [--port 8787]');
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('请输入有效的目录和 1 到 65535 之间的端口。');
  process.exit(1);
}
const configuredDir =
  values.dir ??
  (
    await readFile(path.join(import.meta.dirname, 'share-dir.txt'), 'utf8')
  ).trim();
if (!configuredDir.trim() || /[\r\n]/.test(configuredDir)) {
  console.error(
    '请在 share-dir.txt 中填写一行共享目录路径，或使用 --dir 指定目录。',
  );
  process.exit(1);
}
const directory = path.resolve(
  values.dir === undefined ? import.meta.dirname : process.cwd(),
  configuredDir,
);
await mkdir(directory, { recursive: true });
const root = await realpath(directory);
const publishing = new Set();
const assets = new Map();
for (const [url, name, type] of [
  ['/', 'index.html', 'text/html'],
  ['/style.css', 'style.css', 'text/css'],
  ['/app.js', 'app.js', 'text/javascript'],
  ['/mark.svg', 'mark.svg', 'image/svg+xml'],
]) {
  assets.set(url, {
    type,
    body: await readFile(path.join(import.meta.dirname, 'public', name)),
  });
}

function lanAddresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, interfaces]) =>
      interfaces
        .filter(
          (ip) =>
            ip.family === 'IPv4' &&
            !ip.internal &&
            !ip.address.startsWith('169.254.'),
        )
        .map((ip) => ({
          ip: ip.address,
          virtual: /virtual|vmware|vbox|wsl|docker|vpn|vethernet/i.test(name),
        })),
    )
    .sort((a, b) => Number(a.virtual) - Number(b.virtual))
    .map(({ ip }) => 'http://' + ip + ':' + port);
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function validName(name) {
  return (
    !!name &&
    !name.startsWith('.') &&
    !/[. ]$/.test(name) &&
    !/[\\/<>:"|?*\x00-\x1f\x7f]/.test(name) &&
    !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(\s*\.|$)/i.test(
      name,
    ) &&
    Buffer.byteLength(name) <= 255
  );
}

async function resolveFolder(relative) {
  let current = root;
  if (relative) {
    for (const part of relative.split('/')) {
      if (!validName(part)) fail(400, '目录名称无效');
      current = path.join(current, part);
      if (!(await lstat(current)).isDirectory()) fail(404, '找不到共享目录');
    }
  }
  return current;
}

async function listEntries(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (
      !validName(entry.name) ||
      (!entry.isFile() && !entry.isDirectory()) ||
      publishing.has(path.join(folder, entry.name))
    )
      continue;
    try {
      const stat = await lstat(path.join(folder, entry.name));
      if (!stat.isFile() && !stat.isDirectory()) continue;
      result.push({
        name: entry.name,
        folder: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return result.sort(
    (a, b) =>
      Number(b.folder) - Number(a.folder) ||
      b.modified - a.modified ||
      a.name.localeCompare(b.name),
  );
}

async function receive(req, folder, filename) {
  const staging = path.join(folder, '.airfold-' + randomUUID() + '.part');
  const { name, ext } = path.parse(filename);
  try {
    await pipeline(req, createWriteStream(staging, { flags: 'wx' }));
    for (let i = 0; ; i++) {
      const candidate = i ? name + ' (' + i + ')' + ext : filename;
      const destination = path.join(folder, candidate);
      if (publishing.has(destination)) continue;
      publishing.add(destination);
      let reservation;
      try {
        reservation = await open(destination, 'wx');
      } catch (error) {
        publishing.delete(destination);
        if (error.code === 'EEXIST' || error.code === 'EISDIR') continue;
        throw error;
      }
      try {
        await reservation.close();
        await rename(staging, destination);
        return candidate;
      } catch (error) {
        await rm(destination, { force: true });
        throw error;
      } finally {
        publishing.delete(destination);
      }
    }
  } finally {
    await rm(staging, { force: true });
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  const host = req.headers.host;
  const localHosts = ['localhost', '127.0.0.1', req.socket.localAddress];
  if (
    !localHosts.some(
      (ip) => host === ip + ':' + port || (port === 80 && host === ip),
    )
  )
    fail(403, '请使用本机或局域网 IP 访问');
  if (req.headers.origin && req.headers.origin !== 'http://' + host)
    fail(403, '请从文件传输页面操作');
  const url = new URL(req.url, 'http://' + host);
  const asset = assets.get(url.pathname);
  if (req.method === 'GET' && asset) {
    res.writeHead(200, { 'Content-Type': asset.type + '; charset=utf-8' });
    return res.end(asset.body);
  }
  if (req.method === 'GET' && url.pathname === '/api/info') {
    return json(res, 200, {
      directory: path.basename(root) || root,
      addresses: lanAddresses(),
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/qr') {
    const address = url.searchParams.get('address');
    if (!lanAddresses().includes(address)) fail(400, '请选择有效的局域网地址');
    const qr = qrcode(0, 'M');
    qr.addData(address);
    qr.make();
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(qr.createSvgTag({ scalable: true }));
  }
  if (!['/api/files', '/api/download', '/api/upload'].includes(url.pathname))
    fail(404, '页面不存在');
  const folder = await resolveFolder(url.searchParams.get('dir') || '');
  if (req.method === 'GET' && url.pathname === '/api/files') {
    return json(res, 200, { entries: await listEntries(folder) });
  }
  const filename = url.searchParams.get('name');
  if (!validName(filename)) fail(400, '文件名无效或不适用于共享目录');
  if (req.method === 'PUT' && url.pathname === '/api/upload') {
    return json(res, 201, { name: await receive(req, folder, filename) });
  }
  if (req.method === 'GET' && url.pathname === '/api/download') {
    const target = path.join(folder, filename);
    if (publishing.has(target) || !(await lstat(target)).isFile())
      fail(404, '文件不存在');
    const file = await open(target, 'r');
    try {
      const stat = await file.stat();
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition':
          "attachment; filename*=UTF-8''" +
          encodeURIComponent(filename).replace(
            /['()*]/g,
            (c) => '%' + c.charCodeAt(0).toString(16),
          ),
      });
      await pipeline(file.createReadStream(), res);
    } finally {
      await file.close();
    }
    return;
  }
  fail(405, '请求方式无效');
}

const server = http.createServer({ requestTimeout: 0 }, (req, res) => {
  handle(req, res).catch((error) => {
    if (res.destroyed || res.headersSent) return res.destroy();
    const status =
      error.status ||
      {
        ENOENT: 404,
        ENOTDIR: 404,
        ENOSPC: 507,
        EACCES: 403,
        EPERM: 403,
        ENAMETOOLONG: 400,
      }[error.code] ||
      500;
    const message = error.status
      ? error.message
      : {
          400: '文件名过长',
          403: '共享目录的访问权限不足',
          404: '文件或目录已不存在',
          507: '共享磁盘空间不足',
          500: '文件操作失败，请查看服务终端',
        }[status];
    if (status === 500) console.error(error);
    json(res, status, { error: message });
  });
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? '端口已被占用，请使用 --port 指定其他端口。'
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', async () => {
  if (process.platform === 'win32') {
    const { enableWindowsControl } =
      await import('./scripts/windows-control.js');
    enableWindowsControl(server, port, root);
  }
  console.log('共享目录  ' + root + '\n本机访问  http://127.0.0.1:' + port);
  for (const address of lanAddresses()) console.log('手机访问  ' + address);
});
