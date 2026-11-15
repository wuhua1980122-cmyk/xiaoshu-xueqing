/**
 * 学情课堂服务器 - 零外部依赖，仅需 Node.js
 * 功能：静态文件服务 + 学情数据 API + 教师看板
 * 数据仅存内存，重启即清空
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const BASE_DIR = __dirname;
const START_PORT = parseInt(process.env.PORT || '8080', 10);

const students = new Map(); // id -> student record

/* ===== 自动找课件入口 ===== */
function findEntryHtml() {
  try {
    const files = fs.readdirSync(BASE_DIR).filter(f => {
      if (!f.toLowerCase().endsWith('.html')) return false;
      if (f === 'teacher.html') return false;
      // 排除已知的非课件文件
      if (f.startsWith('xiaoshu') || f.startsWith('_')) return false;
      return true;
    });
    if (files.length === 0) return path.join(BASE_DIR, 'index.html');
    // 选最大的 HTML（通常是课件本体）
    files.sort((a, b) => {
      try {
        return fs.statSync(path.join(BASE_DIR, b)).size - fs.statSync(path.join(BASE_DIR, a)).size;
      } catch(e) { return 0; }
    });
    return path.join(BASE_DIR, files[0]);
  } catch(e) {
    return path.join(BASE_DIR, 'index.html');
  }
}

/* ===== 评分 ===== */
function calcScore(s) {
  if (!s) return 0;
  const hints = s.counters ? s.counters.hints : 0;
  const answers = s.counters ? s.counters.answers : 0;
  const errors = s.counters ? s.counters.errors : 0;
  const completions = s.counters ? s.counters.completions : 0;
  const total = s.progress ? s.progress.total : 1;

  const independence = Math.max(0, 1 - (hints * 1 + answers * 2.5) / 6);
  const accuracy = Math.max(0, 1 - errors / (errors + 3));
  const progressScore = total > 0 ? completions / total : 0;
  const selfDirected = 1 - Math.min(1, answers / 3);

  return Math.round(independence * 30 + accuracy * 25 + progressScore * 20 + progressScore * 15 + selfDirected * 10);
}

/* ===== 静态文件 ===== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') {
    // 自动找目录里最大的非 teacher.html 的 HTML 文件作为课件入口
    urlPath = '/__auto_entry__';
  }
  const filePath = urlPath === '/__auto_entry__' ? findEntryHtml() : path.resolve(BASE_DIR, '.' + urlPath);
  if (!filePath.startsWith(path.resolve(BASE_DIR))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found: ' + urlPath); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ===== 路由 ===== */
