import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pipeName } from './windows-control.js';

const project = path.dirname(import.meta.dirname);
const port = 8787;

function request(command) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipeName(port));
    let reply = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(command + '\n'));
    socket.on('data', (chunk) => {
      reply += chunk;
    });
    socket.on('end', () => resolve(reply));
    socket.on('error', (error) => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED')
        resolve(null);
      else reject(error);
    });
  });
}

async function start() {
  let status = await request('status');
  if (!status) {
    const logFile = path.join(project, 'cache', 'server.log');
    await mkdir(path.dirname(logFile), { recursive: true });
    const log = await open(logFile, 'a');
    let child;
    try {
      child = spawn(process.execPath, [path.join(project, 'server.js')], {
        cwd: project,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log.fd, log.fd],
      });
    } finally {
      await log.close();
    }
    child.unref();
    for (let attempt = 0; attempt < 80; attempt++) {
      await delay(125);
      status = await request('status');
      if (status || child.exitCode !== null) break;
    }
    if (!status)
      throw new Error(
        '服务未能启动。请检查共享目录、端口占用或查看日志：' + logFile,
      );
  }
  console.log('共享目录  ' + JSON.parse(status).root);
  console.log('本机访问  http://127.0.0.1:' + port);
}

try {
  if (process.argv[2] === 'start') await start();
  else if (process.argv[2] === 'stop') {
    const result = await request('stop');
    if (result !== null && result !== 'stopped')
      throw new Error('未收到停止确认，请检查服务状态。');
    console.log(result === null ? '服务未运行。' : '服务已停止。');
  } else throw new Error('用法：node scripts/launcher.js start|stop');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
