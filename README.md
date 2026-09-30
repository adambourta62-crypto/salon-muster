# Salon Muster – Gestaltungsvorlage „Linienführung“

Eigenständige Demo-Website für einen Friseursalon. Alle Geschäftsdaten (Name, Adresse,
Rufnummern, Team, Preise) sind **erfundene Beispieldaten**; die Seite ist als Entwurf
gekennzeichnet und per `noindex` von Suchmaschinen ausgeschlossen.

- Statisches HTML/CSS/JavaScript, kein Framework, kein Build-Schritt
- Alle Dateien lokal (GSAP, Schriften) – zur Laufzeit keine externen Anfragen, keine Cookies, keine Tracker
- Rufnummern stammen aus dem Bereich, den die Bundesnetzagentur für Medienproduktionen
  reserviert hat (0221 4710 xxx, 0171 39200 xx) – ein Klick auf „Anrufen“ erreicht niemanden

## Ansehen

- **Doppelklick** auf `index.html` – läuft direkt im Browser.
- **Mit echten Sicherheits-Headern** (wie später im Einsatz):
  `python tools/serve.py` → <http://localhost:8080>. Nur Python-Standardbibliothek.

**Tipp für die Vorführung:** `index.html?zeit=2026-10-03T10:30` simuliert eine Berliner
Uhrzeit und zeigt den Live-Status z. B. an einem Feiertag.

## Aufbau

```
index.html            Startseite (Hero, Preiskarte, Team, Wunschtermin-Planer, Öffnungszeiten, Kontakt)
impressum.html        Impressum-Struktur nach § 5 DDG, Angaben als [Platzhalter]
datenschutz.html      Datenschutzerklärung-Struktur nach Art. 13 DSGVO, Angaben als [Platzhalter]
favicon.svg
assets/css/site.css   Gestaltung (Tokens oben in :root)
assets/js/boot.js     läuft im <head>: Klassen, Schrift-Tor, lädt GSAP nur bei Bedarf
assets/js/site.js     Kern ohne Animationsbibliothek: Menü, Öffnungsstatus, Planer, Linien-Geometrie
assets/js/motion.js   Bewegung mit GSAP + ScrollTrigger (nur ohne „reduzierte Bewegung“)
assets/fonts/         Bodoni Moda, Linie Sans (OFL, Teilmengen) + Lizenz
assets/vendor/gsap/   GSAP 3.15 (Standard License)
_headers  .htaccess   Sicherheits-Header für Netlify/Cloudflare Pages bzw. Apache
deploy/               nginx-Snippet mit denselben Headern
tools/                Motiv-Generator und Vorschau-Server (nicht mit hochladen)
```

## Für einen echten Salon anpassen

Alle Inhalte stehen **einmal** im HTML; Planer, Live-Status und Versandlinks lesen daraus.

| Was | Wo |
| --- | --- |
| Name | `index.html`: `<title>`, `data-salon` am `<body>`, Wortmarke, Hero-Buchstaben (`.ch`), Fußzeile |
| Preise & Leistungen | Preiskarte in `index.html`: je Leistung `data-name`, `data-price` (Punkt als Dezimaltrenner), `data-minutes` sowie der sichtbare Text. Der Planer baut sich daraus selbst. |
| Team | `<li class="stylist" data-stylist="…">` – der Name erscheint automatisch in der Auswahl „Bei wem?“ |
| Öffnungszeiten | Tabelle `data-hours`: Zeiten als `<time datetime="09:00">`. Mehrere Zeitfenster pro Tag (Mittagspause) sind möglich: einfach weitere `<time>`-Paare. |
| Betriebsferien | Liste `data-closures`: `<li data-from="2026-12-24" data-to="2027-01-01">…</li>` (beide Tage eingeschlossen). Leer = unsichtbar. |
| Feiertage | automatisch: gesetzliche Feiertage in NRW (Osterformel). Anderes Bundesland: `holidaysNRW()` in `site.js`. |
| Kontakt | Links mit `data-contact="phone"`, `"whatsapp"`, `"email"`; SMS-Nummer in `data-sms` am WhatsApp-Link |
| Karte | Link „In OpenStreetMap öffnen“ – Adresse im Link anpassen |
| Rechtstexte | alle `<span class="ph">[…]</span>` in `impressum.html` und `datenschutz.html` ersetzen und rechtlich prüfen lassen |

