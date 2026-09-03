/* Sturdy Vanilla, one page. Page-local behaviour only:
   1. pick clip variants for the colour scheme and the viewport, before the engine mounts
   2. mount the engine
   3. the vine (the signature move): one stroke drawn by scroll, a node per chapter, real links
   4. one-shot videos in the media columns (play once at half visibility, hold the last frame)
   5. the small print dialog (privacy and terms fetched from their real pages)
   The engine (scrollcraft.js) is never edited. */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dark   = matchMedia('(prefers-color-scheme: dark)').matches;
  var small  = matchMedia('(max-width: 860px)').matches;
  var vineOff = /[?&]vine=off\b/.test(location.search);

  /* ---- 1. clip variants. Chapters three and five sit on ground B, which is ink in
     light mode and cream in dark mode; the clips were rendered on both grounds. ---- */
  var variant = dark ? 'cream' : 'ink';

  var peakVideo = document.querySelector('#ch-school video[data-sc-scrub]');
  var peakPoster = document.querySelector('#ch-school .peak__poster');
  if (peakVideo) {
    peakVideo.setAttribute('data-sc-src', 'assets/video/ch6-school-' + variant + '.mp4');
    peakVideo.setAttribute('data-sc-src-mobile', 'assets/video/ch6-school-' + variant + '-p.mp4');
    if (peakPoster) peakPoster.src = 'assets/img/ch6-school-' + variant + (small ? '-p' : '') + (reduce ? '-end' : '-poster') + '.jpg';
  }
  if (small) {
    /* on a phone the peak copy sits in the top half and the lines window instead of stacking */
    ['data-sc-cue', 'data-sc-count-at'].forEach(function (attr) {
      Array.prototype.forEach.call(document.querySelectorAll('#ch-school [' + attr + '-m]'), function (el) {
        el.setAttribute(attr, el.getAttribute(attr + '-m'));
      });
    });
  }

  var oneshots = Array.prototype.slice.call(document.querySelectorAll('video.oneshot'));
  oneshots.forEach(function (v) {
    var name = v.getAttribute('data-clip') + (v.hasAttribute('data-variant') ? '-' + variant : '');
    v.setAttribute('poster', 'assets/img/' + name + (reduce ? '-end' : '-poster') + '.jpg');
    if (reduce) return;                                  /* the settled frame stands */
    /* the file is only requested when the clip is about to play, so nothing is fetched and abandoned */
    v.setAttribute('data-src', 'assets/video/' + name + (small && v.hasAttribute('data-mobile') ? '-m' : '') + '.mp4');
  });

  /* ---- 2. the engine ---- */
  if (window.ScrollCraft) ScrollCraft.mount(document.body);

  /* ---- 4. one-shot videos ---- */
  if (!reduce && 'IntersectionObserver' in window) {
    var played = new WeakSet();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || played.has(e.target)) return;
        played.add(e.target);
        if (!e.target.src && e.target.getAttribute('data-src')) e.target.src = e.target.getAttribute('data-src');
        var p = e.target.play();
        if (p && p.catch) p.catch(function () {});
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    oneshots.forEach(function (v) { io.observe(v); });
  }

  /* ---- 3. the vine ---- */
  var nav = document.querySelector('.vine');
  if (nav) buildVine(nav);

  function buildVine(nav) {
    var svg = nav.querySelector('.vine__svg');
    var stem = nav.querySelector('.vine__stem');
    var leavesG = nav.querySelector('.vine__leaves');
    var nodes = Array.prototype.slice.call(nav.querySelectorAll('.vine__node'));
    var peakSection = document.getElementById('ch-school');
    var holdIds = { 'ch-silence': true, 'ch-shop': true };
    var W = 88;
    var H = 0, L = 0, pts = [], leaves = [], nodeY = [], dirty = true, raf = 0, lastState = '';

    function docHeight() { return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight); }
    function vh() { return Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 1); }

    function layout() {
      var narrow = matchMedia('(max-width: 860px)').matches;   /* same query as the stylesheet */
      W = narrow ? 24 : 88;
      H = docHeight();
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.style.width = W + 'px';
      svg.style.height = H + 'px';
      nav.style.height = H + 'px';
      nav.style.width = W + 'px';

      /* the stem: one gentle wave down the gutter */
      var cx = W / 2, amp = narrow ? 4 : 13, seg = 640, d = 'M' + cx + ' 0', y = 0, side = 1;
      while (y < H) {
        var y2 = Math.min(y + seg, H);
        d += ' C ' + (cx + side * amp) + ' ' + (y + seg * 0.35) + ', ' + (cx + side * amp) + ' ' + (y2 - seg * 0.35) + ', ' + cx + ' ' + y2;
        y = y2; side = -side;
      }
      stem.setAttribute('d', d);
      L = stem.getTotalLength();

      /* sample the stem so leaves and nodes can sit on it */
      pts = [];
      var step = 6;
      for (var s = 0; s <= L; s += step) { var pt = stem.getPointAtLength(s); pts.push({ s: s, x: pt.x, y: pt.y }); }
      pts.push({ s: L, x: cx, y: H });

      /* leaves every 320px, alternating sides, skipping the node positions */
      leavesG.textContent = '';
      leaves = [];
      var leafD = narrow ? 'M0 0C-3 -2 -6 -7 -1 -11C3 -7 2 -3 0 0Z' : 'M0 0C-6 -4 -12 -14 -2 -22C6 -14 4 -6 0 0Z';
      var flip = 1;
      for (var ly = 240; ly < H - 240; ly += 320) {
        var p = nearest(ly);
        var leaf = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        leaf.setAttribute('d', leafD);
        leaf.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + (flip > 0 ? -58 : 58) + ')' + (flip > 0 ? '' : ' scale(-1 1)'));
        leavesG.appendChild(leaf);
        leaves.push({ el: leaf, s: p.s });
        flip = -flip;
      }

      /* nodes: one per chapter, at the chapter's document position, on the stem */
      nodeY = nodes.map(function (a) {
        var target = document.querySelector(a.getAttribute('data-target'));
        if (!target) return 0;
        var r = target.getBoundingClientRect();
        var top = r.top + window.pageYOffset;
        var place = a.getAttribute('data-place');
        var yy;
        if (place === 'title') yy = Math.min(vh() * 0.5, r.height * 0.5);
        else if (place === 'peak') yy = top + vh() * 0.5;
        else if (place === 'pod') yy = top + r.height * 0.5;
        else yy = top + Math.min(vh() * 0.22, 140);
        yy = Math.max(24, Math.min(H - 24, yy));
        var p = nearest(yy);
        a.style.top = p.y.toFixed(1) + 'px';
        a.style.left = p.x.toFixed(1) + 'px';
        return { y: yy, s: p.s };
      });
      dirty = true;
    }

    function nearest(y) {
      /* pts are monotonic in y; binary search */
      var lo = 0, hi = pts.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (pts[mid].y < y) lo = mid + 1; else hi = mid; }
      return pts[lo];
    }

    function tick() {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      var y = window.pageYOffset, v = vh();
      /* the tip sits ~60% down the viewport and reaches the foot of the page exactly at the bottom */
      var f = reduce ? 1 : Math.max(0, Math.min(1, (y + v * 0.6) / Math.max(1, H - v * 0.4)));
      var drawn = f * L;
      stem.style.strokeDashoffset = (1000 - f * 1000).toFixed(2);

      var leavesOpen = 0;
      for (var i = 0; i < leaves.length; i++) {
        var open = leaves[i].s <= drawn;
        if (open) leavesOpen++;
        leaves[i].el.classList.toggle('is-open', open);
      }

      var current = -1;
      for (var n = 0; n < nodes.length; n++) {
        var open2 = reduce || nodeY[n].s <= drawn;
        nodes[n].classList.toggle('is-open', open2);
        if (open2) current = n;
      }
      nodes.forEach(function (a, idx) {
        if (idx === current) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      });

      /* the peak flower blooms across the scrub, not on a threshold */
      if (peakSection) {
        var p = parseFloat(peakSection.style.getPropertyValue('--sc-p')) || 0;
        var bloom = reduce ? 1 : 0.35 + 0.65 * Math.min(1, p / 0.6);
        nav.style.setProperty('--bloom', bloom.toFixed(3));
      }

      /* the label ink follows the ground the node sits over */
      var overInk = currentGroundIsB(y + v * 0.5);
      nav.style.setProperty('--vine-ink', overInk ? '#FFFFFF' : '#000000');
      nav.style.setProperty('--vine-w', overInk ? '500' : '600');   /* reversed out on ink, 500 */

      if (!vineOff) {
        /* what actually paints, quantised: current chapter and how many leaves are open */
        var state = 'vine:c' + current + ':l' + leavesOpen;
        if (state !== lastState) { nav.setAttribute('data-sc-verify-state', state); lastState = state; }
        /* an authored hold is a property of the section under the reader, not of the last node passed */
        var under = sectionAt(y + v * 0.5);
        if (under && holdIds[under.id]) nav.setAttribute('data-sc-verify-hold', 'true'); else nav.removeAttribute('data-sc-verify-hold');
      }
    }

    var grounds = null;
    function sectionAt(docY) {
      if (!grounds) grounds = Array.prototype.slice.call(document.querySelectorAll('main > .act'));
      for (var i = 0; i < grounds.length; i++) {
        var top = grounds[i].offsetTop, h = grounds[i].offsetHeight;
        if (docY >= top && docY < top + h) return grounds[i];
      }
      return null;
    }
    function currentGroundIsB(docY) {
      var s = sectionAt(docY);
      var isB = !!(s && s.classList.contains('g-b'));
      /* in dark mode the grounds swap, so ground B is light */
      return dark ? !isB : isB;
    }

    function request() { dirty = true; if (!raf) raf = requestAnimationFrame(tick); }

    var relayoutTimer = 0;
    function relayout() {
      clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(function () { layout(); request(); }, 80);
    }

    layout(); request();
    if (!reduce) window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', relayout);
    window.addEventListener('load', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    if ('ResizeObserver' in window) {
      var lastH = 0;
      new ResizeObserver(function () { var h = docHeight(); if (Math.abs(h - lastH) > 2) { lastH = h; relayout(); } }).observe(document.body);
    }
  }

  /* ---- 5. the small print ---- */
  var dlg = document.getElementById('legal');
  var doc = document.getElementById('legal-doc');
  if (dlg && doc && typeof dlg.showModal === 'function') {
    var cache = {};
    var lastTrigger = null;

    function load(which) {
      var url = which + '.html';
      if (cache[url]) return Promise.resolve(cache[url]);
      return fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function (html) {
        var d = new DOMParser().parseFromString(html, 'text/html');
        var main = d.querySelector('#doc') || d.querySelector('main') || d.body;
        cache[url] = main.innerHTML;
        return cache[url];
      });
    }

    function open(which, trigger) {
      lastTrigger = trigger || null;
      load(which).then(function (html) {
        doc.innerHTML = html;
        var h1 = doc.querySelector('h1');
        if (h1) h1.id = 'legal-title';
        doc.scrollTop = 0;
        if (!dlg.open) dlg.showModal();
        if (location.hash !== '#' + which) history.replaceState(null, '', '#' + which);
      }).catch(function () { location.href = which + '.html'; });
    }

    Array.prototype.forEach.call(document.querySelectorAll('a[data-legal]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open(a.getAttribute('data-legal'), a);
      });
    });
    dlg.querySelector('.legal__close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      if (/^#(privacy|terms)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    });

    function fromHash() {
      var m = /^#(privacy|terms)$/.exec(location.hash);
      if (m) open(m[1], null); else if (dlg.open) dlg.close();
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }
})();
