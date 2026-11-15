/**
 * 学情采集客户端 - 注入到学生端 HTML
 * 自动检测课堂模式（http/https 协议下才激活），
 * 独立打开（file://）时静默跳过，不影响课件正常使用。
 */
(function () {
  'use strict';

  /* ===== 可覆盖配置 ===== */
  var config = {
    knowledgePoints: [],
    maxHints: 6,
    selfAssessmentItems: [],
    snapshotInterval: 3000,
    quiz: null,
  };

  /* ===== 状态 ===== */
  var studentId = (function () {
    try {
      var id = localStorage.getItem('__xs_id__');
      if (id) return id;
      id = 'stu-' + Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
      localStorage.setItem('__xs_id__', id);
      return id;
    } catch (e) { return 'stu-' + Math.random().toString(36).substr(2, 8); }
  })();

  var studentName = null;
  var counters = { hints: 0, answers: 0, errors: 0, completions: 0, interactions: 0 };
  var progress = { current: 0, total: 0 };
  var timings = {};
  var selfAssessment = null;
  var quizResult = null;
  var pageLoadTime = Date.now();
  var timer = null;
  var active = false;
  var customData = {};
  var eventLog = [];
  var lastActiveTs = Date.now();
  var activeTicks = 0;
  var totalTicks = 0;

  /* ===== 仅 http/https 下激活 ===== */
  var isClassroom = location.protocol === 'http:' || location.protocol === 'https:';

  /* ===== 活跃度追踪 ===== */
  function markActive() {
    lastActiveTs = Date.now();
    activeTicks++;
  }
  document.addEventListener('mousemove', function() {
    if (active) markActive();
  }, { passive: true });
  document.addEventListener('click', function() {
    if (active) { markActive(); counters.interactions++; }
  }, { passive: true });
  document.addEventListener('touchstart', function() {
    if (active) markActive();
  }, { passive: true });

  /* ===== API ===== */
  window.Xiaoshu = {
    config: function (opts) {
      if (!opts) return;
      if (opts.knowledgePoints) config.knowledgePoints = opts.knowledgePoints;
      if (opts.maxHints) config.maxHints = opts.maxHints;
      if (opts.selfAssessmentItems) config.selfAssessmentItems = opts.selfAssessmentItems;
      if (opts.snapshotInterval) config.snapshotInterval = opts.snapshotInterval;
      if (opts.quiz) {
        config.quiz = opts.quiz;
        if (isClassroom) setTimeout(function(){ showQuizPanel(); }, 1500);
      }
    },

    report: function (event, data) {
      data = data || {};
      switch (event) {
        case 'hint':         counters.hints++; break;
        case 'answer':       counters.answers++; break;
        case 'error':        counters.errors++; break;
        case 'complete':
          counters.completions++;
          if (data.task && !timings[data.task + '_end']) timings[data.task + '_end'] = Date.now();
          break;
        case 'progress':
          progress.current = data.current || 0;
          progress.total = data.total || 0;
          break;
        case 'chapter_start':
          if (data.task) timings[data.task + '_start'] = Date.now();
          break;
        case 'self_assessment':
          selfAssessment = data.scores || data;
          break;
        case 'custom':
          if (data.key) customData[data.key] = data.value;
          break;
        case 'quiz_result':
          quizResult = data;
          break;
      }
      if (eventLog.length < 100) eventLog.push({ e: event, d: data, ts: Date.now() });
      counters.interactions++;
      if (active) sendNow();
    },

    getSnapshot: function () {
      totalTicks++;
      return {
        id: studentId,
        name: studentName,
        ts: Date.now(),
        counters: JSON.parse(JSON.stringify(counters)),
        progress: JSON.parse(JSON.stringify(progress)),
        timings: JSON.parse(JSON.stringify(timings)),
        self_assessment: selfAssessment,
        quiz_result: quizResult,
        page_load: pageLoadTime,
        custom: JSON.parse(JSON.stringify(customData)),
        event_log: eventLog.slice(-30),
        activity: {
          last_active: lastActiveTs,
          active_ratio: totalTicks > 0 ? activeTicks / totalTicks : 0,
          idle_secs: Math.round((Date.now() - lastActiveTs) / 1000),
        },
      };
    },

    /* 在课件底部插入自评面板 */
    showQuiz: function (opts) {
      config.quiz = opts;
      if (isClassroom) showQuizPanel();
    },
  };

  /* ===== 网络上报 ===== */
  function sendNow() {
    if (!active) return;
    try {
      var payload = JSON.stringify(Xiaoshu.getSnapshot());
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () { /* 服务器不可达，静默 */ });
    } catch (e) { /* ignore */ }
  }

  /* ===== 入班弹窗 ===== */
  function showNameEntry() {
    var saved = null;
    try { saved = localStorage.getItem('__xs_name__'); } catch (e) {}
    if (saved) {
      studentName = saved;
      startCollecting();
      return;
    }

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:8px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.15);';

    var title = document.createElement('p');
    title.textContent = '输入姓名进入课堂';
    title.style.cssText = 'margin:0 0 12px;font-size:16px;font-weight:600;color:#2d3436;';

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '请输入你的姓名';
    input.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:4px;font-size:15px;box-sizing:border-box;outline:none;';

    var btn = document.createElement('button');
    btn.textContent = '进入课堂';
    btn.style.cssText = 'margin-top:12px;width:100%;padding:10px;background:#6c5ce7;color:#fff;border:none;border-radius:4px;font-size:15px;cursor:pointer;';

    box.appendChild(title);
    box.appendChild(input);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();

    function enter() {
      var name = input.value.trim();
      if (!name) { input.focus(); return; }
      studentName = name;
      try { localStorage.setItem('__xs_name__', name); } catch (e) {}
      overlay.remove();
      startCollecting();
    }

    btn.addEventListener('click', enter);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') enter(); });
  }

  /* ===== 启动 ===== */
  function startCollecting() {
    active = true;
    sendNow();
    timer = setInterval(sendNow, config.snapshotInterval);
  }

  function boot() {
    if (!isClassroom) return;
    setTimeout(showNameEntry, 400);
    if (config.quiz) setTimeout(function(){ showQuizPanel(); }, 1500);
  }

  /* ===== 自评面板 ===== */
  function showQuizPanel() {
    if (document.getElementById('__xs_quiz__')) return;
    if (!config.quiz) return;
    var q = config.quiz;
    var panel = document.createElement('div');
    panel.id = '__xs_quiz__';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff;box-shadow:0 -4px 16px rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-top:3px solid #6c5ce7;';

    var label = document.createElement('div');
    label.style.cssText = 'flex:1;min-width:200px;';
    label.innerHTML = '<div style="font-size:13px;font-weight:600;color:#2d3436;margin-bottom:4px;">📋 ' + esc(q.title || '本课自评') + '</div>'
      + '<div style="font-size:12px;color:#636e72;">' + esc(q.question || '') + '</div>';
    panel.appendChild(label);

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    var levels = q.levels || ['已掌握', '基本理解', '还需复习'];
    var colors = ['#00b894', '#fdcb6e', '#e17055'];
    levels.forEach(function(lv, i) {
      var b = document.createElement('button');
      b.textContent = lv;
      b.style.cssText = 'padding:8px 18px;border:2px solid '+colors[i]+';background:#fff;color:'+colors[i]+';border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;';
      b.onmouseenter = function(){ b.style.background = colors[i]; b.style.color = '#fff'; };
      b.onmouseleave = function(){ if(b.dataset.done!=='1'){b.style.background='#fff';b.style.color=colors[i];} };
      b.onclick = function() {
        b.dataset.done = '1';
        b.style.background = colors[i];
        b.style.color = '#fff';
        b.textContent = lv + ' ✓';
        var val = i === 0 ? 'mastered' : (i === 1 ? 'basic' : 'need_review');
        if (typeof Xiaoshu !== 'undefined') {
          Xiaoshu.report('quiz_result', { level: val, label: lv, ts: Date.now() });
          Xiaoshu.report('custom', { key: 'quiz_level', value: val });
        }
      };
      btns.appendChild(b);
    });
    panel.appendChild(btns);
    document.body.appendChild(panel);
  }

  function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