function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function handleRequest(req, res) {
  const url = req.url;

  // POST /api/report - 学生上报
  if (url === '/api/report' && req.method === 'POST') {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch (e) { res.writeHead(400); res.end('Bad JSON'); return; }

    const id = data.id || 'unknown';
    if (!students.has(id)) {
      students.set(id, {
        id: id,
        name: data.name || '未命名',
        online: true,
        lastSeen: Date.now(),
        counters: { hints: 0, answers: 0, errors: 0, completions: 0 },
      custom: {},
      event_log: [],
      activity: { last_active: 0, active_ratio: 0, idle_secs: 0 },
        progress: { current: 0, total: 0 },
        timings: {},
        self_assessment: null,
        quiz_result: null,
        page_load: data.page_load || Date.now(),
      });
    }
    const s = students.get(id);
    s.name = data.name || s.name;
    s.online = true;
    s.lastSeen = Date.now();
    s.counters = data.counters || s.counters;
    s.progress = data.progress || s.progress;
    s.timings = data.timings || s.timings;
    s.self_assessment = data.self_assessment !== undefined ? data.self_assessment : s.self_assessment;
    s.quiz_result = data.quiz_result !== undefined ? data.quiz_result : s.quiz_result;
    s.custom = data.custom || s.custom;
    s.event_log = (data.event_log && data.event_log.length > 0) ? data.event_log : s.event_log;
    s.activity = data.activity || s.activity;

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end('{"ok":true}');
    return;
  }

  // GET /api/students - 教师看板轮询
  if (url === '/api/students' && req.method === 'GET') {
    const list = [];
    for (const s of students.values()) {
      list.push({
        id: s.id,
        name: s.name,
        online: s.online,
        lastSeen: s.lastSeen,
        counters: s.counters,
      custom: s.custom,
      event_log: s.event_log,
      activity: s.activity,
        progress: s.progress,
        timings: s.timings,
        self_assessment: s.self_assessment,
        quiz_result: s.quiz_result,
        page_load: s.page_load,
        score: calcScore(s),
      });
    }
    list.sort((a, b) => b.score - a.score);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(list));
    return;
  }

  // GET /api/export-csv
  if (url === '/api/export-csv' && req.method === 'GET') {
    let csv = '\uFEFF姓名,状态,当前进度,提示,答案,失败,完成,交互次数,独立度,准确度,推进度,综合评分,活跃占比,最终ORP,最终稀释比,自评等级,最后活跃\n';
    for (const s of students.values()) {
      const c = s.counters || {};
      const total = s.progress ? s.progress.total : 1;
      const ind = Math.max(0, 1 - (c.hints + c.answers * 2.5) / 6).toFixed(2);
      const acc = Math.max(0, 1 - c.errors / (c.errors + 3)).toFixed(2);
      const prog = total > 0 ? ((c.completions || 0) / total).toFixed(2) : '0.00';
      const actRatio = s.activity ? Math.round((s.activity.active_ratio || 0) * 100) : 0;
      const finalOrp = s.custom && s.custom.final_orp != null ? s.custom.final_orp : '';
      const finalRatio = s.custom && s.custom.final_ratio ? s.custom.final_ratio : '';
      const quizLevel = s.quiz_result ? s.quiz_result.label || s.quiz_result.level || '' : '';
      const t = s.lastSeen ? new Date(s.lastSeen).toLocaleTimeString('zh-CN') : '-';
      csv += '"' + s.name + '",' + (s.online ? '在线' : '离线') + ',' +
        (s.progress ? s.progress.current + '/' + s.progress.total : '-') + ',' +
        (c.hints || 0) + ',' + (c.answers || 0) + ',' + (c.errors || 0) + ',' + (c.completions || 0) + ',' +
        (c.interactions || 0) + ',' +
        ind + ',' + acc + ',' + prog + ',' + calcScore(s) + ',' +
        actRatio + '%,"' + finalOrp + '","' + finalRatio + '","' + quizLevel + '","' + t + '"\n';
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=xiaoshu-export.csv',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(csv);
    return;
  }

  // POST /api/reset
  if (url === '/api/reset' && req.method === 'POST') {
    students.clear();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end('{"ok":true}');
    return;
  }

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Static files
  serveFile(req, res);
}

/* ===== 定期清理 ===== */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of students.entries()) {
    if (!s.online && now - s.lastSeen > 60000) {
      students.delete(id);
    } else if (s.online && now - s.lastSeen > 12000) {
      s.online = false;
    }
  }
}, 5000);

/* ===== 端口探测 + 启动 ===== */
const net = require('net');

function findFreePort(start, max) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', () => {
      if (start < max) resolve(findFreePort(start + 1, max));
      else reject(new Error('无可用端口'));
    });
    srv.once('listening', () => { srv.close(); resolve(start); });
    srv.listen(start, '0.0.0.0');
  });
}

(async () => {
  const port = await findFreePort(START_PORT, START_PORT + 20);

  const server = http.createServer(handleRequest);

  // 检测是否已有同目录旧实例
  if (server.address) { /* no-op, 简化处理 */ }

  server.listen(port, '0.0.0.0', () => {
    let localIP = '127.0.0.1';
    try {
      const ifaces = os.networkInterfaces();
      for (const name of Object.keys(ifaces)) {
        for (const i of ifaces[name]) {
          if (i.family === 'IPv4' && !i.internal) { localIP = i.address; break; }
        }
        if (localIP !== '127.0.0.1') break;
      }
    } catch (e) { /* use 127.0.0.1 */ }

    console.log('============================================');
    console.log('  学情课堂服务已启动');
    console.log('  教师端看板:  http://localhost:' + port + '/teacher.html');
    console.log('  学生端地址:  http://' + localIP + ':' + port + '/');
    console.log('  按 Ctrl+C 停止');
    console.log('============================================');

    // 自动打开教师端
    try {
      const url = 'http://localhost:' + port + '/teacher.html';
      if (process.platform === 'win32') exec('start "' + url + '"');
      else if (process.platform === 'darwin') exec('open "' + url + '"');
      else exec('xdg-open "' + url + '" 2>/dev/null');
    } catch (e) { /* ignore */ }
  });
})();
