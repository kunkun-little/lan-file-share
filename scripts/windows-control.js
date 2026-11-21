import { createHash } from 'node:crypto';
import net from 'node:net';

// A separate local control channel for each project directory and HTTP port.
export function pipeName(port) {
  const project = createHash('sha256')
    .update(import.meta.dirname.toLowerCase())
    .digest('hex')
    .slice(0, 24);
  return '\\\\.\\pipe\\airfold-' + project + '-' + port;
}

export function enableWindowsControl(httpServer, port, root) {
  const control = net.createServer((socket) => {
    let command = '';
    socket.setEncoding('utf8');
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      command += chunk;
      if (command.length > 16) return socket.destroy();
      if (!command.endsWith('\n')) return;
      if (command === 'status\n')
        return socket.end(JSON.stringify({ root, port }));
      if (command !== 'stop\n') return socket.end();
      if (httpServer.listening) {
        control.close();
        httpServer.close(() => socket.end('stopped'));
      } else {
        socket.end();
      }
    });
  });
  control.on('error', (error) => {
    console.error('无法启动 Windows 服务控制通道：' + error.message);
    httpServer.close();
    process.exitCode = 1;
  });
  control.listen(pipeName(port));
}
