/*
 * 节奏能手 — 音效 / 背景音乐模块（Web Audio 实时合成，无需任何音频文件）
 * 浏览器与微信小游戏通用：自动检测 AudioContext / wx.createWebAudioContext。
 *
 * 音效：    sound('start' | 'hit' | 'perfect' | 'fail' | 'tick' | 'go')
 *            风格：空灵清脆的钟铃音（正弦 + 八度 + 非谐泛音，快起音、闪烁长尾）。
 * 背景音乐：bgmStart() / bgmStop()  —— 原创合成循环，规避版权风险。
 *
 * 版权说明：本模块所有声音均由 OscillatorNode / 噪声缓冲区实时合成，
 *           不含任何受版权保护的乐曲或采样，可安全用于发布。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createAudio() {
    var AC = null;
    if (typeof AudioContext !== 'undefined') AC = AudioContext;
    else if (typeof webkitAudioContext !== 'undefined') AC = webkitAudioContext;
    else if (typeof wx !== 'undefined' && wx.createWebAudioContext) AC = wx.createWebAudioContext;

    var ctx = null;
    var noiseBuffer = null;

    function ensure() {
      try {
        if (!ctx && AC) ctx = (typeof AC === 'function') ? new AC() : AC;
        if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      } catch (e) { ctx = null; }
      return ctx;
    }

    // 空灵清脆的钟铃音：正弦基频 + 八度 + 非谐泛音（钟铃质感），快起音、闪烁长尾
    function bell(freq, start, dur, vol, partials) {
      var c = ensure();
      if (!c) return;
      var t0 = c.currentTime + start;
      var parts = partials || [
        { m: 1, v: 1.0 },
        { m: 2, v: 0.5 },     // 八度，增加“清脆”
        { m: 2.76, v: 0.22 }  // 钟铃非谐分量，制造“空灵通透”
      ];
      for (var i = 0; i < parts.length; i++) {
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * parts[i].m, t0);
        var v = vol * parts[i].v;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(v, t0 + 0.006); // 极快起音 -> 清脆
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (i === 0 ? 1 : 0.65));
        osc.connect(g);
        g.connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      }
    }

    function sound(type) {
      var c = ensure();
      if (!c) return;
      if (type === 'start') {
        // 上行钟铃琶音，明亮空灵的开局
        bell(523.25, 0.00, 0.5, 0.18);
        bell(659.25, 0.10, 0.5, 0.18);
        bell(783.99, 0.20, 0.7, 0.20);
        bell(1046.5, 0.30, 0.95, 0.16);
      } else if (type === 'tick') {
        // 倒计时滴答：清亮小铃
        bell(1318.5, 0.00, 0.22, 0.12);
      } else if (type === 'go') {
        // 开始信号：上扬两声清铃
        bell(659.25, 0.00, 0.4, 0.16);
        bell(987.77, 0.08, 0.6, 0.20);
      } else if (type === 'hit') {
        // 命中：清脆通透的铃音
        bell(880.0, 0.00, 0.35, 0.16);
      } else if (type === 'perfect') {
        // 完美命中：更高更亮，带闪烁泛音
        bell(1046.5, 0.00, 0.45, 0.16);
        bell(1568.0, 0.02, 0.5, 0.12);
      } else if (type === 'fail') {
        // 柔和下行的“叹息”音（空灵不刺耳）：正弦下滑 + 柔尾 + 轻微高泛音
        var t0 = c.currentTime;
        var o = c.createOscillator(); var g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(523.25, t0);
        o.frequency.exponentialRampToValueAtTime(261.63, t0 + 0.4);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + 0.65);
        bell(1046.5, 0.0, 0.5, 0.05);
      }
    }

    // ---------------- 背景音乐（原创合成循环） ----------------
    var bgmGain = null;
    var bgm = { on: false, timer: null, nextTime: 0, step: 0 };
    var BGM_TEMPO = 96;                       // BPM
    var STEP = (60 / BGM_TEMPO) / 2;           // 八分音符时长(秒)
    var STEPS_PER_LOOP = 32;                   // 4 小节 × 每小节 8 个八分音符
    // I–V–vi–IV 经典进行（C – G – Am – F），全部为原创和声，无版权曲
    var CHORDS = [
      { bass: 130.81, notes: [261.63, 329.63, 392.00] }, // C  (C E G)
      { bass: 196.00, notes: [246.94, 293.66, 392.00] }, // G  (G B D)
      { bass: 220.00, notes: [261.63, 329.63, 440.00] }, // Am (A C E)
      { bass: 174.61, notes: [220.00, 261.63, 349.23] }  // F  (F A C)
    ];

    function makeNoise(c) {
      try {
        var len = Math.floor((c.sampleRate || 44100) * 0.2);
        var buf = c.createBuffer(1, len, c.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
      } catch (e) { return null; }
    }

    // BGM 内使用的带 bgmGain 路由的音
    function bgmTone(freq, time, dur, type, vol, attack) {
      var c = ctx;
      if (!c || !bgmGain) return;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + (attack || 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g); g.connect(bgmGain);
      osc.start(time); osc.stop(time + dur + 0.03);
    }

    function bgmKick(time) {
      var c = ctx;
      if (!c || !bgmGain) return;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, time);
      o.frequency.exponentialRampToValueAtTime(50, time + 0.12);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      o.connect(g); g.connect(bgmGain);
      o.start(time); o.stop(time + 0.2);
    }

    function bgmHat(time) {
      var c = ctx;
      if (!c || !bgmGain || !noiseBuffer) return;
      var src = c.createBufferSource();
      src.buffer = noiseBuffer;
      var hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6500;
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.05, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      src.connect(hp); hp.connect(g); g.connect(bgmGain);
      src.start(time); src.stop(time + 0.06);
    }

    // 单个八分音符步进的编排
    function scheduleStep(step, time) {
      var pos = step % 8;                 // 小节内位置 0..7
      var bar = Math.floor(step / 8) % 4; // 第几小节 -> 和声
      var chord = CHORDS[bar];

      if (pos === 0) {
        // 小节开头：柔和铺底和弦 + 低音根音 + 底鼓 + 踩镲
        for (var i = 0; i < chord.notes.length; i++) {
          bgmTone(chord.notes[i], time, STEP * 8 * 0.96, 'triangle', 0.05, 0.10);
        }
        bgmTone(chord.bass, time, STEP * 3.6, 'sine', 0.16, 0.02);
        bgmKick(time);
        bgmHat(time);
      } else if (pos === 4) {
        // 半小节：低音五度 + 底鼓 + 踩镲
        bgmTone(chord.bass * 1.5, time, STEP * 3.0, 'sine', 0.13, 0.02);
        bgmKick(time);
        bgmHat(time);
      } else if (pos % 2 === 1) {
        bgmHat(time); // 反拍踩镲
      }

      // 轻盈分解琶音（偶数为重拍位），高八度，作为旋律点缀
      if (pos % 2 === 0) {
        var m = chord.notes[(Math.floor(step / 2)) % chord.notes.length] * 2;
        bgmTone(m, time, STEP * 1.3, 'sine', 0.045, 0.01);
      }
    }

    function scheduler() {
      var c = ensure();
      if (!c || !bgm.on) return;
      while (bgm.nextTime < c.currentTime + 0.25) {
        scheduleStep(bgm.step, bgm.nextTime);
        bgm.nextTime += STEP;
        bgm.step = (bgm.step + 1) % STEPS_PER_LOOP;
      }
      bgm.timer = setTimeout(scheduler, 60);
    }

    function bgmStart() {
      var c = ensure();
      if (!c || bgm.on) return;
      if (!bgmGain) {
        bgmGain = c.createGain();
        bgmGain.gain.value = 0.0001;
        bgmGain.connect(c.destination);
      }
      if (!noiseBuffer) noiseBuffer = makeNoise(c);
      bgm.on = true;
      bgm.step = 0;
      bgm.nextTime = c.currentTime + 0.12;
      // 淡入，避免突兀
      var t = c.currentTime;
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(0.0001, t);
      bgmGain.gain.exponentialRampToValueAtTime(0.35, t + 0.6);
      scheduler();
    }

    function bgmStop() {
      if (!bgm.on) return;
      bgm.on = false;
      if (bgm.timer) { clearTimeout(bgm.timer); bgm.timer = null; }
      var c = ctx;
      if (c && bgmGain) {
        var t = c.currentTime;
        bgmGain.gain.cancelScheduledValues(t);
        bgmGain.gain.setValueAtTime(Math.max(bgmGain.gain.value, 0.0001), t);
        bgmGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      }
    }

    return {
      sound: sound,
      resume: function () { ensure(); },
      bgmStart: bgmStart,
      bgmStop: bgmStop
    };
  }

  return createAudio;
});
