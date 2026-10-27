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

// Instagram: lets the ⬇ button on reels and videos find the actual video file.
export const INSTAGRAM_JS = String.raw`
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
