# Visitenkarte zu Kontakt

Kleine Handy-App: Visitenkarte fotografieren, der Text wird direkt auf dem Handy erkannt (Tesseract.js, Deutsch + Englisch), die Felder werden vorausgefüllt und lassen sich prüfen. „Zu Kontakten hinzufügen“ öffnet auf dem iPhone die Kontaktvorschau mit „Neuen Kontakt erstellen“. QR-Codes mit vCard werden ebenfalls gelesen.

## Auf den Home-Bildschirm legen

- **iPhone (Safari):** Seite öffnen → Teilen → „Zum Home-Bildschirm“

## Hinweise

- Das Foto verlässt das Handy nicht. Beim ersten Start werden die Sprachdaten (ca. 3 MB) einmalig geladen.
- Die Erkennungsregeln (Name, Firma, Telefon, Adresse …) stehen in `parser.js`.
- Veröffentlichung über GitHub Pages: Settings → Pages → „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
