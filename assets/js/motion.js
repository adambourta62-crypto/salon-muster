/* motion.js – Bewegung mit GSAP. Wird von boot.js nur geladen, wenn keine
   reduzierte Bewegung eingestellt ist; schaltet sich zusätzlich ab, falls die
   Einstellung während des Besuchs geändert wird (gsap.matchMedia).

   1  Eröffnung: Die Haarsträhne zeichnet sich, der Name erscheint Buchstabe für Buchstabe
   2  Überschriften wie mit dem Stift gezogen
   3  Abschnitte blenden ein (ScrollTrigger.batch), Leistungsblöcke ziehen ihre Linie nach
   4  Die durchgehende Linie folgt dem Lesen – ein „Stift“ auf 62 % Bildschirmhöhe
   5  Sicherheitsnetze: nichts bleibt nach Sprüngen, Zurück-Navigation oder
      Höhenänderungen unsichtbar hängen */
(function () {
  "use strict";
  var root = document.documentElement;

  function release() {
    root.classList.remove("motion", "intro-pending");
    root.classList.add("motion-off");
  }

  // Start erst, wenn site.js bereit ist UND das Schrift-Tor offen ist –
  // sonst liefe die Eröffnung unsichtbar ab
  function whenReady(fn) {
    var go = function () {
      if (root.classList.contains("fonts-pending")) {
        document.addEventListener("salon:fonts", go, { once: true });
        return;
      }
      if (window.Salon && window.Salon.ready) fn();
      else document.addEventListener("salon:ready", fn, { once: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
    else go();
  }

  whenReady(function () {
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    // Sicherheitsnetz aus boot.js hat schon gegriffen, oder GSAP fehlt → statisch bleiben
    if (!root.classList.contains("motion") || !gsap || !ScrollTrigger) { release(); return; }
    window.__salonMotion = true;

    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: "power3.out", duration: 0.9 });

    var active = null;
    var introDone = false;
    var mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", function () {
      // Hat boot.js den Hero wegen langsamen Netzes schon freigegeben, keine Eröffnung mehr
      var skip = introDone || !root.classList.contains("intro-pending");
      try {
        active = setup(gsap, ScrollTrigger, skip, function () { introDone = true; });
      } catch (err) {
        active = null;
        release();
        return;
      }
      return function () {
        if (active) active.teardown();
        active = null;
        release();
      };
    });
    // Zweiter Durchlauf (Bewegung wieder erlaubt): Eröffnung nicht wiederholen
    mm.add("(prefers-reduced-motion: reduce)", function () { introDone = true; });

    window.Salon.onLayout(function () { if (active) active.onLayout(); });
  });

  /* ======================================================================= */
  function setup(gsap, ScrollTrigger, skipIntro, markIntro) {
    root.classList.add("motion");
    root.classList.remove("motion-off");

    var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
    var cleanups = [];
    var classes = [];
    var overlay = document.querySelector("[data-thread-overlay]");

    /* --- Linien zeichnen über stroke-dashoffset ------------------------------
       Alle Linien nutzen vector-effect: non-scaling-stroke (gleiche Strichstärke
       bei jeder Größe). Browser legen das Strichmuster dann im Bildschirmraum an –
       also messen wir die Länge genau dort. Alle Pfade dieser Seite bestehen nur aus
       M/C-Befehlen: Kontrollpunkte mit der Bildschirmmatrix umrechnen (affin, die
       Kurvenform bleibt erhalten) und jede Kurve in kurze Sehnen zerlegen. Das ist
       exakt auch bei ungleichmäßiger Skalierung – dort misst DrawSVG falsch – und
       dauert Mikrosekunden statt der vielen getPointAtLength()-Aufrufe. */
    function parseD(d) {
      var tok = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
      var segs = [], i = 0, cmd = "", x = 0, y = 0;
      while (i < tok.length) {
        if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; continue; }
        if (cmd === "M") { x = +tok[i]; y = +tok[i + 1]; i += 2; cmd = "L"; }
        else if (cmd === "C") {
          segs.push([x, y, +tok[i], +tok[i + 1], +tok[i + 2], +tok[i + 3], +tok[i + 4], +tok[i + 5]]);
          x = +tok[i + 4]; y = +tok[i + 5]; i += 6;
        } else if (cmd === "L") {
          var nx = +tok[i], ny = +tok[i + 1];
          segs.push([x, y, x + (nx - x) / 3, y + (ny - y) / 3, x + 2 * (nx - x) / 3, y + 2 * (ny - y) / 3, nx, ny]);
          x = nx; y = ny; i += 2;
        } else i++;
      }
      return segs;
    }
    // Länge im Bildschirmraum + (für die Linie) kumulierte Länge und höchstes y je Stützpunkt
    function measure(path, offY) {
      var m = path.getScreenCTM();
      var segs = parseD(path.getAttribute("d"));
      var K = 10, cap = segs.length * K + 1;
      var ls = new Float32Array(cap), ys = new Float32Array(cap);
      var len = 0, maxY = -Infinity, px = 0, py = 0, idx = 0;
      segs.forEach(function (s, si) {
        var P = [];
        for (var j = 0; j < 8; j += 2) P.push(m.a * s[j] + m.c * s[j + 1] + m.e, m.b * s[j] + m.d * s[j + 1] + m.f);
        for (var k = si ? 1 : 0; k <= K; k++) {
          var t = k / K, u = 1 - t;
          var b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
          var x = b0 * P[0] + b1 * P[2] + b2 * P[4] + b3 * P[6];
          var y = b0 * P[1] + b1 * P[3] + b2 * P[5] + b3 * P[7];
          if (idx) len += Math.hypot(x - px, y - py);
          px = x; py = y;
          if (y - (offY || 0) > maxY) maxY = y - (offY || 0);
          ls[idx] = len; ys[idx] = maxY; idx++;
        }
      });
      return { len: len * 1.003 + 2, raw: len, ls: ls.subarray(0, idx), ys: ys.subarray(0, idx) };
    }
    function screenLength(path) { return measure(path).len; }
    function setDashed(path, f, len) {
      // bei 0 ganz ausblenden – sonst malt ein runder Linienabschluss einen Punkt
      path.style.visibility = f <= 0.0005 ? "hidden" : "";
      path.style.strokeDasharray = len + " " + (len + 2);
      path.style.strokeDashoffset = String(len * (1 - Math.min(1, f)));
    }
    function clearDashed(path) {
      path.style.visibility = "";
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
    }
    function hideStroke(path) { setDashed(path, 0, screenLength(path)); }
    function drawIn(path, vars) {
      var len = screenLength(path), o = { f: 0 };
      var done = vars.onComplete;
      return gsap.to(o, Object.assign({}, vars, {
        f: 1,
        onUpdate: function () { setDashed(path, o.f, len); },
        // fertig gezeichnet → Strichmuster entfernen, damit spätere Größenänderungen nichts abschneiden
        onComplete: function () { clearDashed(path); if (done) done(); }
      }));
    }

    /* --- 1  Eröffnung -------------------------------------------------------- */
    var hero = document.querySelector(".hero");
    var heroSvg = hero.querySelector(".hero__motif");
    var heroPath = heroSvg.querySelector(".motif__path");
    var chars = $$(".ch", hero);
    var intros = ["eyebrow", "claim", "lead", "actions", "status"].map(function (k) { return hero.querySelector('[data-intro="' + k + '"]'); });
    var intro;

    if (skipIntro) {
      root.classList.remove("intro-pending");
      markIntro();
    } else {
      hideStroke(heroPath);
      gsap.set(heroSvg, { visibility: "visible" });
      // Die Linie zeichnet sich einmal ganz; währenddessen erscheint der Name Buchstabe
      // für Buchstabe, danach Unterzeile und Handlungsaufforderungen.
      intro = gsap.timeline({ delay: 0.1, onComplete: markIntro });
      intro
        .add(drawIn(heroPath, { duration: 2.8, ease: "power1.inOut" }), 0)
        .fromTo(intros[0], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 }, 0.1)
        .fromTo(chars, { opacity: 0, y: "0.18em" }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.065, ease: "power2.out" }, 0.2)
        .fromTo(intros[1], { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, 1.15)
        .fromTo(intros[2], { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, 1.3)
        .fromTo(intros[3], { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, 1.45)
        .fromTo(intros[4], { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.8);
      // Anfangswerte stehen jetzt inline – die CSS-Vorbereitung kann weg, ohne Aufblitzen
      root.classList.remove("intro-pending");
      // Fokus per Tastatur während der Eröffnung: sofort alles zeigen
      var skip = function (e) { if (hero.contains(e.target) && intro.isActive()) intro.progress(1); };
      document.addEventListener("focusin", skip);
      cleanups.push(function () { document.removeEventListener("focusin", skip); });
    }

    /* --- 2  Überschriften wie mit dem Stift gezogen ------------------------- */
    var titles = $$("[data-title]").map(function (title) {
      var stroke = title.parentNode.querySelector(".title-stroke path");
      title.classList.add("is-wiping");
      classes.push([title, "is-wiping"]);
      gsap.set(title, { "--wipe": "-16%" });
      if (stroke) hideStroke(stroke);
      return { el: title, stroke: stroke, shown: false };
    });
    function showTitle(t, instant) {
      if (t.shown) return;
      t.shown = true;
      var done = function () { t.el.classList.remove("is-wiping"); gsap.set(t.el, { clearProps: "--wipe" }); };
      if (instant) {
        done();
        if (t.stroke) clearDashed(t.stroke);
        return;
      }
      gsap.to(t.el, { "--wipe": "100%", duration: 1.1, ease: "power2.inOut", onComplete: done });
      if (t.stroke) drawIn(t.stroke, { duration: 0.9, delay: 0.55, ease: "power2.inOut" });
    }

    /* --- 3  Einblenden & Leistungsblöcke ----------------------------------- */
    var reveals = $$("[data-reveal]").map(function (n) { return { el: n, shown: false }; });
    reveals.forEach(function (r) { gsap.set(r.el, { opacity: 0, y: 28 }); });
    function showReveal(r, instant, index) {
      if (r.shown) return;
      r.shown = true;
      var ring = r.el.querySelector(".stylist__ring path");
      if (instant) {
        gsap.set(r.el, { opacity: 1, y: 0, clearProps: "transform" });
        if (ring) clearDashed(ring);
        return;
      }
      gsap.to(r.el, { opacity: 1, y: 0, duration: 1, delay: (index || 0) * 0.12, clearProps: "transform" });
      if (ring) drawIn(ring, { duration: 1.4, delay: 0.25 + (index || 0) * 0.12, ease: "power2.inOut" });
    }
    reveals.forEach(function (r) {
      var ring = r.el.querySelector(".stylist__ring path");
      if (ring) hideStroke(ring);
    });

    var blocks = $$("[data-block]").map(function (block) {
      var rule = block.querySelector(".menu-group__rule path");
      var items = $$(".menu-item", block);
      var leaders = $$(".menu-item__leader", block);
      if (rule) hideStroke(rule);
      gsap.set(items, { opacity: 0, y: 12 });
      gsap.set(leaders, { scaleX: 0 });
      return { el: block, rule: rule, items: items, leaders: leaders, shown: false };
    });
    function showBlock(b, instant, index) {
      if (b.shown) return;
      b.shown = true;
      if (instant) {
        gsap.set(b.items, { opacity: 1, y: 0, clearProps: "transform" });
        gsap.set(b.leaders, { scaleX: 1, clearProps: "transform" });
        if (b.rule) clearDashed(b.rule);
        return;
      }
      var tl = gsap.timeline({ delay: (index || 0) * 0.15 });
      if (b.rule) tl.add(drawIn(b.rule, { duration: 1, ease: "power2.inOut" }), 0);
      tl.to(b.items, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, clearProps: "transform" }, 0.25)
        .to(b.leaders, { scaleX: 1, duration: 0.8, stagger: 0.08, ease: "power2.inOut", clearProps: "transform" }, 0.35);
    }

    // ScrollTrigger.batch: Einblenden beim Eintreten; wer übersprungen wurde (Sprung,
    // schnelles Scrollen), wird sofort sichtbar – nie wieder versteckt.
    function batch(list, show, start) {
      var els = list.map(function (x) { return x.el; });
      var find = function (el) { for (var i = 0; i < list.length; i++) if (list[i].el === el) return list[i]; return null; };
      // Stiländerungen erst im nächsten Frame – nicht mitten im Scroll-Ereignis
      // (sonst warnt Firefox vor „scroll-linked positioning“ und das Scrollen ruckelt)
      var later = function (fn) { return function (targets) { window.requestAnimationFrame(function () { fn(targets); }); }; };
      return ScrollTrigger.batch(els, {
        start: start,
        onEnter: later(function (targets) { targets.forEach(function (t, i) { show(find(t), false, i); }); }),
        onEnterBack: later(function (targets) { targets.forEach(function (t) { show(find(t), true); }); }),
        onLeave: later(function (targets) { targets.forEach(function (t) { show(find(t), true); }); })
      });
    }
    var triggers = [].concat(
      batch(titles, showTitle, "top 88%"),
      batch(reveals, showReveal, "top 90%"),
      batch(blocks, showBlock, "top 86%")
    );

    // Sicherheitsnetz: Alles oberhalb der Unterkante des Bildschirms muss sichtbar sein.
    // Läuft gebündelt im nächsten Frame (siehe oben: nie direkt im Scroll-Ereignis).
    var sweepQueued = false;
    function sweep() {
      if (sweepQueued) return;
      sweepQueued = true;
      window.requestAnimationFrame(function () { sweepQueued = false; sweepNow(); });
    }
    function sweepNow() {
      var vh = window.innerHeight;
      [[titles, showTitle], [reveals, showReveal], [blocks, showBlock]].forEach(function (pair) {
        pair[0].forEach(function (x) {
          if (x.shown) return;
          var r = x.el.getBoundingClientRect();
          if (r.top < vh) pair[1](x, r.bottom < 0 || r.top < vh * 0.5);
        });
      });
    }
    // Tastaturfokus in noch unsichtbarem Inhalt → sofort zeigen
    function onFocus(e) {
      [[titles, showTitle], [reveals, showReveal], [blocks, showBlock]].forEach(function (pair) {
        pair[0].forEach(function (x) { if (!x.shown && x.el.contains(e.target)) pair[1](x, true); });
      });
    }
    document.addEventListener("focusin", onFocus);
    cleanups.push(function () { document.removeEventListener("focusin", onFocus); });

    /* --- 4  Die durchgehende Linie ----------------------------------------- */
    var pen = { y: 0 };
    var lookups = [];
    var ovTop = 0;

    function buildLookups() {
      var pieces = (window.Salon.thread.pieces || []).filter(function (p) { return !p.intro; });
      var ov = overlay.getBoundingClientRect();
      ovTop = ov.top + window.scrollY;
      lookups = pieces.map(function (p) {
        var m = measure(p.el, ov.top);
        return { el: p.el, ys: m.ys, ls: m.ls, raw: m.raw, len: m.len, cur: -1 };
      });
    }
    // Welcher Anteil einer Linie liegt oberhalb der Stifthöhe y?
    function fracAt(lk, y) {
      var ys = lk.ys, ls = lk.ls, n = ys.length - 1;
      if (n < 1 || y <= ys[0]) return 0;
      if (y >= ys[n]) return 1;
      var lo = 0, hi = n;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ys[mid] <= y) lo = mid; else hi = mid; }
      var span = ys[hi] - ys[lo];
      var l = ls[lo] + (span > 0 ? (y - ys[lo]) / span : 0) * (ls[hi] - ls[lo]);
      return lk.raw > 0 ? l / lk.raw : 1;
    }
    function targetPen() {
      var vh = window.innerHeight, sy = window.scrollY;
      var max = Math.max(0, document.documentElement.scrollHeight - vh);
      var remain = max - sy;
      var boost = remain < vh * 0.5 ? (1 - remain / (vh * 0.5)) * vh * 0.5 : 0;
      return sy + vh * 0.62 + boost - ovTop;
    }
    function renderPen() {
      for (var i = 0; i < lookups.length; i++) {
        var lk = lookups[i];
        var f = fracAt(lk, pen.y);
        if (Math.abs(f - lk.cur) < 0.0004) continue;
        lk.cur = f;
        if (f >= 0.9995) clearDashed(lk.el); // ganz gezeichnet: ohne Strichmuster
        else setDashed(lk.el, f, lk.len);
      }
    }
    var penTo = gsap.quickTo(pen, "y", { duration: 0.7, ease: "power3.out", onUpdate: renderPen });

    buildLookups();
    pen.y = targetPen();
    renderPen();

    // Während des Scrollens gedrosselt prüfen – und immer ein letztes Mal, wenn das
    // Scrollen endet. Sonst könnte die Endposition eines Sprungs ungeprüft bleiben.
    var lastSweep = 0, trailingSweep = 0;
    var scrollTrigger = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: function () {
        penTo(targetPen());
        var t = Date.now();
        if (t - lastSweep > 200) { lastSweep = t; sweep(); }
        window.clearTimeout(trailingSweep);
        trailingSweep = window.setTimeout(sweep, 160);
      }
    });
    triggers.push(scrollTrigger);
    var onScrollEnd = function () { sweep(); };
    window.addEventListener("scrollend", onScrollEnd);
    cleanups.push(function () { window.removeEventListener("scrollend", onScrollEnd); window.clearTimeout(trailingSweep); });

    /* --- 5  Neu messen bei jeder Höhenänderung ----------------------------- */
    // ScrollTrigger.refresh() setzt die Scrollposition kurz zurück und würde einen
    // laufenden (weichen) Anker-Scroll abbrechen – daher erst messen, wenn Ruhe ist.
    var refreshTimer = 0, lastScroll = 0;
    var onAnyScroll = function () { lastScroll = Date.now(); };
    window.addEventListener("scroll", onAnyScroll, { passive: true });
    cleanups.push(function () { window.removeEventListener("scroll", onAnyScroll); });
    function refreshWhenIdle() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(function () {
        if (Date.now() - lastScroll < 180) { refreshWhenIdle(); return; }
        ScrollTrigger.refresh();
        sweep();
      }, 140);
    }
    function onLayout() {
      buildLookups();
      var t = targetPen();
      pen.y = t;
      penTo(t, t); // springen statt nachgleiten – die Geometrie hat sich geändert
      renderPen();
      refreshWhenIdle();
    }
    var onRefresh = function () { sweep(); };
    ScrollTrigger.addEventListener("refresh", onRefresh);
    var onPageShow = function () { onLayout(); sweep(); };
    var onHash = function () { window.setTimeout(sweep, 60); window.setTimeout(sweep, 700); };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("hashchange", onHash);
    cleanups.push(function () {
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("hashchange", onHash);
      window.clearTimeout(refreshTimer);
    });
    // Anfangszustand: was bereits im Bild ist, sofort einsortieren
    sweepNow();

    return {
      onLayout: onLayout,
      teardown: function () {
        cleanups.forEach(function (fn) { fn(); });
        triggers.forEach(function (t) { if (t && t.kill) t.kill(); });
        if (intro) intro.kill();
        // Alles, was je angefasst wurde, auf den ruhenden Endzustand zurücksetzen
        var touched = [heroSvg, heroPath].concat(chars, intros);
        titles.forEach(function (x) { touched.push(x.el); if (x.stroke) touched.push(x.stroke); });
        reveals.forEach(function (x) { touched.push(x.el); var ring = x.el.querySelector(".stylist__ring path"); if (ring) touched.push(ring); });
        blocks.forEach(function (x) { touched = touched.concat(x.items, x.leaders); if (x.rule) touched.push(x.rule); });
        lookups.forEach(function (lk) { touched.push(lk.el); });
        touched = touched.filter(Boolean);
        gsap.killTweensOf(touched);
        gsap.set(touched, { clearProps: "all" });
        classes.forEach(function (c) { c[0].classList.remove(c[1]); });
        titles.concat(reveals, blocks).forEach(function (x) { x.shown = true; });
      }
    };
  }
})();