**Vor dem Livegang** außerdem: Entwurfshinweise entfernen (Fußzeile `.draft-note`,
„Beispielpreise“, „Beispielpersonen“, Rufnummern-Hinweis), `noindex` entfernen
(`<meta name="robots">` in allen drei Seiten und `X-Robots-Tag` in `_headers`, `.htaccess`,
nginx-Snippet) und HSTS aktivieren, sobald die Domain dauerhaft per HTTPS läuft.

## Linienmotive

Haarsträhne, Schere, Stielkamm, Spiegel und Nadel sind parametrisch erzeugte SVG-Pfade.
Nach Änderungen in `tools/motive.mjs`: `node tools/motive.mjs` – die Pfade werden direkt
in `index.html` eingetragen. Die Verbindungen zwischen den Motiven berechnet `site.js`
im Browser neu, sobald sich Breite oder Höhe der Seite ändert.

## Technische Entscheidungen

- **Keine Layout-Verschiebung (CLS 0):** `boot.js` hält die Seite höchstens 1 s zurück, bis
  die drei Hauptschriften geladen sind. Kommen sie später (langsames Netz), bleibt es für
  diesen Besuch bei metrisch angeglichenen Ersatzschriften – dieselbe Idee wie
  `font-display: optional`, aber mit verlässlichem Zeitfenster auch in Safari.
- **Linien zeichnen ohne DrawSVG:** Alle Linien behalten dank `vector-effect: non-scaling-stroke`
  bei jeder Größe dieselbe Strichstärke. Das DrawSVG-Plugin misst solche Pfade bei
  ungleichmäßiger Skalierung falsch; `motion.js` misst die Länge daher selbst im Bildschirmraum
  und zeichnet über `stroke-dashoffset`.
- **Reduzierte Bewegung:** GSAP wird dann gar nicht geladen; alles ist sofort sichtbar und
  die Linie vollständig gezeichnet. Wird die Einstellung während des Besuchs umgestellt,
  räumt `gsap.matchMedia()` alle Animationen ab.
- **Nichts bleibt unsichtbar hängen:** Einblendungen sind nur in eine Richtung (einmal
  sichtbar, immer sichtbar); Sprünge, Zurück-Navigation und Höhenänderungen lösen eine
  Neumessung und einen Abgleich aus. Die Neumessung wartet, bis kein Scrollen mehr läuft,
  damit sie weiche Anker-Sprünge nicht abbricht.
- **Ohne JavaScript** sind Preiskarte, Team, Öffnungszeiten und Kontakt vollständig lesbar;
  der Planer zeigt stattdessen einen Hinweis mit Telefonnummer.
- **Wunschtermin-Planer:** rechnet nur im Browser; die Auswahl liegt im `localStorage`
  (Schlüssel `salon-muster/wunschtermin/v1`) und wird erst übertragen, wenn Besucher selbst senden.

## Hochladen

Alles außer `tools/`, `deploy/` und `README.md` auf den Webspace kopieren
(`_headers` nur bei Netlify/Cloudflare Pages nötig). Komprimierung (gzip/brotli) für
HTML, CSS, JS und SVG einschalten – die `.htaccess` enthält das für Apache bereits.

## Lizenzen

- Bodoni Moda – SIL Open Font License 1.1
- Linie Sans – umbenannte Teilmenge von Source Sans 3 (Adobe), SIL OFL 1.1; der Name
  „Source“ ist reserviert, daher die Umbenennung. Siehe `assets/fonts/LICENSE-OFL.txt`.
- GSAP – Standard License, kostenlos auch für kommerzielle Projekte. Siehe `assets/vendor/gsap/LICENSE.txt`.
