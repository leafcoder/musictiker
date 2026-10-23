/*
 * 节奏能手 — 音效模块（Web Audio 合成，无需音频文件）
 * 浏览器与微信小游戏通用：自动检测 AudioContext / wx.createWebAudioContext。
 * 提供 sound('start' | 'hit' | 'perfect' | 'fail')。
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

    function ensure() {
      try {
        if (!ctx && AC) ctx = (typeof AC === 'function') ? new AC() : AC;
        if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      } catch (e) { ctx = null; }
      return ctx;
    }

    function tone(freq, start, dur, type, vol) {
      var c = ensure();
      if (!c) return;
      var t0 = c.currentTime + start;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    function sound(type) {
      var c = ensure();
      if (!c) return;
      if (type === 'start') {
        // 上行三音，明亮开局
        tone(523.25, 0.00, 0.12, 'triangle', 0.25);
        tone(659.25, 0.10, 0.12, 'triangle', 0.25);
        tone(783.99, 0.20, 0.20, 'triangle', 0.28);
      } else if (type === 'hit') {
        // 清脆短促的命中音
        tone(880.00, 0.00, 0.09, 'square', 0.16);
        tone(1318.5, 0.01, 0.07, 'sine', 0.10);
      } else if (type === 'perfect') {
        // 完美命中：更高更亮
        tone(1046.5, 0.00, 0.10, 'square', 0.16);
        tone(1568.0, 0.02, 0.09, 'sine', 0.12);
      } else if (type === 'fail') {
        // 下行低频，失败感
        tone(196.00, 0.00, 0.50, 'sawtooth', 0.22);
        tone(146.83, 0.05, 0.55, 'sawtooth', 0.20);
        tone(110.00, 0.12, 0.62, 'sawtooth', 0.18);
      }
    }

    return { sound: sound, resume: function () { ensure(); } };
  }

  return createAudio;
});
