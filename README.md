# Visitenkarte zu Kontakt

Kleine Handy-App: Visitenkarte fotografieren, die Angaben werden erkannt und geprüft, „Zu Kontakten hinzufügen“ öffnet auf dem iPhone die Kontaktvorschau mit „Neuen Kontakt erstellen“. QR-Codes mit vCard werden ebenfalls gelesen.

## Auf den Home-Bildschirm legen

- **iPhone (Safari):** Seite öffnen → Teilen → „Zum Home-Bildschirm“

## So arbeitet die App

1. **Kamera mit Rahmen:** Die Kamera zeigt einen Rahmen im Visitenkartenformat (85 × 55 mm, umschaltbar auf Hochformat). Nur der Bereich im Rahmen wird gelesen.
2. **Texterkennung auf dem Handy** (Tesseract.js, Deutsch + Englisch). Die Schriftgröße jeder Zeile fließt mit ein: Der Name ist meist die größte Zeile.
3. **Prüfung auf dem Handy:**
   - Vor- und Nachnamen gegen eine Namensliste (ca. 8.400 Vornamen, 6.300 Nachnamen)
   - Telefonnummern mit libphonenumber: gültig ja/nein, Mobil oder Festnetz, einheitlich im Format `+49 …`
   - Postleitzahl gegen das Verzeichnis aller deutschen PLZ; ein einzelner Lesefehler in PLZ oder Ort wird korrigiert, wenn das eindeutig ist
4. **Im Hintergrund über das Internet:**
   - Adresse mit OpenStreetMap abgleichen (nur Straße, PLZ, Ort werden gesendet; abschaltbar)
   - Optional KI-Erkennung mit Claude (eigener API-Schlüssel nötig). Modus „Im Zweifel“: nur wenn Name, Telefon oder Adresse unsicher sind. Modus „Immer“: bei jeder Karte. Dabei geht das Foto der Karte an Anthropic.
5. **Lernen aus den eigenen Kontakten:** Export aller Kontakte vom iPhone (Kontakte → Listen → „Alle Kontakte“ gedrückt halten → Exportieren) in der App laden. Die App merkt sich Vor-/Nachnamen, Firmen, E-Mail-Domains (→ Firma) und Orte und erkennt sie auf Karten sicherer; sie meldet auch, wenn eine Person schon bekannt ist. Jeder gespeicherte Kontakt wird ebenfalls gelernt. Alles bleibt im Browser-Speicher des Geräts.

Felder werden markiert: **geprüft** (grün) oder **bitte prüfen** (gelb). Falsch erkannte Felder: Feld antippen, dann die passende erkannte Zeile antippen.

## Dateien

- `index.html` – Oberfläche, Kamera, Ablauf
- `parser.js` – Erkennungsregeln, Prüfungen, Lernen, vCard (läuft auch in Node für Tests)
- `online.js` – Adressprüfung (OpenStreetMap/Nominatim) und KI-Erkennung (Claude)
- `sw.js` – Offline-Cache; liefert `kontakt.vcf` mit dem Dateityp `text/vcard` aus
- `data/namen.json` – Vor- und Nachnamen (aus Faker, MIT)
- `data/plz.json` – PLZ → Ort (aus german-metadata: © OpenStreetMap-Mitwirkende, ODbL, und GovData)
- `vendor/libphonenumber-max.js` – libphonenumber-js 1.13.16 (MIT)
- `vendor/anthropic-sdk.js` – offizielles Anthropic-SDK (`@anthropic-ai/sdk` 1.8.0, MIT) als ein Browser-Modul, wird nur geladen, wenn die KI genutzt wird

## Veröffentlichung

GitHub Pages: Settings → Pages → „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.

Nach Änderungen an den Dateien in `sw.js` den Wert von `CACHE` hochzählen, damit Handys die neue Version sicher laden.
