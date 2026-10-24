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

  // Videos are only offered on sites that can turn a <video> into a file URL (window.__pinvaultResolveVideo).
  function findVideos() {
    return window.__pinvaultResolveVideo ? Array.prototype.slice.call(document.querySelectorAll('video')) : [];
  }

  function saveVideo(video) {
    send({ type: 'resolving' });
    window.__pinvaultResolveVideo(video).then(function (url) {
      send(url ? { type: 'save', url: url } : { type: 'videoFail' });
    }, function () { send({ type: 'videoFail' }); });
  }

  window.__pinvaultSaveVisible = function () {
    var items = findImgs().concat(findVideos());
    var best = null, bestArea = 0;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].getBoundingClientRect();
      var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      var h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (w * h > bestArea) { bestArea = w * h; best = items[i]; }
    }
    if (!best || bestArea <= 10000) send({ type: 'none' });
    else if (best.tagName === 'VIDEO') saveVideo(best);
    else send({ type: 'save', url: bestUrl(best) });
  };

  var style = document.createElement('style');
  style.textContent =
    '.pinvault-btn{position:absolute;top:8px;right:8px;z-index:2147483647;width:36px;height:36px;' +
    'border-radius:18px;background:rgba(0,0,0,.65);color:#fff;font:bold 18px/36px sans-serif;' +
    'text-align:center;border:1px solid rgba(255,255,255,.5);user-select:none;-webkit-user-select:none}';
  (document.head || document.documentElement).appendChild(style);

  function stop(e) { e.preventDefault(); e.stopPropagation(); }

  function addButton(el, onTap) {
    if (el.__pinvault) return;
    var r = el.getBoundingClientRect();
    if (r.width < 110 || r.height < 110) return; // avatars, icons, not-yet-loaded media
    var host = el.parentElement;
    if (!host) return;
    el.__pinvault = true;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var btn = document.createElement('div');
    btn.className = 'pinvault-btn';
    btn.textContent = '\\u2B07';
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (t) {
      btn.addEventListener(t, function (e) { e.stopPropagation(); }, true);
    });
    btn.addEventListener('click', function (e) {
      stop(e);
      onTap(el);
      btn.textContent = '\\u2713';
      setTimeout(function () { btn.textContent = '\\u2B07'; }, 1500);
    }, true);
    host.appendChild(btn);
  }

  function decorate() {
    var imgs = findImgs();
    for (var i = 0; i < imgs.length; i++) addButton(imgs[i], function (img) { send({ type: 'save', url: bestUrl(img) }); });
    var vids = findVideos();
    for (var j = 0; j < vids.length; j++) addButton(vids[j], saveVideo);
  }

  // "Save all": scrolls through the page collecting every image, then reports the list.
  window.__pinvaultCollect = function () {
    if (window.__pinvaultCollecting) return;
    window.__pinvaultCollecting = true;
    window.__pinvaultStop = false;
    var seen = {}, urls = [], lastHeight = -1, still = 0, videos = [];
    // A site can limit collecting to part of the page (e.g. just the open post).
    var scope = (window.__pinvaultScope && window.__pinvaultScope()) || null;
    function grab() {
      var imgs = findImgs();
      for (var i = 0; i < imgs.length; i++) {
        if (scope && !scope.contains(imgs[i])) continue;
        var r = imgs[i].getBoundingClientRect();
        var lazy = imgs[i].hasAttribute('data-lazy-src');
        if (!lazy && (r.width < 80 || r.height < 80)) continue;
        var u = bestUrl(imgs[i]);
        if (u && !seen[u]) { seen[u] = 1; urls.push(u); }
      }
      var vids = findVideos();
      for (var j = 0; j < vids.length; j++) {
        if (scope && !scope.contains(vids[j])) continue;
        if (videos.indexOf(vids[j]) === -1) videos.push(vids[j]);
      }
    }
    function finish() {
      // Turn the videos seen on the way into file URLs, one at a time.
      var i = 0;
      (function next() {
        if (i >= videos.length || window.__pinvaultStop) {
          window.__pinvaultCollecting = false;
          send({ type: 'collected', urls: urls, title: document.title || '' });
          return;
        }
        var v = videos[i++];
        // Prefer every video of the post (carousels show only one at a time).
        var all = window.__pinvaultResolveAllVideos || function (el) {
          return window.__pinvaultResolveVideo(el).then(function (u) { return u ? [u] : []; });
        };
        all(v).then(function (list) {
          for (var k = 0; k < list.length; k++) if (!seen[list[k]]) { seen[list[k]] = 1; urls.push(list[k]); }
        }, function () {}).then(function () {
          send({ type: 'collecting', count: urls.length });
          next();
        });
      })();
    }
    // Carousels (e.g. Instagram multi-photo posts) only load a few slides at a time, so tap
    // "Next" on each one in view, collecting after every tap, until it runs out of slides.
    function nextButton() {
      var sel = window.__pinvaultCarouselNext;
      if (!sel) return null;
      var btns = document.querySelectorAll(sel);
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i], r = b.getBoundingClientRect();
        if (b.disabled || r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        if (scope && !scope.contains(b)) continue;
        return b;
      }
      return null;
    }
    function walkCarousels(done) {
      var taps = 0;
      (function next() {
        try { grab(); } catch (e) {}
        send({ type: 'collecting', count: urls.length });
        var b = window.__pinvaultStop || taps >= 40 ? null : nextButton();
        if (!b) return done();
        taps++;
        b.click();
        setTimeout(next, 550);
      })();
    }
    function step() {
      walkCarousels(afterWalk);
    }
    function afterWalk() {
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

// Instagram: walk multi-photo posts with their "Next" button, and on a post page collect only
// that post (not the "More posts" grid below it).
export const INSTAGRAM_JS = String.raw`
  window.__pinvaultCarouselNext = 'button[aria-label="Next"]';
  window.__pinvaultScope = function () {
    return /^\/(p|reel)\//.test(location.pathname) ? document.querySelector('article') || document.querySelector('main') : null;
  };

  // Reels stream through blob: URLs, so ask Instagram's own API (with the logged-in session)
  // for the post's video files. Shortcode -> media id uses Instagram's base64 alphabet.
  var IG_APP_ID = '936619743392459';
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function codeToId(code) {
    var n = BigInt(0);
    code = code.slice(0, 11);
    for (var i = 0; i < code.length; i++) n = n * BigInt(64) + BigInt(ALPHABET.indexOf(code[i]));
    return n.toString();
  }
  function codeFrom(href) {
    var m = /\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/.exec(href || '');
    return m ? m[1] : null;
  }
  // The post a video belongs to: a post link next to it (feed), else the page address (reel/post page).
  function codeFor(video) {
    var el = video.parentElement;
    for (var d = 0; el && d < 20; d++, el = el.parentElement) {
      if (el.querySelectorAll('video').length > 1) break; // left this post
      var link = el.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (link) return codeFrom(link.getAttribute('href'));
      if (el.tagName === 'ARTICLE') break;
    }
    return codeFrom(location.pathname);
  }
  function fileId(url) {
    return (url || '').split('?')[0].split('/').pop().replace(/\.\w+$/, '');
  }
  var infoCache = {};
  // All videos of a post (several for a carousel): [{ url, poster }].
  function videosFor(code) {
    if (!infoCache[code]) {
      infoCache[code] = fetch('/api/v1/media/' + codeToId(code) + '/info/', {
        credentials: 'include',
        headers: { 'X-IG-App-ID': IG_APP_ID, 'X-Requested-With': 'XMLHttpRequest' },
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var item = json.items && json.items[0];
          if (!item) return [];
          var media = item.carousel_media || [item];
          var out = [];
          for (var i = 0; i < media.length; i++) {
            var vv = media[i].video_versions;
            if (!vv || !vv.length) continue;
            var best = vv[0];
            for (var j = 1; j < vv.length; j++) if ((vv[j].width || 0) > (best.width || 0)) best = vv[j];
            var cands = media[i].image_versions2 && media[i].image_versions2.candidates;
            out.push({ url: best.url, poster: cands && cands[0] ? cands[0].url : '' });
          }
          return out;
        })
        .catch(function () { delete infoCache[code]; return []; });
    }
    return infoCache[code];
  }
  window.__pinvaultResolveAllVideos = function (video) {
    var src = video.currentSrc || video.src || '';
    if (/^https?:/.test(src)) return Promise.resolve([src]);
    var code = codeFor(video);
    if (!code) return Promise.resolve([]);
    return videosFor(code).then(function (vids) { return vids.map(function (v) { return v.url; }); });
  };
  window.__pinvaultResolveVideo = function (video) {
    var src = video.currentSrc || video.src || '';
    if (/^https?:/.test(src)) return Promise.resolve(src);
    var code = codeFor(video);
    if (!code) return Promise.resolve(null);
    return videosFor(code).then(function (vids) {
      if (!vids.length) return null;
      var poster = fileId(video.getAttribute('poster'));
      for (var i = 0; i < vids.length; i++) if (poster && fileId(vids[i].poster) === poster) return vids[i].url;
      return vids[0].url;
    });
  };
`;

export const SAVE_VISIBLE_JS = 'window.__pinvaultSaveVisible && window.__pinvaultSaveVisible(); true;';
export const COLLECT_ALL_JS = 'window.__pinvaultCollect && window.__pinvaultCollect(); true;';
export const STOP_COLLECT_JS = 'window.__pinvaultStop = true; true;';
