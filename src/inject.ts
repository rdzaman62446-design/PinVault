// JavaScript injected into the site. It adds a ⬇ button on every image from `hosts` and
// reports the chosen image URL to the app with postMessage({ type: 'save', url }).
export const buildInjectedJs = (hosts: string[], extraJs = '') => `
(function () {
  if (window.__pinvault) return;
  window.__pinvault = true;
  var HOSTS = ${JSON.stringify(hosts)};

  function srcOf(img) {
    return img.currentSrc || img.src || img.getAttribute('data-lazy-src') || '';
  }

  // Matches a host or any of its subdomains (e.g. scontent-xyz.cdninstagram.com).
  function fromSite(src) {
    var m = /^https?:\\/\\/([^\\/?#]+)/.exec(src);
    if (!m) return false;
    for (var h = 0; h < HOSTS.length; h++) {
      var host = HOSTS[h], name = m[1];
      if (name === host || name.slice(-host.length - 1) === '.' + host) return true;
    }
    return false;
  }

  function findImgs() {
    var all = document.querySelectorAll('img');
    var out = [];
    for (var i = 0; i < all.length; i++) if (fromSite(srcOf(all[i]))) out.push(all[i]);
    return out;
  }

  function bestUrl(img) {
    var url = srcOf(img);
    var max = 0;
    var srcset = img.srcset || img.getAttribute('data-lazy-srcset') || '';
    if (srcset) {
      srcset.split(',').forEach(function (part) {
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
    var imgs = findImgs();
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
    var imgs = findImgs();
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

  // "Save all": scrolls through the page collecting every image, then reports the list.
  window.__pinvaultCollect = function () {
    if (window.__pinvaultCollecting) return;
    window.__pinvaultCollecting = true;
    window.__pinvaultStop = false;
    var seen = {}, urls = [], lastHeight = -1, still = 0;
    function grab() {
      var imgs = findImgs();
      for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        var lazy = imgs[i].hasAttribute('data-lazy-src');
        if (!lazy && (r.width < 80 || r.height < 80)) continue;
        var u = bestUrl(imgs[i]);
        if (u && !seen[u]) { seen[u] = 1; urls.push(u); }
      }
    }
    function finish() {
      window.__pinvaultCollecting = false;
      send({ type: 'collected', urls: urls, title: document.title || '' });
    }
    function step() {
      try { grab(); } catch (e) {}
      send({ type: 'collecting', count: urls.length });
      var height = document.documentElement.scrollHeight;
      var atBottom = window.innerHeight + window.scrollY >= height - 40;
      still = atBottom && height === lastHeight ? still + 1 : 0;
      lastHeight = height;
      if (window.__pinvaultStop || urls.length >= 300 || still >= 4) return finish();
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      setTimeout(step, 900);
    }
    window.scrollTo(0, 0);
    setTimeout(step, 700);
  };

  function safeDecorate() { try { decorate(); } catch (e) {} }
  setInterval(safeDecorate, 800);
  safeDecorate();
${extraJs}
})();
true;
`;

// Reddit's mobile site covers the page with "get the app" prompts (<xpromo-*> elements)
// and locks scrolling. Remove the prompts; unwrap the ones that wrap real content.
export const REDDIT_CLEANUP_JS = `
  function cleanReddit() {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = el.tagName.toLowerCase();
      var promo = tag.indexOf('xpromo') === 0 || /xpromo/i.test(el.id || '') ||
        (el.getAttribute('bundlename') || '').indexOf('xpromo') !== -1;
      if (!promo || !el.parentNode) continue;
      if (tag.indexOf('blocking-container') !== -1 || tag.indexOf('content-gate') !== -1) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      }
      el.parentNode.removeChild(el);
    }
    var lock = [document.documentElement, document.body];
    for (var j = 0; j < lock.length; j++) {
      if (!lock[j]) continue;
      if (lock[j].style.overflow === 'hidden') lock[j].style.overflow = '';
      if (lock[j].style.position === 'fixed') lock[j].style.position = '';
    }
  }
  setInterval(function () { try { cleanReddit(); } catch (e) {} }, 700);
`;

export const SAVE_VISIBLE_JS = 'window.__pinvaultSaveVisible && window.__pinvaultSaveVisible(); true;';
export const COLLECT_ALL_JS = 'window.__pinvaultCollect && window.__pinvaultCollect(); true;';
export const STOP_COLLECT_JS = 'window.__pinvaultStop = true; true;';
