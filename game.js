// 节奏能手 —— 微信小游戏入口
// 在微信开发者工具中导入本目录（music-master）即可运行。
const createMusicGame = require('./src/core.js');
const createAudio = require('./src/audio.js');
const audio = createAudio();

const sys = wx.getSystemInfoSync();
const dpr = sys.pixelRatio || 1;

// 主画布（第一个 createCanvas 即屏幕画布）
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
canvas.width = sys.windowWidth * dpr;
canvas.height = sys.windowHeight * dpr;
ctx.scale(dpr, dpr);

const platform = {
  ctx: ctx,
  getSize: () => ({ w: sys.windowWidth, h: sys.windowHeight }),
  // 小游戏运行时的逐帧回调：优先全局 requestAnimationFrame，其次 wx，再次 setTimeout 兜底
  raf: (cb) => {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
    if (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function') return wx.requestAnimationFrame(cb);
    return setTimeout(() => cb(Date.now()), 16);
  },
  createCardCanvas: (w, h) => {
    const c = wx.createCanvas(); // 离屏画布
    c.width = w; c.height = h;
    return c;
  },
  haptic: (t) => {
    try {
      const type = t === 'heavy' ? 'heavy' : (t === 'medium' ? 'medium' : 'light');
      wx.vibrateShort({ type });
    } catch (e) { try { wx.vibrateShort(); } catch (_) {} }
  },
  sound: audio.sound,
  bgmStart: () => audio.bgmStart(),
  bgmStop: () => audio.bgmStop(),
  share: (payload) => {
    const card = payload.cardCanvas;
    const fire = (imageUrl) => {
      wx.shareAppMessage({
        title: payload.title,
        imageUrl: imageUrl || '',
        query: 'score=' + payload.score
      });
    };
    if (card && wx.canvasToTempFilePath) {
      wx.canvasToTempFilePath({
        canvas: card,
        success: (res) => fire(res.tempFilePath),
        fail: () => fire()
      });
    } else {
      fire();
    }
  }
};

const game = createMusicGame(platform);

// 触摸：兼容不同基础库/机型下 touch 对象提供的坐标字段
// （部分版本只有 clientX/clientY，部分只有 x/y，二者均为逻辑像素，可直接用于命中判定）
function touchXY(t) {
  var x = (t.clientX != null) ? t.clientX : ((t.x != null) ? t.x : t.pageX);
  var y = (t.clientY != null) ? t.clientY : ((t.y != null) ? t.y : t.pageY);
  return { x: (x == null ? 0 : x), y: (y == null ? 0 : y) };
}

wx.onTouchStart(function (e) {
  if (!e || !e.touches || !e.touches.length) return;
  audio.resume(); // 微信端在用户手势内恢复音频上下文（满足自动播放限制）
  var p = touchXY(e.touches[0]);
  game.pointer(p.x, p.y);
});

// 分享菜单（右上角 …）与被动分享
wx.showShareMenu({ withShareTicket: true });
wx.onShareAppMessage(() => ({
  title: '节奏能手 · 跟着节奏按对方向',
  query: 'from=share'
}));

game.start();
