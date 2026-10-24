// JavaScript injected into pinterest.com. It adds a ⬇ button on every pin image and
// reports the chosen image URL to the app with postMessage({ type: 'save', url }).
export const INJECTED_JS = `
(function () {
  if (window.__pinvault) return;
  window.__pinvault = true;

  function bestUrl(img) {
    var url = img.currentSrc || img.src;
    var max = 0;
    if (img.srcset) {
      img.srcset.split(',').forEach(function (part) {
        var bits = part.trim().split(/\\s+/);
        var w = parseFloat(bits[1]) || 0;
        if (bits[0] && w >= max) { max = w; url = bits[0]; }
      });
    }
    return url;
  }

  function send(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  window.__pinvaultSaveVisible = function () {
    var imgs = document.querySelectorAll('img[src*="pinimg.com"]');
    var best = null, bestArea = 0;
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      var h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (w * h > bestArea) { bestArea = w * h; best = imgs[i]; }
    }
    if (best && bestArea > 10000) send({ type: 'save', url: bestUrl(best) });
    else send({ type: 'none' });
  };

  var style = document.createElement('style');
  style.textContent =
    '.pinvault-btn{position:absolute;top:8px;right:8px;z-index:2147483647;width:36px;height:36px;' +
    'border-radius:18px;background:rgba(0,0,0,.65);color:#fff;font:bold 18px/36px sans-serif;' +
    'text-align:center;border:1px solid rgba(255,255,255,.5);user-select:none;-webkit-user-select:none}';
  (document.head || document.documentElement).appendChild(style);

  function stop(e) { e.preventDefault(); e.stopPropagation(); }

  function decorate() {
    var imgs = document.querySelectorAll('img[src*="pinimg.com"]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.__pinvault) continue;
      var r = img.getBoundingClientRect();
      if (r.width < 110 || r.height < 110) continue; // avatars, icons, not-yet-loaded images
      var host = img.parentElement;
      if (!host) continue;
      img.__pinvault = true;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      var btn = document.createElement('div');
      btn.className = 'pinvault-btn';
      btn.textContent = '\\u2B07';
      btn.__img = img;
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (t) {
        btn.addEventListener(t, function (e) { e.stopPropagation(); }, true);
      });
      btn.addEventListener('click', function (e) {
        stop(e);
        var b = e.currentTarget;
        send({ type: 'save', url: bestUrl(b.__img) });
        b.textContent = '\\u2713';
        setTimeout(function () { b.textContent = '\\u2B07'; }, 1500);
      }, true);
      host.appendChild(btn);
    }
  }

  function safeDecorate() { try { decorate(); } catch (e) {} }
  setInterval(safeDecorate, 800);
  safeDecorate();
})();
true;
`;

export const SAVE_VISIBLE_JS = 'window.__pinvaultSaveVisible && window.__pinvaultSaveVisible(); true;';
