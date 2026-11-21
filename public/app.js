const $ = (id) => document.getElementById(id);
const shapes = {
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  upload:
    '<path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  up: '<path d="M12 20V5m-6 6 6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download:
    '<path d="M12 3v12m-5-5 5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h4m0-3v1m-7 3v3h3m3-2v2"/>',
  refresh:
    '<path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6m-5 5a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/>',
  radio:
    '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9m9-9a6.4 6.4 0 0 1 0 9m-12-12a10.6 10.6 0 0 0 0 15m15-15a10.6 10.6 0 0 1 0 15"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.2.8-1.9 1.4-1.9 2.8m0 3h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  disk: '<path d="m4 6-2 9v4h20v-4l-2-9zM3 15h18m-4 2h2"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4m-9 5h6m-6 4h4"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-6 5 6"/>',
  video:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V3H4v13h2"/>',
};
function icon(name) {
  const holder = document.createElement('i');
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    shapes[name] +
    '</svg>';
  return holder;
}
document
  .querySelectorAll('[data-icon]')
  .forEach((item) => item.replaceWith(icon(item.dataset.icon)));
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function endpoint(route, values) {
  return route + '?' + new URLSearchParams(values);
}
async function read(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
function prettyBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    i++;
    bytes /= 1024;
  }
  return Number(bytes.toFixed(i ? 1 : 0)) + ' ' + units[i];
}
function fileType(entry) {
  if (entry.folder) return ['目录', 'folder'];
  if (/\.(png|jpe?g|gif|webp|heic|svg|avif|bmp)$/i.test(entry.name))
    return ['图片', 'image'];
  if (/\.(mp4|mov|mkv|webm|avi)$/i.test(entry.name)) return ['视频', 'video'];
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv)$/i.test(entry.name))
    return ['文档', 'file'];
  return ['文件', 'file'];
}
let directory = '';
let info = { directory: '共享目录', addresses: [] };
let entries = [];
let errorText = '';
let revision = 0;
let noticeTimer;
function notice(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 3300);
}
function navigate(folder) {
  location.hash = folder ? '#' + encodeURIComponent(folder) : '';
}
function crumbs() {
  const nav = $('crumbs');
  nav.replaceChildren(icon('folder'));
  const parts = directory ? directory.split('/') : [];
  [info.directory, ...parts].forEach((part, i) => {
    if (i) nav.append(el('span', '', '/'));
    if (i === parts.length) nav.append(el('span', '', part));
    else {
      const button = el('button', '', part);
      button.onclick = () => navigate(parts.slice(0, i).join('/'));
      nav.append(button);
    }
  });
  $('destination').textContent = [info.directory, ...parts].join(' / ');
}
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
function row(entry) {
  const item = el('div', 'file-row');
  const main = el(entry.folder ? 'button' : 'div', 'file-main');
  const [type, glyph] = fileType(entry);
  const badge = el('span', 'file-icon');
  badge.dataset.type = type;
  badge.append(icon(glyph));
  const label = el('div');
  label.append(
    el('span', 'file-name', entry.name),
    el('div', 'file-date', dateFormat.format(entry.modified)),
  );
  main.append(badge, label);
  const action = el(entry.folder ? 'button' : 'a', 'icon-button row-action');
  if (entry.folder) {
    main.onclick = action.onclick = () =>
      navigate([directory, entry.name].filter(Boolean).join('/'));
  } else {
    action.href = endpoint('/api/download', {
      dir: directory,
      name: entry.name,
    });
    action.download = entry.name;
  }
  const verb = entry.folder ? '打开' : '下载';
  action.title = verb + ' ' + entry.name;
  action.setAttribute('aria-label', action.title);
  action.append(icon(entry.folder ? 'next' : 'download'));
  item.append(
    main,
    el('span', 'file-size', entry.folder ? '—' : prettyBytes(entry.size)),
    action,
  );
  return item;
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(query),
  );
  $('files').replaceChildren(...visible.map(row));
  if (!visible.length) {
    const empty = el('div', 'empty');
    const symbol = el('span', 'empty-icon');
    symbol.append(icon(query ? 'search' : 'folder'));
    empty.append(
      symbol,
      el(
        'strong',
        '',
        errorText || (query ? '没有匹配的文件' : '这里还没有文件'),
      ),
      el(
        'p',
        '',
        errorText
          ? '请刷新列表，或返回上一级目录。'
          : query
            ? '试试其他文件名。'
            : '选择文件上传，或将文件放进电脑的共享目录。',
      ),
    );
    $('files').append(empty);
  }
  $('count').textContent = errorText
    ? '读取失败'
    : query
      ? '匹配 ' + visible.length + ' / ' + entries.length + ' 项'
      : '共 ' + entries.length + ' 项';
}
async function refresh() {
  const id = ++revision;
  $('refresh').disabled = true;
  try {
    const [details, listing] = await Promise.all([
      read('/api/info'),
      read(endpoint('/api/files', { dir: directory })),
    ]);
    if (id !== revision) return;
    info = details;
    entries = listing.entries;
    errorText = '';
    $('network').classList.add('online');
    $('network').lastElementChild.textContent = '局域网在线';
  } catch (error) {
    if (id !== revision) return;
    entries = [];
    errorText =
      error.message === 'Failed to fetch' ? '无法连接到电脑' : error.message;
    $('network').classList.remove('online');
    $('network').lastElementChild.textContent = '连接异常';
  } finally {
    if (id === revision) {
      $('refresh').disabled = false;
      crumbs();
      render();
    }
  }
}
function loadFolder() {
  try {
    directory = decodeURIComponent(location.hash.slice(1));
  } catch {
    directory = '';
  }
  entries = [];
  $('files').replaceChildren();
  $('search').value = '';
  crumbs();
  refresh();
}
window.addEventListener('hashchange', loadFolder);
$('search').oninput = render;
$('refresh').onclick = refresh;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

