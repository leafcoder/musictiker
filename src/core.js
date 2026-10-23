/*
 * 节奏能手 (Music Master) — 核心游戏引擎
 * 与运行环境无关的纯逻辑 + Canvas 2D 渲染（精修版 / 大厂风格 UI）。
 * 浏览器与微信小游戏共用此文件（UMD 包装，可被 <script> 或 require 加载）。
 *
 * 玩法：从顶部掉落 4 个方向（上/下/左/右）的图标，
 *       图标进入底部横向触发区时，按下对应方向的按键即命中；
 *       按错方向 或 图标掉落出触发区 = 游戏结束。命中加分，分数越高成就越高。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createMusicGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 四个方向：统一风格的箭头图标，颜色区分便于辨识（形状/风格一致）
  var DIRS = [
    { key: 'left',  angle: Math.PI,      color: '#3DA9FC', light: '#9BD8FF', glow: '#3DA9FC', name: '左' },
    { key: 'up',    angle: -Math.PI / 2, color: '#21D4B4', light: '#8FF3E2', glow: '#21D4B4', name: '上' },
    { key: 'down',  angle: Math.PI / 2,  color: '#FF9F45', light: '#FFCB8E', glow: '#FF9F45', name: '下' },
    { key: 'right', angle: 0,            color: '#FF6B9D', light: '#FFB0CC', glow: '#FF6B9D', name: '右' }
  ];

  // 成就（按分数段划分，分数从高到低）
  var ACHIEVEMENTS = [
    { min: 1000, title: '节奏之巅', desc: '已达人类反应极限，封神！' },
    { min: 600,  title: '传奇指挥', desc: '全场为你鼓掌，节奏之神！' },
    { min: 400,  title: '殿堂乐师', desc: '你的演奏征服了整个舞台' },
    { min: 260,  title: '节奏大师', desc: '名副其实的节奏掌控者' },
    { min: 160,  title: '旋律能手', desc: '你的手指跟上了音乐' },
    { min: 90,   title: '律动先锋', desc: '节拍在你的指尖跳跃' },
    { min: 50,   title: '节奏新星', desc: '你找到了节拍的感觉' },
    { min: 25,   title: '节拍学徒', desc: '开始摸到节奏的门道了' },
    { min: 10,   title: '初学琴童', desc: '刚拿起乐器的小萌新' },
    { min: 0,    title: '音乐萌新', desc: '一切才刚刚开始' }
  ];

  // 背景漂浮装饰（一次性生成，循环复用）
  var PARTICLES = [];
  for (var p = 0; p < 18; p++) {
    PARTICLES.push({
      x: Math.random(), y: Math.random(), r: 6 + Math.random() * 22,
      sp: 0.01 + Math.random() * 0.03, drift: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI, note: Math.random() < 0.5
    });
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutBack(t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 统一风格的箭头图标（实心、圆角、指向 angle 方向）
  function drawArrow(ctx, cx, cy, r, angle, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(-r * 0.05, r * 0.42);
    ctx.lineTo(-r * 0.05, r * 0.16);
    ctx.lineTo(-r * 0.55, r * 0.16);
    ctx.lineTo(-r * 0.55, -r * 0.16);
    ctx.lineTo(-r * 0.05, -r * 0.16);
    ctx.lineTo(-r * 0.05, -r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 八分音符装饰（矢量绘制，不使用 Emoji）
  function drawNote(ctx, x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.16, s * 0.23, s * 0.17, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y + s * 0.05);
    ctx.lineTo(x + s * 0.2, y - s * 0.52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y - s * 0.52);
    ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.34, x + s * 0.32, y - s * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  function getAchievement(score) {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (score >= ACHIEVEMENTS[i].min) return ACHIEVEMENTS[i];
    }
    return ACHIEVEMENTS[ACHIEVEMENTS.length - 1];
  }

  function titleGrad(ctx, y, h) {
    var g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, '#B8B2FF'); g.addColorStop(0.5, '#7C8CFF'); g.addColorStop(1, '#4FD1FF');
    return g;
  }

  function text(ctx, str, x, y, font, color, align, baseline) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(str, x, y);
  }

  function gradText(ctx, str, x, y, font, grad, align) {
    ctx.font = font;
    ctx.fillStyle = grad;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  // 玻璃拟态面板
  function glassPanel(ctx, x, y, w, h, r, fillA, strokeA) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(255,255,255,' + (fillA == null ? 0.06 : fillA) + ')';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,' + (strokeA == null ? 0.14 : strokeA) + ')';
    ctx.stroke();
  }

  function createMusicGame(opts) {
    var ctx = opts.ctx;
    var getSize = opts.getSize;
    var raf = opts.raf;
    var shareFn = opts.share || function () {};
    var hapticFn = opts.haptic || function () {};
    var soundFn = opts.sound || function () {};
    var bgmStartFn = opts.bgmStart || function () {};
    var bgmStopFn = opts.bgmStop || function () {};
    var createCardCanvas = opts.createCardCanvas || function () { return null; };

    var state = 'menu'; // menu | countdown | playing | over
    var score = 0, combo = 0, maxCombo = 0;
    var notes = [], floats = [], pops = [];
    var elapsed = 0, spawnTimer = 0, countdown = 0, countInt = 0;
    var lastTime = 0, layout = null, buttons = {};
    var pressed = { lane: -1, t: 0 };
    var laneFlash = [0, 0, 0, 0];
    var lastSpawnLane = -1; // 记录上一次掉落的轨道，避免方向机械重复
    var overReason = '', endScore = 0, overAch = null, lastCard = null;
    var clock = 0, shake = 0, shakeMag = 0;

    function nowSec() {
      var t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      return t / 1000;
    }

    function computeLayout(w, h) {
      var topBarH = Math.max(64, h * 0.09);
      var bottomBarH = Math.max(104, h * 0.15);
      var playTop = topBarH;
      var playBottom = h - bottomBarH;
      var laneW = w / 4;
      var noteSize = Math.min(laneW * 0.62, 64);
      var buttonSize = Math.min(laneW * 0.72, 80);
      var hitZoneH = Math.max(92, bottomBarH * 0.82);
      var hitZoneCenterY = playBottom - hitZoneH * 0.5 - 14;
      var hitZoneTop = hitZoneCenterY - hitZoneH / 2;
      var hitZoneBottom = hitZoneCenterY + hitZoneH / 2;
      var buttonY = h - bottomBarH / 2;
      return {
        w: w, h: h, topBarH: topBarH, bottomBarH: bottomBarH,
        playTop: playTop, playBottom: playBottom, laneW: laneW,
        noteSize: noteSize, buttonSize: buttonSize,
        hitZoneH: hitZoneH, hitZoneCenterY: hitZoneCenterY,
        hitZoneTop: hitZoneTop, hitZoneBottom: hitZoneBottom,
        buttonY: buttonY, laneX: function (i) { return (i + 0.5) * laneW; }
      };
    }

    function resetGame() {
      score = 0; combo = 0; maxCombo = 0; notes = []; floats = []; pops = [];
      elapsed = 0; spawnTimer = 0.6; overReason = ''; overAch = null; lastCard = null;
      shake = 0; lastSpawnLane = -1;
    }

    function startCountdown() { resetGame(); state = 'countdown'; countdown = 3.0; countInt = 0; soundFn('start'); bgmStartFn(); }

    function startPlaying() { state = 'playing'; lastTime = nowSec(); }

    function trySpawn() {
      var L = layout;
      var candidates = [0, 1, 2, 3];
      var ok = [];
      for (var i = 0; i < 4; i++) {
        var lastY = -9999, hasNote = false;
        for (var j = 0; j < notes.length; j++) {
          if (notes[j].lane === i) { hasNote = true; if (notes[j].y > lastY) lastY = notes[j].y; }
        }
        // 轨道空闲条件：该轨道没有图标，或最近一个图标已落出顶部生成区（不会与新星重叠）
        if (!hasNote || lastY > L.noteSize * 2.2) ok.push(i);
      }
      var pool = ok.length ? ok : candidates;
      // 在还有其它轨道可选时，不与上一次同一方向，消除“连点同一箭头”的机械感
      if (pool.length > 1 && lastSpawnLane >= 0) {
        var alt = [];
        for (var k = 0; k < pool.length; k++) if (pool[k] !== lastSpawnLane) alt.push(pool[k]);
        if (alt.length) pool = alt;
      }
      var lane = pool[Math.floor(Math.random() * pool.length)];
      lastSpawnLane = lane;
      notes.push({ lane: lane, y: -L.noteSize, hit: false, perfect: false, spawnT: 0 });
    }

    function press(dirKey) {
      if (state !== 'playing') return;
      var lane = -1;
      for (var i = 0; i < DIRS.length; i++) if (DIRS[i].key === dirKey) lane = i;
      if (lane < 0) return;
      pressed.lane = lane; pressed.t = 0.16;
      var L = layout, target = null;
      for (var k = 0; k < notes.length; k++) {
        var n = notes[k];
        if (n.hit || n.lane !== lane) continue;
        var within = n.y > L.hitZoneTop - L.noteSize * 0.4 && n.y < L.hitZoneBottom + L.noteSize * 0.25;
        if (within && (!target || n.y > target.y)) target = n;
      }
      if (target) {
        target.hit = true;
        var perfect = Math.abs(target.y - L.hitZoneCenterY) < L.hitZoneH * 0.2;
        target.perfect = perfect;
        var pts = perfect ? 10 : 5;
        score += pts; combo++; if (combo > maxCombo) maxCombo = combo;
        laneFlash[lane] = 0.3;
        floats.push({ x: L.laneX(lane), y: L.hitZoneCenterY, text: '+' + pts, life: 0.8, color: perfect ? '#FFE27A' : '#ffffff', big: perfect });
        pops.push({ x: L.laneX(lane), y: L.hitZoneCenterY, t: 0.4, color: perfect ? '#FFE27A' : DIRS[lane].glow });
        hapticFn(perfect ? 'medium' : 'light');
        soundFn(perfect ? 'perfect' : 'hit');
      } else {
        overReason = 'wrong'; endGame();
      }
    }

    function pointer(x, y) {
      var L = layout;
      if (state === 'menu') {
        if (hit(buttons.start, x, y)) startCountdown();
      } else if (state === 'playing') {
        if (y > L.playBottom) {
          var lane = Math.floor(x / L.laneW);
          if (lane >= 0 && lane < 4) press(DIRS[lane].key);
        }
      } else if (state === 'over') {
        if (hit(buttons.restart, x, y)) startCountdown();
        else if (hit(buttons.share, x, y)) doShare();
      }
    }

    function primary() {
      if (state === 'menu' || state === 'over') startCountdown();
    }

    function endGame() {
      state = 'over'; endScore = score; combo = 0;
      overAch = getAchievement(score);
      hapticFn('heavy');
      soundFn('fail');
      bgmStopFn();
      shake = 0.45; shakeMag = 12;
      lastCard = buildShareCard();
    }

    function doShare() {
      if (!overAch) overAch = getAchievement(endScore);
      var card = lastCard || buildShareCard();
      shareFn({
        title: '我在《节奏能手》拿到 ' + endScore + ' 分，获得「' + overAch.title + '」称号！',
        score: endScore, achievement: overAch, cardCanvas: card
      });
    }

    function buildShareCard() {
      var c = createCardCanvas(640, 860);
      if (!c) return null;
      var cx = c.getContext('2d');
      drawCard(cx, 640, 860, { score: endScore, ach: overAch || getAchievement(endScore) });
      return c;
    }

    function hit(r, x, y) {
      return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    function update(dt) {
      clock += dt;
      if (state === 'countdown') {
        countdown -= dt;
        var ci = Math.ceil(countdown);
        if (ci !== countInt) {
          countInt = ci;
          if (ci > 0) soundFn('tick'); // 3 / 2 / 1 每拍滴答
        }
        if (countdown <= 0) { soundFn('go'); startPlaying(); }
      } else if (state === 'playing') {
        elapsed += dt;
        var dur = clamp(2.2 - elapsed * 0.018, 0.92, 2.2);
        var interval = clamp(1.25 - elapsed * 0.012, 0.58, 1.25);
        spawnTimer -= dt;
        if (spawnTimer <= 0) { trySpawn(); spawnTimer = interval * (0.82 + Math.random() * 0.32); }
        var travel = layout.hitZoneCenterY - (-layout.noteSize);
        var speed = travel / dur;
        for (var i = 0; i < notes.length; i++) { notes[i].y += speed * dt; notes[i].spawnT += dt; }
        for (var j = 0; j < notes.length; j++) {
          var n = notes[j];
          if (!n.hit && n.y - layout.noteSize * 0.5 > layout.hitZoneBottom + layout.noteSize * 0.25) {
            overReason = 'miss'; endGame(); return;
          }
        }
        notes = notes.filter(function (n) { return !n.hit && n.y < layout.h + 60; });
        stepFloats(dt);
        for (var f = 0; f < 4; f++) if (laneFlash[f] > 0) laneFlash[f] -= dt;
        if (pressed.t > 0) pressed.t -= dt;
      } else if (state === 'over') {
        stepFloats(dt);
      }
      for (var q = pops.length - 1; q >= 0; q--) { pops[q].t -= dt; if (pops[q].t <= 0) pops.splice(q, 1); }
      if (shake > 0) shake -= dt;
    }

    function stepFloats(dt) {
      for (var i = 0; i < floats.length; i++) { floats[i].y -= 46 * dt; floats[i].life -= dt; }
      floats = floats.filter(function (f) { return f.life > 0; });
    }

    // ---------------- 渲染 ----------------
    function render() {
      var s = getSize();
      layout = computeLayout(s.w, s.h);
      ctx.clearRect(0, 0, s.w, s.h);
      ctx.save();
      if (shake > 0) {
        var m = shakeMag * (shake / 0.45);
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      drawBackground(s.w, s.h);
      if (state === 'menu') {
        buttons = {};
        drawMenu(s.w, s.h);
      } else {
        drawPlayfield(s.w, s.h);
        if (state === 'playing' || state === 'countdown') drawHUD(s.w, s.h);
        if (state === 'countdown') drawCountdown(s.w, s.h);
        if (state === 'over') { buttons = {}; drawOver(s.w, s.h); }
      }
      ctx.restore();
    }

    function drawBackground(w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#11132E');
      g.addColorStop(0.55, '#0A0B1F');
      g.addColorStop(1, '#05060F');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 顶部径向辉光
      var rg = ctx.createRadialGradient(w * 0.5, -h * 0.1, 10, w * 0.5, -h * 0.1, h * 0.9);
      rg.addColorStop(0, 'rgba(108,92,231,0.28)');
      rg.addColorStop(1, 'rgba(108,92,231,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      // 漂浮装饰
      ctx.save();
      for (var i = 0; i < PARTICLES.length; i++) {
        var p = PARTICLES[i];
        var yy = ((p.y + clock * p.sp) % 1.2) - 0.1;
        var xx = p.x + Math.sin(clock * 0.3 + p.drift) * 0.02;
        var px = xx * w, py = yy * h;
        var a = 0.05 + 0.04 * Math.sin(clock + p.drift);
        if (p.note) drawNote(ctx, px, py, p.r, '#9aa6ff', a);
        else {
          ctx.beginPath(); ctx.arc(px, py, p.r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(154,166,255,' + a + ')'; ctx.fill();
        }
      }
      ctx.restore();
      // 暗角
      var vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    }

    function drawTile(x, y, size, dir, alpha, scale) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      var sc = scale == null ? 1 : scale;
      var s = size * sc;
      var r = s * 0.26;
      ctx.shadowColor = dir.glow;
      ctx.shadowBlur = 18;
      roundRect(ctx, x - s / 2, y - s / 2, s, s, r);
      var g = ctx.createLinearGradient(0, y - s / 2, 0, y + s / 2);
      g.addColorStop(0, dir.light);
      g.addColorStop(1, dir.color);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      // 顶部高光
      roundRect(ctx, x - s / 2 + 3, y - s / 2 + 3, s - 6, s * 0.42, r * 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      // 描边
      roundRect(ctx, x - s / 2, y - s / 2, s, s, r);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
      drawArrow(ctx, x, y, s * 0.3, dir.angle, '#ffffff');
      ctx.restore();
    }

    function drawPlayfield(w, h) {
      var L = layout;
      // 轨道渐变底
      for (var i = 0; i < 4; i++) {
        var gx = ctx.createLinearGradient(0, L.playTop, 0, L.playBottom);
        gx.addColorStop(0, i % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.04)');
        gx.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gx;
        ctx.fillRect(L.laneW * i, L.playTop, L.laneW, L.playBottom - L.playTop);
      }
      // 轨道分隔
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (var k = 1; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(L.laneW * k, L.playTop); ctx.lineTo(L.laneW * k, L.playBottom); ctx.stroke();
      }
      // 触发区（玻璃感横向区域 + 脉冲辉光）
      var pulse = (Math.sin(clock * 4) + 1) / 2;
      var zg = ctx.createLinearGradient(0, L.hitZoneTop, 0, L.hitZoneBottom);
      zg.addColorStop(0, 'rgba(124,140,255,0.04)');
      zg.addColorStop(0.5, 'rgba(124,140,255,' + (0.12 + 0.06 * pulse) + ')');
      zg.addColorStop(1, 'rgba(124,140,255,0.04)');
      roundRect(ctx, 10, L.hitZoneTop, w - 20, L.hitZoneH, 16);
      ctx.fillStyle = zg; ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(150,165,255,' + (0.45 + 0.35 * pulse) + ')';
      ctx.shadowColor = 'rgba(124,140,255,0.8)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 每轨目标圈
      for (var c = 0; c < 4; c++) {
        var cx = L.laneX(c);
        ctx.beginPath();
        ctx.arc(cx, L.hitZoneCenterY, L.noteSize * 0.56, 0, Math.PI * 2);
        ctx.strokeStyle = laneFlash[c] > 0 ? DIRS[c].light : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = laneFlash[c] > 0 ? 3 : 2;
        if (laneFlash[c] > 0) { ctx.shadowColor = DIRS[c].glow; ctx.shadowBlur = 16; }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // 掉落图标
      for (var n = 0; n < notes.length; n++) {
        var note = notes[n];
        var fade = clamp(note.spawnT / 0.18, 0, 1);
        var sc = lerp(0.7, 1, easeOutCubic(fade));
        drawTile(L.laneX(note.lane), note.y, L.noteSize, DIRS[note.lane], fade, sc);
      }
      // 命中爆点
      for (var q = 0; q < pops.length; q++) {
        var pop = pops[q];
        var pt = 1 - pop.t / 0.4;
        ctx.save();
        ctx.globalAlpha = (1 - pt) * 0.9;
        ctx.beginPath();
        ctx.arc(pop.x, pop.y, lerp(8, L.noteSize * 0.9, easeOutCubic(pt)), 0, Math.PI * 2);
        ctx.strokeStyle = pop.color; ctx.lineWidth = 4; ctx.stroke();
        ctx.restore();
      }
      // 底部方向按键
      for (var b = 0; b < 4; b++) {
        var bx = L.laneX(b), by = L.buttonY, bs = L.buttonSize;
        var isPressed = (pressed.lane === b && pressed.t > 0) || laneFlash[b] > 0;
        var bscale = isPressed ? 1.06 : 1;
        var s2 = bs * bscale;
        ctx.save();
        if (isPressed) { ctx.shadowColor = DIRS[b].glow; ctx.shadowBlur = 22; }
        roundRect(ctx, bx - s2 / 2, by - s2 / 2, s2, s2, s2 * 0.24);
        var gb = ctx.createLinearGradient(0, by - s2 / 2, 0, by + s2 / 2);
        if (isPressed) { gb.addColorStop(0, '#ffffff'); gb.addColorStop(1, DIRS[b].light); }
        else { gb.addColorStop(0, DIRS[b].light); gb.addColorStop(1, DIRS[b].color); }
        ctx.fillStyle = gb; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = isPressed ? 3 : 1.5;
        ctx.strokeStyle = isPressed ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)';
        ctx.stroke();
        drawArrow(ctx, bx, by, s2 * 0.26, DIRS[b].angle, '#ffffff');
        ctx.restore();
      }
      // 浮动得分
      for (var f = 0; f < floats.length; f++) {
        var fl = floats[f];
        ctx.save();
        ctx.globalAlpha = clamp(fl.life / 0.8, 0, 1);
        text(ctx, fl.text, fl.x, fl.y, (fl.big ? 'bold 28px' : 'bold 21px') + ' system-ui, sans-serif', fl.color);
        ctx.restore();
      }
    }

    function drawHUD(w, h) {
      var L = layout;
      ctx.save();
      var g = ctx.createLinearGradient(0, 0, 0, L.topBarH);
      g.addColorStop(0, 'rgba(8,9,22,0.85)');
      g.addColorStop(1, 'rgba(8,9,22,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, L.topBarH);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, L.topBarH - 1, w, 1);
      text(ctx, '得分', w / 2, L.topBarH * 0.3, '600 12px system-ui, sans-serif', 'rgba(255,255,255,0.55)');
      gradText(ctx, String(score), w / 2, L.topBarH * 0.66, 'bold 32px system-ui, sans-serif', titleGrad(ctx, L.topBarH * 0.66, 30), 'center');
      text(ctx, '节奏能手', 16, L.topBarH * 0.5, '600 13px system-ui, sans-serif', 'rgba(255,255,255,0.45)', 'left');
      if (combo > 1) {
        var cw = 78, cx = w - 16 - cw, cy = L.topBarH * 0.5 - 13;
        glassPanel(ctx, cx, cy, cw, 26, 13, 0.1, 0.3);
        gradText(ctx, '连击 ×' + combo, cx + cw / 2, cy + 13, 'bold 14px system-ui, sans-serif', titleGrad(ctx, cy + 13, 14));
      }
      ctx.restore();
    }

    function drawCountdown(w, h) {
      var num = Math.ceil(countdown);
      var label = num > 0 ? String(num) : 'GO';
      var prog = 1 - (countdown - Math.floor(countdown)); // 0->1 within each second
      var scale = lerp(1.5, 0.9, easeOutCubic(clamp(prog, 0, 1)));
      var alpha = clamp(1 - prog * 0.3, 0.4, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = alpha;
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      // 光环
      ctx.beginPath();
      ctx.arc(0, 0, 70, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124,140,255,0.4)'; ctx.lineWidth = 4; ctx.stroke();
      gradText(ctx, label, 0, 0, 'bold 96px system-ui, sans-serif', titleGrad(ctx, 0, 90));
      ctx.restore();
      text(ctx, '图标落入横线时，按下对应方向键', w / 2, h * 0.68, '600 15px system-ui, sans-serif', 'rgba(255,255,255,0.85)');
    }

    function drawMenu(w, h) {
      var cy = h * 0.3;
      // 标题音符
      ctx.save();
      ctx.shadowColor = 'rgba(124,140,255,0.8)'; ctx.shadowBlur = 24;
      drawNote(ctx, w / 2, cy - 70, 60, '#FFE27A', 1);
      ctx.restore();
      gradText(ctx, '节奏能手', w / 2, cy + 14, 'bold 50px system-ui, sans-serif', titleGrad(ctx, cy + 14, 48));
      text(ctx, '跟着节奏，按对方向', w / 2, cy + 62, '600 16px system-ui, sans-serif', 'rgba(255,255,255,0.72)');
      // 玩法玻璃卡
      var cw = w * 0.84, cx = (w - cw) / 2, cyc = h * 0.5;
      glassPanel(ctx, cx, cyc, cw, 110, 18, 0.06, 0.16);
      var lines = [
        '图标从顶部掉落，进入底部横线区域时',
        '按下对应方向的按键即可命中得分',
        '按错方向 或 漏接掉落 = 游戏结束'
      ];
      for (var i = 0; i < lines.length; i++) {
        text(ctx, lines[i], w / 2, cyc + 24 + i * 26, '500 14px system-ui, sans-serif', 'rgba(255,255,255,0.62)');
      }
      // 开始按钮（渐变 + 微光）
      var bw = w * 0.56, bh = 58, bx = (w - bw) / 2, by = h * 0.74;
      buttons.start = { x: bx, y: by, w: bw, h: bh };
      ctx.save();
      ctx.shadowColor = 'rgba(108,92,231,0.7)'; ctx.shadowBlur = 22;
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      var gb = ctx.createLinearGradient(bx, by, bx, by + bh);
      gb.addColorStop(0, '#8A7BFF'); gb.addColorStop(1, '#5B6BFF');
      ctx.fillStyle = gb; ctx.fill();
      ctx.shadowBlur = 0;
      // 流光
      var sh = ((clock * 0.6) % 1);
      var sg = ctx.createLinearGradient(bx + sh * bw - 60, 0, bx + sh * bw + 60, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = sg; ctx.fill();
      text(ctx, '开始游戏', w / 2, by + bh / 2, 'bold 20px system-ui, sans-serif', '#ffffff');
      ctx.restore();
    }

    function drawOver(w, h) {
      var L = layout;
      ctx.save();
      ctx.fillStyle = 'rgba(3,4,12,0.72)';
      ctx.fillRect(0, 0, w, h);
      var cw = w * 0.84, ch = h * 0.62, cx = (w - cw) / 2, cy = (h - ch) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
      roundRect(ctx, cx, cy, cw, ch, 24);
      var g = ctx.createLinearGradient(0, cy, 0, cy + ch);
      g.addColorStop(0, '#262A55'); g.addColorStop(1, '#15173A');
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(124,140,255,0.45)';
      roundRect(ctx, cx, cy, cw, ch, 24); ctx.stroke();

      text(ctx, '游戏结束', w / 2, cy + ch * 0.1, 'bold 20px system-ui, sans-serif', 'rgba(255,255,255,0.8)');
      text(ctx, '本局得分', w / 2, cy + ch * 0.24, '600 13px system-ui, sans-serif', 'rgba(255,255,255,0.55)');
      gradText(ctx, String(endScore), w / 2, cy + ch * 0.36, 'bold 60px system-ui, sans-serif', titleGrad(ctx, cy + ch * 0.36, 56));
      if (maxCombo > 1) {
        text(ctx, '最高连击 ×' + maxCombo, w / 2, cy + ch * 0.45, '600 13px system-ui, sans-serif', 'rgba(255,255,255,0.6)');
      }

      var ach = overAch || getAchievement(endScore);
      ctx.save();
      ctx.shadowColor = 'rgba(255,226,122,0.8)'; ctx.shadowBlur = 18;
      drawNote(ctx, w / 2, cy + ch * 0.58, 32, '#FFE27A', 1);
      ctx.restore();
      text(ctx, '获得称号', w / 2, cy + ch * 0.67, '600 13px system-ui, sans-serif', 'rgba(255,255,255,0.55)');
      gradText(ctx, '「' + ach.title + '」', w / 2, cy + ch * 0.74, 'bold 26px system-ui, sans-serif', titleGrad(ctx, cy + ch * 0.74, 24));
      text(ctx, ach.desc, w / 2, cy + ch * 0.81, '500 13px system-ui, sans-serif', 'rgba(255,255,255,0.62)');

      var bw = cw * 0.42, bh = 50, gap = cw * 0.08, totalW = bw * 2 + gap;
      var startX = (w - totalW) / 2, by = cy + ch - bh - 20;
      buttons.restart = { x: startX, y: by, w: bw, h: bh };
      buttons.share = { x: startX + bw + gap, y: by, w: bw, h: bh };
      glassPanel(ctx, startX, by, bw, bh, bh / 2, 0.1, 0.3);
      text(ctx, '再玩一次', startX + bw / 2, by + bh / 2, 'bold 17px system-ui, sans-serif', '#ffffff');
      ctx.save();
      ctx.shadowColor = 'rgba(108,92,231,0.7)'; ctx.shadowBlur = 18;
      roundRect(ctx, startX + bw + gap, by, bw, bh, bh / 2);
      var g2 = ctx.createLinearGradient(startX + bw + gap, by, startX + bw + gap, by + bh);
      g2.addColorStop(0, '#8A7BFF'); g2.addColorStop(1, '#5B6BFF');
      ctx.fillStyle = g2; ctx.fill();
      ctx.restore();
      text(ctx, '分享成绩', startX + bw + gap + bw / 2, by + bh / 2, 'bold 17px system-ui, sans-serif', '#ffffff');
      ctx.restore();
    }

    // 分享卡片（离屏画布，精修版）
    function drawCard(c, W, H, data) {
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2A2E60'); g.addColorStop(1, '#10122C');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      var rg = c.createRadialGradient(W * 0.5, -H * 0.05, 10, W * 0.5, -H * 0.05, H * 0.7);
      rg.addColorStop(0, 'rgba(124,140,255,0.35)'); rg.addColorStop(1, 'rgba(124,140,255,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
      var midY = H * 0.4, sp = 22;
      for (var i = 0; i < 5; i++) { var y = midY + (i - 2) * sp; c.beginPath(); c.moveTo(50, y); c.lineTo(W - 50, y); c.stroke(); }
      drawNote(c, W / 2, 150, 64, '#FFE27A', 1);
      gradText(c, '节奏能手', W / 2, 250, 'bold 54px system-ui, sans-serif', titleGrad(c, 250, 50));
      text(c, '本局得分', W / 2, 360, '600 20px system-ui, sans-serif', 'rgba(255,255,255,0.6)');
      gradText(c, String(data.score), W / 2, 445, 'bold 120px system-ui, sans-serif', titleGrad(c, 445, 110));
      var ach = data.ach;
      text(c, '获得称号', W / 2, 565, '600 20px system-ui, sans-serif', 'rgba(255,255,255,0.6)');
      gradText(c, '「' + ach.title + '」', W / 2, 625, 'bold 46px system-ui, sans-serif', titleGrad(c, 625, 42));
      text(c, ach.desc, W / 2, 685, '500 22px system-ui, sans-serif', 'rgba(255,255,255,0.72)');
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(70, 760); c.lineTo(W - 70, 760); c.stroke();
      text(c, '微信小游戏 · 节奏能手', W / 2, 805, '500 20px system-ui, sans-serif', 'rgba(255,255,255,0.5)');
    }

    function loop() {
      var s = getSize();
      layout = computeLayout(s.w, s.h);
      var t = nowSec();
      var dt = lastTime ? (t - lastTime) : 0;
      lastTime = t;
      dt = Math.min(dt, 0.05);
      update(dt);
      render();
      raf(loop);
    }

    return {
      start: function () { lastTime = 0; raf(loop); },
      press: press,
      pointer: pointer,
      primary: primary,
      destroy: function () {}
    };
  }

  return createMusicGame;
});
