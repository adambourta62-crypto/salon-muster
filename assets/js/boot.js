/* boot.js – läuft synchron im <head>, bevor die Seite zum ersten Mal gezeichnet wird.
   1. markiert, dass JavaScript läuft (.js) und ob Bewegung erwünscht ist (.motion)
   2. Schrift-Tor: höchstens 1 s auf die Hauptschriften warten, dann zeigen –
      verspätete Schriften werden für diesen Besuch nicht mehr eingesetzt (CLS 0)
   3. lädt GSAP + motion.js nur, wenn keine reduzierte Bewegung eingestellt ist
   4. Sicherheitsnetz: startet die Eröffnung nicht rechtzeitig, wird der Hero sofort gezeigt
   Rechtstexte binden das Skript mit data-static ein: nur Schrift-Tor, sonst nichts. */
(function () {
  "use strict";
  var root = document.documentElement;
  var me = document.currentScript;
  var base = me ? me.src.replace(/assets\/js\/boot\.js(?:\?.*)?$/, "") : "";
  var isStatic = !!(me && me.hasAttribute("data-static"));
  var reduce = !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var motion = !reduce && !isStatic;

  if (!isStatic) {
    root.classList.remove("no-js");
    root.classList.add("js");
  }
  if (motion) root.classList.add("motion", "intro-pending"); // .intro-pending: Hero wartet auf die Eröffnung

  /* --- 2  Schrift-Tor ---------------------------------------------------- */
  // Das Stylesheet steht vor diesem Skript und ist beim Ausführen bereits geladen,
  // die @font-face-Regeln sind also bekannt. Unter file:// (Doppelklick) entfällt das
  // Tor: lokale Dateien sind sofort da, und Safari würde dort CORS-Fehler melden.
  var gateOpen = false;
  function openGate(webfonts) {
    if (gateOpen) return;
    gateOpen = true;
    if (!webfonts) root.classList.add("fonts-fallback");
    root.classList.remove("fonts-pending");
    window.__salonFonts = webfonts ? "web" : "fallback";
    // Schriften zu spät = langsames Netz: dann ohne Eröffnung, Inhalt sofort zeigen
    if (motion && !webfonts) root.classList.remove("intro-pending");
    else if (motion) armIntroFailsafe();
    try { document.dispatchEvent(new CustomEvent("salon:fonts")); } catch (e) { /* sehr alte Browser */ }
  }
  if (/^https?:$/.test(location.protocol) && document.fonts && document.fonts.load && window.Promise) {
    root.classList.add("fonts-pending");
    Promise.all([
      '400 1em "Bodoni Moda"',
      'italic 400 1em "Bodoni Moda"',
      '400 1em "Linie Sans"'
    ].map(function (f) { return document.fonts.load(f); })).then(function (lists) {
      openGate(lists.every(function (l) { return l && l.length; }));
    }, function () { openGate(false); });
    window.setTimeout(function () { openGate(false); }, 1000);
  } else {
    openGate(true);
  }

  /* --- 3  Bewegung nur auf Wunsch ---------------------------------------- */
  if (!motion) return;
  [
    "assets/vendor/gsap/gsap.min.js",
    "assets/vendor/gsap/ScrollTrigger.min.js",
    "assets/js/motion.js"
  ].forEach(function (src) {
    var s = document.createElement("script");
    s.src = base + src;
    s.async = false; // Reihenfolge der Ausführung beibehalten
    s.onerror = release;
    document.head.appendChild(s);
  });

  function release() {
    root.classList.remove("motion", "intro-pending");
    root.classList.add("motion-off");
  }
  /* --- 4  Sicherheitsnetz --------------------------------------------------
     Langsames Netz: Beginnt die Eröffnung nicht binnen 1,5 s nach dem Schrift-Tor,
     wird der Hero sofort gezeigt. Die Scroll-Bewegungen starten trotzdem, sobald
     GSAP da ist – nur ohne Eröffnung. */
  function armIntroFailsafe() {
    window.setTimeout(function () {
      if (!window.__salonMotion) root.classList.remove("intro-pending");
    }, 1500);
  }
})();
