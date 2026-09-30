/* site.js – Kernfunktionen ohne Animationsbibliothek.
   Läuft immer (auch bei reduzierter Bewegung). Die Bewegung selbst steckt in motion.js.

   Inhalt
   1  Hilfsfunktionen
   2  Navigation (mobiles Menü mit Fokusfalle und Fokus-Rückgabe)
   3  Öffnungszeiten mit Live-Status (immer Europe/Berlin, NRW-Feiertage, Betriebsferien)
   4  Wunschtermin-Planer (nur lokal, localStorage)
   5  Die durchgehende Linie: Verbindungen zwischen den Motiven berechnen
   6  Start und Schnittstelle für motion.js */
(function () {
  "use strict";

  /* ---------------------------------------------------------------------- */
  /* 1  Hilfsfunktionen                                                      */
  /* ---------------------------------------------------------------------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function formatEuro(cents) { return euro.format(cents / 100); }
  function formatEuroShort(cents) { return cents % 100 === 0 ? (cents / 100) + " €" : formatEuro(cents); }
  function joinOr(list) {
    if (list.length < 2) return list.join("");
    return list.slice(0, -1).join(", ") + " oder " + list[list.length - 1];
  }
  var layoutListeners = [];
  function onLayout(fn) { layoutListeners.push(fn); }

  /* ---------------------------------------------------------------------- */
  /* 2  Navigation                                                           */
  /* ---------------------------------------------------------------------- */
  function initNav() {
    var toggle = $("[data-nav-toggle]");
    var nav = $("[data-nav]");
    var label = $("[data-nav-label]");
    if (!toggle || !nav) return;
    var mq = window.matchMedia("(max-width: 899px)");
    var main = $("main");
    var footer = $(".site-footer");
    var skip = $(".skip-link");
    var wordmark = $(".site-header .wordmark");
    var open = false;

    toggle.hidden = false;
    nav.classList.add("site-nav--menu");

    function focusables() { return [wordmark, toggle].concat($$("a", nav)); }

    function setOpen(next, opts) {
      opts = opts || {};
      open = next;
      toggle.setAttribute("aria-expanded", String(next));
      toggle.setAttribute("aria-label", next ? "Menü schließen" : "Menü öffnen");
      setText(label, next ? "Schließen" : "Menü");
      nav.classList.toggle("is-open", next);
      document.documentElement.classList.toggle("nav-open", next);
      [main, footer, skip].forEach(function (n) { if (n) n.inert = next; });
      if (next) {
        var first = $("a", nav);
        if (first) first.focus();
      } else if (opts.returnFocus !== false) {
        toggle.focus();
      }
    }
    toggle.setAttribute("aria-label", "Menü öffnen");

    toggle.addEventListener("click", function () { setOpen(!open); });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      if (e.key === "Tab") {
        var items = focusables();
        var i = items.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    $$("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        if (open) setOpen(false, { returnFocus: false });
        focusTarget(a.getAttribute("href"));
      });
    });
    var onChange = function () { if (!mq.matches && open) setOpen(false, { returnFocus: false }); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else mq.addListener(onChange);
  }

  // Nach einem Sprung per Menü landet der Fokus auf der Abschnittsüberschrift
  function focusTarget(hash) {
    if (!hash || hash.charAt(0) !== "#") return;
    var target = document.getElementById(hash.slice(1));
    if (!target) return;
    var heading = target.matches("[tabindex]") ? target : $("[data-title], h2[tabindex]", target) || target;
    window.requestAnimationFrame(function () { heading.focus({ preventScroll: true }); });
  }

  /* ---------------------------------------------------------------------- */
  /* 3  Öffnungszeiten                                                      */
  /* ---------------------------------------------------------------------- */
  var TZ = "Europe/Berlin";
  var berlinParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });

  // Wanduhrzeit in Berlin – unabhängig von Zeitzone und Uhr-Einstellung des Geräts
  function berlinNow(date) {
    var parts = {};
    berlinParts.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var hour = +parts.hour % 24;
    return { y: +parts.year, m: +parts.month, d: +parts.day, min: hour * 60 + (+parts.minute) };
  }
  // Kalendertage als ganze Zahl (Tage seit 1970) – rechnet ohne lokale Zeitzone
  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
  function fromDayNum(n) {
    var dt = new Date(n * 864e5);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
  }
  function parseISODate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    return m ? dayNum(+m[1], +m[2], +m[3]) : null;
  }
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  // Ostersonntag nach dem anonymen gregorianischen Algorithmus
  function easterSunday(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayNum(y, month, day);
  }
  // Gesetzliche Feiertage in Nordrhein-Westfalen
  var holidayCache = {};
  function holidaysNRW(y) {
    if (holidayCache[y]) return holidayCache[y];
    var e = easterSunday(y), map = {};
    map[dayNum(y, 1, 1)] = "Neujahr";
    map[e - 2] = "Karfreitag";
    map[e + 1] = "Ostermontag";
    map[dayNum(y, 5, 1)] = "Tag der Arbeit";
    map[e + 39] = "Christi Himmelfahrt";
    map[e + 50] = "Pfingstmontag";
    map[e + 60] = "Fronleichnam";
    map[dayNum(y, 10, 3)] = "Tag der Deutschen Einheit";
    map[dayNum(y, 11, 1)] = "Allerheiligen";
    map[dayNum(y, 12, 25)] = "1. Weihnachtstag";
    map[dayNum(y, 12, 26)] = "2. Weihnachtstag";
    holidayCache[y] = map;
    return map;
  }
  function holidayName(n) { return holidaysNRW(fromDayNum(n).y)[n] || null; }

  function formatTime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (m ? h + ":" + (m < 10 ? "0" : "") + m : String(h)) + " Uhr";
  }
  function formatDate(n, withWeekday) {
    var c = fromDayNum(n);
    return (withWeekday ? WEEKDAYS[c.wd] + ", " : "") + c.d + ". " + MONTHS[c.m - 1];
  }

  function readSchedule() {
    var week = {}, labels = {};
    $$("[data-hours] tr[data-weekday]").forEach(function (row) {
      var wd = +row.getAttribute("data-weekday");
      var times = $$("time[datetime]", row).map(function (t) { return parseHM(t.getAttribute("datetime")); });
      var list = [];
      for (var i = 0; i + 1 < times.length; i += 2) {
        if (times[i] != null && times[i + 1] != null && times[i + 1] > times[i]) list.push([times[i], times[i + 1]]);
      }
      week[wd] = list;
      labels[wd] = (row.querySelector("td") || row).textContent.trim();
    });
    var closures = $$("[data-closures] li[data-from][data-to]").map(function (li) {
      return { from: parseISODate(li.getAttribute("data-from")), to: parseISODate(li.getAttribute("data-to")), label: li.textContent.trim() };
    }).filter(function (c) { return c.from != null && c.to != null && c.to >= c.from; });
    return { week: week, labels: labels, closures: closures };
  }

  function dayInfo(schedule, n) {
    var wd = fromDayNum(n).wd;
    var hol = holidayName(n);
    if (hol) return { closed: "holiday", name: hol, intervals: [] };
    for (var i = 0; i < schedule.closures.length; i++) {
      var c = schedule.closures[i];
      if (n >= c.from && n <= c.to) return { closed: "closure", until: c.to, intervals: [] };
    }
    var list = schedule.week[wd] || [];
    if (!list.length) return { closed: "weekly", wd: wd, label: schedule.labels[wd] || "", intervals: [] };
    return { closed: null, intervals: list };
  }

  function computeStatus(schedule, date) {
    var t = berlinNow(date);
    var today = dayNum(t.y, t.m, t.d);
    var info = dayInfo(schedule, today);
    var res = { today: today, now: t.min, todayInfo: info, open: false };

    if (!info.closed) {
      for (var i = 0; i < info.intervals.length; i++) {
        var iv = info.intervals[i];
        if (t.min >= iv[0] && t.min < iv[1]) {
          res.open = true;
          res.until = iv[1];
          res.reopen = info.intervals[i + 1] ? info.intervals[i + 1][0] : null;
          return res;
        }
      }
    }
    for (var off = 0; off < 400; off++) {
      var n = today + off, inf = dayInfo(schedule, n);
      if (inf.closed) continue;
      for (var j = 0; j < inf.intervals.length; j++) {
        if (off > 0 || inf.intervals[j][0] > t.min) {
          res.nextDay = n; res.nextOffset = off; res.nextOpen = inf.intervals[j][0];
          return res;
        }
      }
    }
    return res;
  }

  function describeStatus(schedule, s) {
    var main, detail, reason = "";
    if (s.open) {
      main = "Jetzt geöffnet";
      detail = "bis " + formatTime(s.until) + (s.reopen != null ? ", wieder ab " + formatTime(s.reopen) : "");
    } else {
      main = s.todayInfo.closed ? "Heute geschlossen" : "Jetzt geschlossen";
      if (s.nextDay == null) detail = "Nächste Öffnung steht noch nicht fest";
      else {
        var when = s.nextOffset === 0 ? "heute" : s.nextOffset === 1 ? "morgen"
          : s.nextOffset < 7 ? "am " + WEEKDAYS[fromDayNum(s.nextDay).wd]
          : "am " + formatDate(s.nextDay, true) + ",";
        detail = "öffnet " + when + " um " + formatTime(s.nextOpen);
      }
      var ti = s.todayInfo;
      if (ti.closed === "holiday") reason = "Feiertag: " + ti.name;
      else if (ti.closed === "closure") reason = "Betriebsferien bis " + formatDate(ti.until, false);
      else if (ti.closed === "weekly") reason = WEEKDAYS[ti.wd] + (/ruhetag/i.test(ti.label) ? " ist Ruhetag" : ": geschlossen");
      // Liegt zwischen heute und der nächsten Öffnung ein Feiertag oder Urlaub? Dann nennen.
      if (!reason && s.nextDay != null) {
        for (var n = s.today + 1; n < s.nextDay; n++) {
          var inf = dayInfo(schedule, n);
          if (inf.closed === "holiday") { reason = WEEKDAYS[fromDayNum(n).wd] + " ist Feiertag (" + inf.name + ")"; break; }
          if (inf.closed === "closure") { reason = "Betriebsferien bis " + formatDate(inf.until, false); break; }
        }
      }
    }
    var compact = (s.open ? main : "Geschlossen") + " · " + detail;
    return { main: main, detail: detail, reason: reason, compact: compact };
  }

  // Für Vorführung und Tests: ?zeit=2026-10-03T10:30 simuliert eine Berliner Uhrzeit
  function simulatedNow() {
    var m = /[?&]zeit=(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(location.search);
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    // Berliner Versatz für diesen Moment bestimmen (MEZ/MESZ), dann korrigieren
    for (var k = 0; k < 2; k++) {
      var b = berlinNow(new Date(guess));
      var shown = Date.UTC(b.y, b.m - 1, b.d, Math.floor(b.min / 60), b.min % 60);
      guess += Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - shown;
    }
    return new Date(guess);
  }

  function initHours() {
    var table = $("[data-hours]");
    if (!table) return;
    var schedule = readSchedule();
    var statusBox = $("[data-status]");
    var compact = $("[data-status-compact]");
    var upcomingBox = $("[data-upcoming]");
    var upcomingList = $("[data-upcoming-list]");
    var sim = simulatedNow();
    var simStart = Date.now();
    var lastKey = "";

    function now() { return sim ? new Date(sim.getTime() + (Date.now() - simStart)) : new Date(); }

    function render() {
      var s = computeStatus(schedule, now());
      var d = describeStatus(schedule, s);
      var key = d.main + "|" + d.detail + "|" + d.reason + "|" + s.today;
      if (key === lastKey) return;
      lastKey = key;

      if (statusBox) {
        statusBox.setAttribute("data-open", String(s.open));
        setText($("[data-status-main]", statusBox), d.main);
        setText($("[data-status-detail]", statusBox), d.detail);
        setText($("[data-status-reason]", statusBox), d.reason);
      }
      if (compact) {
        setText(compact, d.compact);
        compact.setAttribute("data-open", String(s.open));
      }

      // Heutigen Wochentag in der Tabelle markieren
      var wd = fromDayNum(s.today).wd;
      $$("tr[data-weekday]", table).forEach(function (row) {
        var isToday = +row.getAttribute("data-weekday") === wd;
        row.classList.toggle("is-today", isToday);
        var badge = $(".today-badge", row);
        var th = row.querySelector("th");
        if (isToday && !badge) {
          th.appendChild(document.createTextNode(" ")); // damit Screenreader „Mittwoch heute“ lesen
          th.appendChild(el("span", { "class": "today-badge", text: "heute" }));
        }
        if (!isToday && badge) {
          if (badge.previousSibling && badge.previousSibling.nodeType === 3) badge.previousSibling.remove();
          badge.remove();
        }
      });

      // Schließtage der nächsten drei Wochen, an denen sonst geöffnet wäre
      if (upcomingList) {
        upcomingList.textContent = "";
        var shownClosure = {};
        for (var n = s.today; n <= s.today + 21; n++) {
          var c = fromDayNum(n);
          if (!(schedule.week[c.wd] || []).length) continue;
          var inf = dayInfo(schedule, n);
          if (inf.closed === "holiday") {
            upcomingList.appendChild(el("li", { text: formatDate(n, true) + " – " + inf.name }));
          } else if (inf.closed === "closure" && !shownClosure[inf.until]) {
            shownClosure[inf.until] = true;
            upcomingList.appendChild(el("li", { text: "Betriebsferien bis " + formatDate(inf.until, true) }));
          }
        }
        upcomingBox.hidden = !upcomingList.children.length;
      }
    }

    render();
    window.setInterval(render, 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); });
    window.addEventListener("pageshow", render);

    // für Tests/Qualitätsprüfung erreichbar
    return { computeStatus: function (date) { return describeStatus(schedule, computeStatus(schedule, date)); }, holidaysNRW: holidaysNRW };
  }

  /* ---------------------------------------------------------------------- */
  /* 4  Wunschtermin-Planer                                                 */
  /* ---------------------------------------------------------------------- */
  var STORE_KEY = "salon-muster/wunschtermin/v1";
  var TIMES = [["", "egal"], ["vormittags", "vormittags"], ["mittags", "mittags"], ["nachmittags", "nachmittags"], ["abends", "abends"]];

  function store(op, value) {
    try {
      if (op === "get") return JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
      if (op === "set") window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
      if (op === "clear") window.localStorage.removeItem(STORE_KEY);
    } catch (e) { /* privater Modus o. Ä. – dann eben ohne Speichern */ }
    return null;
  }

  function initPlanner() {
    var root = $("[data-planner]");
    if (!root) return;

    var services = $$("[data-service]").map(function (li) {
      var group = li.closest(".menu-group");
      return {
        id: li.getAttribute("data-service"),
        name: li.getAttribute("data-name") || $(".menu-item__name", li).textContent.trim(),
        cents: Math.round(parseFloat(li.getAttribute("data-price")) * 100),
        minutes: parseInt(li.getAttribute("data-minutes"), 10) || 0,
        group: group ? $(".menu-group__title", group).textContent.trim() : ""
      };
    });
    var byId = {};
    services.forEach(function (s) { byId[s.id] = s; });

    var openDays = $$("[data-hours] tr[data-weekday]").filter(function (row) {
      return $$("time[datetime]", row).length >= 2;
    }).map(function (row) { return +row.getAttribute("data-weekday"); });

    var stylists = $$("[data-stylist]").map(function (n) { return n.getAttribute("data-stylist"); });
    var salon = document.body.getAttribute("data-salon") || "";
    var phoneLink = $('[data-contact="phone"]');
    var waLink = $('[data-contact="whatsapp"]');
    var mailLink = $('[data-contact="email"]');

    var state = { ids: [], days: [], time: "", stylist: "" };
    var saved = store("get");
    if (saved && typeof saved === "object") {
      state.ids = (saved.ids || []).filter(function (id) { return byId[id]; });
      state.days = (saved.days || []).filter(function (d) { return openDays.indexOf(d) > -1; });
      state.time = TIMES.some(function (t) { return t[0] === saved.time; }) ? saved.time : "";
      state.stylist = stylists.indexOf(saved.stylist) > -1 ? saved.stylist : "";
    }

    /* Aufbau der Auswahl aus der Preiskarte (eine Datenquelle) */
    var servicesBox = $("[data-planner-services]", root);
    var groups = {};
    services.forEach(function (s) {
      if (!groups[s.group]) {
        var gid = "pg-" + Object.keys(groups).length;
        var chips = el("div", { "class": "chips" });
        var wrap = el("div", { "class": "planner__group", role: "group", "aria-labelledby": gid }, [
          el("p", { "class": "planner__group-title", id: gid, text: s.group }), chips
        ]);
        servicesBox.appendChild(wrap);
        groups[s.group] = chips;
      }
      groups[s.group].appendChild(chip("checkbox", "service", s.id, [
        el("span", { "class": "chip__mark", "aria-hidden": "true", html: '<svg viewBox="0 0 12 12" focusable="false"><path d="M2 6.4 4.9 9.2 10.2 3"/></svg>' }),
        el("span", { "class": "chip__name", text: s.name }),
        el("span", { "class": "chip__meta", text: "ca. " + s.minutes + " Min. · " + formatEuro(s.cents) })
      ]));
    });

    var daysBox = $("[data-planner-days]", root);
    openDays.forEach(function (d) {
      daysBox.appendChild(chip("checkbox", "day", String(d), [
        el("span", { "aria-hidden": "true", text: WEEKDAYS_SHORT[d] }),
        el("span", { "class": "visually-hidden", text: WEEKDAYS[d] })
      ]));
    });
    var timesBox = $("[data-planner-times]", root);
    TIMES.forEach(function (t) {
      timesBox.appendChild(chip("radio", "time", t[0], [el("span", { text: t[1] })]));
    });
    var stylistSelect = $("[data-planner-stylist]", root);
    stylists.forEach(function (n) { stylistSelect.appendChild(el("option", { value: n, text: n })); });

    function chip(type, kind, value, body) {
      var input = el("input", { "class": "chip__input", type: type, value: value, "data-kind": kind });
      if (type === "radio") input.name = "pref-time";
      return el("label", { "class": "chip" }, [input, el("span", { "class": "chip__body" }, body)]);
    }

    /* Ansicht */
    var list = $("[data-summary-list]", root);
    var empty = $("[data-summary-empty]", root);
    var minutesOut = $("[data-total-minutes]", root);
    var hoursOut = $("[data-total-hours]", root);
    var priceOut = $("[data-total-price]", root);
    var sentenceOut = $("[data-sentence]", root);
    var live = $("[data-planner-live]", root);
    var bar = $("[data-planner-bar]", root);
    var barText = $("[data-bar-text]", root);
    var copyBtn = $("[data-copy]", root);
    var summaryTitle = $("#summary-title");
    var sends = {};
    $$("[data-send]", root).forEach(function (a) { sends[a.getAttribute("data-send")] = a; });

    function selected() { return state.ids.map(function (id) { return byId[id]; }); }
    function totals() {
      return selected().reduce(function (acc, s) { acc.minutes += s.minutes; acc.cents += s.cents; return acc; }, { minutes: 0, cents: 0 });
    }
    function buildSentence() {
      var sel = selected();
      if (!sel.length) return "";
      var t = totals();
      var text = "Ich hätte gern: " + sel.map(function (s) { return s.name; }).join(" + ") +
        ", ca. " + t.minutes + " Min., ca. " + formatEuroShort(t.cents) + ".";
      var dayNames = state.days.slice().sort(function (a, b) { return a - b; }).map(function (d) { return WEEKDAYS[d]; });
      var parts = [];
      if (dayNames.length) parts.push("am liebsten " + joinOr(dayNames) + (state.time ? ", " + state.time : ""));
      else if (state.time) parts.push("am liebsten " + state.time);
      if (state.stylist) parts.push("gern bei " + state.stylist);
      if (parts.length) {
        var extra = parts.join(", ");
        text += " " + extra.charAt(0).toUpperCase() + extra.slice(1) + ".";
      }
      return text;
    }
    function hoursText(min) {
      if (min < 60) return "";
      var h = Math.floor(min / 60), m = min % 60;
      return "= " + h + " Std." + (m ? " " + m + " Min." : "");
    }

    function render() {
      var sel = selected();
      var t = totals();
      var sentence = buildSentence();
      var has = sel.length > 0;

      list.textContent = "";
      sel.forEach(function (s) {
        var btn = el("button", { "class": "summary__remove", type: "button", "aria-label": s.name + " entfernen", "data-remove": s.id,
          html: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 2l8 8M10 2l-8 8"/></svg>' });
        list.appendChild(el("li", null, [
          el("span", { "class": "summary__item-name", text: s.name }),
          el("span", { "class": "summary__item-meta", text: s.minutes + " Min. · " + formatEuro(s.cents) }),
          btn
        ]));
      });
      empty.hidden = has;
      setText(minutesOut, String(t.minutes));
      setText(hoursOut, hoursText(t.minutes));
      setText(priceOut, formatEuro(t.cents));
      setText(sentenceOut, has ? sentence : "Ich hätte gern: … – wählen Sie zuerst mindestens eine Leistung.");

      copyBtn.disabled = !has;
      var sms = waLink ? waLink.getAttribute("data-sms") : "";
      var hrefs = {
        whatsapp: waLink ? waLink.href.split("?")[0] + "?text=" + encodeURIComponent(sentence) : "",
        sms: sms ? "sms:" + sms + "?&body=" + encodeURIComponent(sentence) : "",
        email: mailLink ? mailLink.href.split("?")[0] + "?subject=" + encodeURIComponent("Terminanfrage" + (salon ? " – " + salon : "")) +
          "&body=" + encodeURIComponent("Hallo,\n\n" + sentence + "\n\nName: \nTelefon für Rückfragen: \n\nViele Grüße") : "",
        phone: phoneLink ? phoneLink.href : ""
      };
      Object.keys(sends).forEach(function (k) {
        var a = sends[k];
        if ((has || k === "phone") && hrefs[k]) { a.href = hrefs[k]; a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); }
        else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); a.setAttribute("role", "link"); a.setAttribute("tabindex", "-1"); }
      });

      bar.setAttribute("data-empty", String(!has));
      setText(barText, has ? sel.length + (sel.length === 1 ? " Leistung" : " Leistungen") + " · ca. " + t.minutes + " Min. · " + formatEuro(t.cents) : "Noch nichts gewählt");

      // Eingaben mit dem Zustand abgleichen
      $$("input[data-kind]", root).forEach(function (input) {
        var kind = input.getAttribute("data-kind");
        if (kind === "service") input.checked = state.ids.indexOf(input.value) > -1;
        if (kind === "day") input.checked = state.days.indexOf(+input.value) > -1;
        if (kind === "time") input.checked = input.value === state.time;
      });
      stylistSelect.value = state.stylist;
    }

    var announceTimer = 0;
    function announce(prefix) {
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(function () {
        var sel = selected(), t = totals();
        var msg = sel.length
          ? (prefix ? prefix + " " : "") + sel.length + (sel.length === 1 ? " Leistung" : " Leistungen") +
            ", zusammen ca. " + t.minutes + " Minuten und ca. " + formatEuro(t.cents) + "."
          : (prefix ? prefix + " " : "") + "Keine Leistung ausgewählt.";
        live.textContent = "";
        window.setTimeout(function () { live.textContent = msg; }, 60);
      }, 350);
    }
    function commit() {
      store("set", state);
      render();
      if (window.Salon && window.Salon.relayout) window.Salon.relayout();
    }

    root.addEventListener("change", function (e) {
      var input = e.target;
      var kind = input.getAttribute("data-kind");
      if (kind === "service") {
        var s = byId[input.value];
        if (input.checked) { if (state.ids.indexOf(s.id) < 0) state.ids.push(s.id); }
        else state.ids = state.ids.filter(function (id) { return id !== s.id; });
        commit();
        announce(s.name + (input.checked ? " hinzugefügt." : " entfernt."));
      } else if (kind === "day") {
        var d = +input.value;
        state.days = input.checked ? state.days.concat([d]) : state.days.filter(function (x) { return x !== d; });
        commit();
      } else if (kind === "time") {
        state.time = input.value;
        commit();
      } else if (input === stylistSelect) {
        state.stylist = stylistSelect.value;
        commit();
      }
    });

    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-remove]");
      if (!btn) return;
      var id = btn.getAttribute("data-remove");
      var idx = state.ids.indexOf(id);
      state.ids = state.ids.filter(function (x) { return x !== id; });
      commit();
      announce(byId[id].name + " entfernt.");
      // Fokus sinnvoll weitergeben: nächster Entfernen-Knopf, sonst Überschrift
      var buttons = $$("[data-remove]", list);
      var next = buttons[Math.min(idx, buttons.length - 1)];
      (next || summaryTitle).focus();
    });

    $("[data-clear]", root).addEventListener("click", function () {
      state = { ids: [], days: [], time: "", stylist: "" };
      store("clear");
      render();
      announce("Auswahl geleert.");
      if (window.Salon && window.Salon.relayout) window.Salon.relayout();
    });

    var toast;
    function showToast(text) {
      if (!toast) { toast = el("div", { "class": "toast", "aria-hidden": "true" }); document.body.appendChild(toast); }
      toast.textContent = text;
      toast.classList.add("is-visible");
      window.clearTimeout(showToast.t);
      showToast.t = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2200);
    }
    copyBtn.addEventListener("click", function () {
      var text = buildSentence();
      if (!text) return;
      var done = function () { showToast("Satz kopiert"); live.textContent = ""; window.setTimeout(function () { live.textContent = "Satz in die Zwischenablage kopiert."; }, 60); };
      var fallback = function () {
        var ta = el("textarea", { readonly: "", "aria-hidden": "true", "class": "visually-hidden" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        ta.remove();
        copyBtn.focus();
        if (ok) done(); else showToast("Bitte den Satz markieren und kopieren");
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });

    render();
    root.hidden = false;
  }

  /* ---------------------------------------------------------------------- */
  /* 5  Die durchgehende Linie                                               */
  /* ---------------------------------------------------------------------- */
  // Jedes Motiv ist ein eigenes Inline-SVG (auch ohne JavaScript sichtbar).
  // Hier entstehen die Verbindungsstücke: vom Ende eines Motivs über eine
  // Randspur rechts neben dem Inhalt bis zum Anfang des nächsten.
  var thread = { pieces: [], version: 0 };

  function pathEnds(path) {
    var n = (path.getAttribute("d").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    var L = n.length;
    return { s: [n[0], n[1]], s1: [n[2], n[3]], e: [n[L - 2], n[L - 1]], e1: [n[L - 4], n[L - 3]] };
  }
  function toPage(path, pt, origin) {
    var m = path.getScreenCTM();
    var p = new DOMPoint(pt[0], pt[1]).matrixTransform(m);
    return [p.x - origin.left, p.y - origin.top];
  }
  function unit(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function P(p) { return r1(p[0]) + " " + r1(p[1]); }
  function lineC(a, b) {
    return "C" + P([a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3]) + " " + P([a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3]) + " " + P(b);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function connector(E, dE, S, dS, rail, opts) {
    // Kontrollpunkte bleiben innerhalb der Seitenbreite → die Kurve (konvexe Hülle) auch
    var Q = function (pt) { return P([clamp(pt[0], 4, opts.maxX), pt[1]]); };
    var d = "M" + P(E);
    if (opts.hookOut) {           // zurück an der Aufhängung entlang (Spiegel)
      d += lineC(E, opts.hookOut);
      E = opts.hookOut; dE = [0, 1];
    }
    var target = S, dT = dS, tail = "";
    if (opts.hookIn) {            // an einer „Schnur“ zum Motiv (Spiegel)
      tail = lineC(opts.hookIn, S);
      target = opts.hookIn; dT = [0, 1];
    }
    var h1 = clamp(Math.abs(rail - E[0]) * 0.8 + 40, 56, 240);
    var h2 = clamp(Math.abs(rail - target[0]) * 0.8 + 40, 56, 240);
    var A = [rail, E[1] + h1], B = [rail, target[1] - h2];
    if (B[1] > A[1] + 1) {
      d += "C" + Q([E[0] + dE[0] * h1 * 0.6, E[1] + dE[1] * h1 * 0.6]) + " " + Q([rail, A[1] - h1 * 0.45]) + " " + P(A);
      d += lineC(A, B);
      d += "C" + Q([rail, B[1] + h2 * 0.45]) + " " + Q([target[0] - dT[0] * h2 * 0.6, target[1] - dT[1] * h2 * 0.6]) + " " + P(target);
    } else {
      var k = Math.max(40, Math.hypot(target[0] - E[0], target[1] - E[1]) * 0.4);
      d += "C" + Q([E[0] + dE[0] * k, E[1] + dE[1] * k]) + " " + Q([target[0] - dT[0] * k, target[1] - dT[1] * k]) + " " + P(target);
    }
    return d + tail;
  }

  function railX(origin) {
    var ref = $(".section > .container") || $(".container");
    var r = ref.getBoundingClientRect();
    var pad = parseFloat(getComputedStyle(ref).paddingRight) || 0;
    var contentRight = r.right - pad - origin.left;
    var width = origin.width;
    return Math.min(width - 6, contentRight + Math.min(Math.max((width - contentRight) * 0.5, 8), 72));
  }

  var svgNS = "http://www.w3.org/2000/svg";
  function computeThread() {
    var overlay = $("[data-thread-overlay]");
    if (!overlay) return;
    var origin = overlay.getBoundingClientRect();
    var motifs = $$("svg[data-thread]").filter(function (svg) { return svg.getClientRects().length; });
    var rail = railX(origin);
    var pieces = [];
    var conns = $$("path", overlay);
    var prev = null;

    motifs.forEach(function (svg, i) {
      var path = $(".motif__path", svg);
      var ends = pathEnds(path);
      var m = {
        kind: "motif", el: path, svg: svg, intro: svg.hasAttribute("data-thread-intro"),
        s: toPage(path, ends.s, origin), s1: toPage(path, ends.s1, origin),
        e: toPage(path, ends.e, origin), e1: toPage(path, ends.e1, origin),
        hook: null
      };
      // Der Spiegel hängt an einer „Schnur“: Ein- und Ausgang teilen sich einen Haken auf der Randspur
      if (svg.getAttribute("data-thread-entry") === "cord") {
        m.hook = [rail, m.s[1] - clamp(Math.abs(rail - m.s[0]) * 0.55, 48, 140)];
      }
      if (prev) {
        var cordOut = prev.svg.getAttribute("data-thread-exit") === "cord" ? prev.hook : null;
        var d = connector(prev.e, unit(prev.e1, prev.e), m.s, unit(m.s, m.s1), rail, { hookIn: m.hook, hookOut: cordOut, maxX: origin.width - 4 });
        var cp = conns[i - 1] || overlay.appendChild(document.createElementNS(svgNS, "path"));
        if (cp.getAttribute("d") !== d) cp.setAttribute("d", d);
        pieces.push({ kind: "connector", el: cp });
      }
      pieces.push(m);
      prev = m;
    });
    // überzählige Verbindungen entfernen
    conns.slice(Math.max(0, motifs.length - 1)).forEach(function (p) { p.remove(); });
    thread.pieces = pieces;
    thread.version++;
  }

  var layoutQueued = false;
  function relayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    window.requestAnimationFrame(function () {
      layoutQueued = false;
      computeThread();
      layoutListeners.forEach(function (fn) { try { fn(thread); } catch (e) { /* weiter */ } });
    });
  }

  function initLayoutWatch() {
    computeThread();
    var lastH = 0, lastW = 0;
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        var h = document.documentElement.scrollHeight, w = document.documentElement.clientWidth;
        if (h !== lastH || w !== lastW) { lastH = h; lastW = w; relayout(); }
      }).observe(document.body);
    }
    // kein „hashchange“: ein Anker-Sprung ändert kein Layout – und eine Neumessung
    // würde den weichen Scroll zum Ziel abbrechen
    window.addEventListener("resize", relayout);
    window.addEventListener("load", relayout);
    window.addEventListener("pageshow", relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  }

  /* ---------------------------------------------------------------------- */
  /* 6  Start                                                                */
  /* ---------------------------------------------------------------------- */
  function start() {
    initNav();
    var hours = initHours();
    initPlanner();
    initLayoutWatch();
    window.Salon = {
      ready: true,
      thread: thread,
      onLayout: onLayout,
      relayout: relayout,
      hours: hours
    };
    document.dispatchEvent(new CustomEvent("salon:ready"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