function sendFile(file, dir, progress, status) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', endpoint('/api/upload', { dir, name: file.name }));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      progress.value = e.total ? e.loaded / e.total : 1;
      status.textContent =
        progress.value === 1
          ? '正在保存…'
          : Math.round(progress.value * 100) + '%';
    };
    xhr.onload = () =>
      xhr.status === 201
        ? resolve(xhr.response.name)
        : reject(new Error(xhr.response?.error || '上传失败'));
    xhr.onerror = () => reject(new Error('连接中断，请重新选择文件上传'));
    xhr.onabort = () => reject(new Error('上传已取消'));
    xhr.send(file);
  });
}
const pending = [];
let sending = false;
async function enqueue(fileList) {
  const dir = directory;
  const files = Array.from(fileList);
  if (!files.length) return;
  if (!sending) $('queue').replaceChildren();
  for (const file of files) {
    const item = el('div', 'transfer');
    const progress = el('progress');
    progress.max = 1;
    progress.value = 0;
    progress.setAttribute('aria-label', file.name + ' 上传进度');
    const status = el('small', '', '等待上传');
    item.append(el('span', '', file.name), progress, status);
    $('queue').append(item);
    pending.push({ file, dir, status, progress });
  }
  if (sending) return;
  sending = true;
  while (pending.length) {
    const { file, dir, status, progress } = pending.shift();
    status.textContent = '正在上传…';
    try {
      const name = await sendFile(file, dir, progress, status);
      progress.value = 1;
      status.textContent = file.name === name ? '上传完成' : '已保存为 ' + name;
    } catch (error) {
      status.textContent = error.message;
      progress.hidden = true;
    }
  }
  sending = false;
  await refresh();
}
$('choose').onclick = () => $('picker').click();
$('picker').onchange = () => {
  enqueue($('picker').files);
  $('picker').value = '';
};
const drop = $('drop');
for (const event of ['dragover', 'drop'])
  window.addEventListener(event, (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  });
drop.ondragover = (e) => {
  e.preventDefault();
  drop.classList.add('drag');
};
drop.ondragleave = (e) => {
  if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag');
};
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  enqueue(e.dataTransfer.files);
};

function modal(title) {
  $('dialog-title').textContent = title;
  $('dialog-body').replaceChildren();
  $('dialog').showModal();
  return $('dialog-body');
}
$('close').onclick = () => $('dialog').close();
$('dialog').onclick = (e) => {
  if (e.target === $('dialog') && !e.target.matches(':hover'))
    $('dialog').close();
};
$('help').onclick = () => {
  const body = modal('使用说明');
  const steps = el('ol');
  for (const text of [
    '将电脑和手机连接到同一个局域网，在电脑上点击「扫码连接设备」。',
    '手机扫码打开页面，点击文件旁的下载按钮即可保存。',
    '选择文件或将文件拖入上传区，即可保存到当前目录。同名文件会自动编号。',
  ])
    steps.append(el('li', '', text));
  body.append(steps);
};
$('connect').onclick = async () => {
  const body = modal('扫码连接设备');
  body.append(el('p', '', '正在读取局域网地址…'));
  try {
    const { addresses } = await read('/api/info');
    if (!$('dialog').open || $('dialog-title').textContent !== '扫码连接设备')
      return;
    body.replaceChildren(
      el(
        'p',
        '',
        addresses.length
          ? '手机连接同一局域网后，用相机扫描二维码，或在浏览器中打开下方地址。'
          : '未找到局域网地址。请先将电脑连接到 Wi-Fi 或有线网络，再重新打开。',
      ),
    );
    if (!addresses.length) return;
    const image = el('img', 'qr-image');
    image.alt = '手机访问地址二维码';
    const address = el(addresses.length > 1 ? 'select' : 'input');
    address.setAttribute('aria-label', '局域网访问地址');
    if (addresses.length > 1) {
      for (const url of addresses) {
        const opt = el('option', '', url);
        opt.value = url;
        address.append(opt);
      }
    } else {
      address.readOnly = true;
      address.onclick = () => address.select();
    }
    address.value = addresses.includes(location.origin)
      ? location.origin
      : addresses[0];
    const update = () => {
      image.src = endpoint('/api/qr', { address: address.value });
    };
    address.onchange = update;
    update();
    const copy = el('button', 'icon-button');
    copy.title = '复制地址';
    copy.setAttribute('aria-label', copy.title);
    copy.append(icon('copy'));
    copy.onclick = async () => {
      try {
        if (navigator.clipboard)
          await navigator.clipboard.writeText(address.value);
        else {
          const field = el('textarea');
          field.value = address.value;
          body.append(field);
          field.select();
          const copied = document.execCommand('copy');
          field.remove();
          if (!copied) throw new Error();
        }
        copy.title = '已复制';
        copy.setAttribute('aria-label', copy.title);
        notice('地址已复制');
      } catch {
        notice('请手动复制上方地址');
      }
    };
    const line = el('div', 'address-row');
    line.append(address, copy);
    body.append(image, line);
  } catch {
    body.replaceChildren(
      el('p', '', '无法读取地址，请确认电脑上的服务正在运行。'),
    );
  }
};
loadFolder();
