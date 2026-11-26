// Hilfen, die das Internet nutzen:
//  - Adressprüfung über OpenStreetMap (Nominatim), ohne Konto
//  - KI-Erkennung mit Claude, nur mit eigenem API-Schlüssel (wird nur auf dem Gerät gespeichert)
(function (root) {
  'use strict';

  const KI_MODEL = 'claude-opus-5-5';

  function withTimeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  // ---------- Adressprüfung ----------

  async function nominatim(params) {
    const q = new URLSearchParams(Object.assign({ format: 'jsonv2', addressdetails: '1', limit: '1', 'accept-language': 'de' }, params));
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + q.toString(), {
      signal: withTimeout(8000), headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('Adressprüfung nicht erreichbar (' + r.status + ').');
    const j = await r.json();
    return j && j[0] && j[0].address ? j[0].address : null;
  }

  // Sucht Straße, PLZ und Ort bei OpenStreetMap. Gibt { road, house, zip, city } oder null zurück.
  async function checkAddress(f) {
    if (!f.street || (!f.zip && !f.city)) return null;
    const cc = { Deutschland: 'de', 'Österreich': 'at', Schweiz: 'ch' }[f.country] || 'de,at,ch';
    let a = await nominatim(Object.assign({ street: f.street, countrycodes: cc }, f.zip ? { postalcode: f.zip } : {}, f.city ? { city: f.city } : {}));
    if (!a && f.zip && f.city) a = await nominatim({ street: f.street, postalcode: f.zip, countrycodes: cc });
    if (!a && f.city) a = await nominatim({ street: f.street, city: f.city, countrycodes: cc });
    if (!a) return null;
    return {
      road: a.road || a.pedestrian || a.footway || '',
      house: a.house_number || '',
      zip: a.postcode || '',
      city: a.city || a.town || a.village || a.municipality || '',
    };
  }

  // ---------- KI-Erkennung (Claude) ----------

  const FIELD_TEXT = {
    prefix: 'Akademischer Titel vor dem Namen, z. B. „Dr.“ oder „Prof. Dr.“',
    first: 'Vorname(n)',
    last: 'Nachname, mit Namenszusätzen wie „von“ oder „van“',
    suffix: 'Abschluss nach dem Namen, z. B. „LL.M.“ oder „MBA“',
    org: 'Firmenname mit Rechtsform, wie auf der Karte',
    title: 'Position oder Funktion der Person',
    cell: 'Mobilnummer im internationalen Format, z. B. „+49 171 2345678“',
    work: 'Festnetz- oder Büronummer im internationalen Format, z. B. „+49 89 1234560“',
    fax: 'Faxnummer im internationalen Format',
    email: 'E-Mail-Adresse',
    url: 'Webseite',
    street: 'Straße mit Hausnummer',
    zip: 'Postleitzahl',
    city: 'Ort',
    country: 'Land, auf Deutsch ausgeschrieben',
  };
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(FIELD_TEXT),
    properties: Object.fromEntries(Object.entries(FIELD_TEXT).map(([k, d]) => [k, { type: 'string', description: d }])),
  };
  const SYSTEM = [
    'Du liest Visitenkarten aus und gibst die Kontaktdaten der Person als JSON zurück.',
    'Übernimm nur, was auf der Karte steht. Erfinde nichts und ergänze nichts aus Allgemeinwissen. Fehlt eine Angabe, gib einen leeren Text zurück.',
    'Telefonnummern schreibst du im internationalen Format mit Ländervorwahl und ohne „(0)“. Ordne Mobil-, Festnetz- und Faxnummern nach ihrer Beschriftung zu; ohne Beschriftung nach der Vorwahl.',
    'Steht auf der Karte kein Land, aber die Adresse ist erkennbar deutsch, schreibe „Deutschland“.',
    'Wenn zusätzlich Text aus einer lokalen Texterkennung mitgeschickt wird, nutze ihn nur als Hilfe. Er kann Lesefehler enthalten. Im Zweifel gilt, was auf dem Bild steht.',
  ].join('\n');

  let sdk = null;
  function loadSdk() {
    if (!sdk) sdk = import('./vendor/anthropic-sdk.js');
    return sdk;
  }

  function errorText(mod, e) {
    if (e instanceof mod.AuthenticationError) return 'Der API-Schlüssel wurde nicht akzeptiert. Bitte unter „Lernen & Prüfen“ kontrollieren.';
    if (e instanceof mod.PermissionDeniedError) return 'Der API-Schlüssel darf dieses Modell nicht nutzen.';
    if (e instanceof mod.RateLimitError) return 'Zu viele Anfragen an die KI. Bitte kurz warten und erneut versuchen.';
    if (e instanceof mod.BadRequestError) return 'Die KI hat die Anfrage nicht angenommen: ' + (e.message || '').replace(/^\d+\s*/, '');
    if (e instanceof mod.APIConnectionError) return 'Keine Verbindung zur KI. Bitte Internetverbindung prüfen.';
    if (e instanceof mod.APIError) return 'Die KI ist gerade nicht erreichbar (Fehler ' + (e.status || '?') + ').';
    return e && e.message ? e.message : String(e);
  }

  // Liest die Karte mit Claude. imageBase64: JPEG ohne „data:“-Präfix. Gibt die Felder als Objekt zurück.
  async function kiExtract({ apiKey, imageBase64, ocrText }) {
    const mod = await loadSdk();
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90000 });
    const content = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: 'Lies diese Visitenkarte aus.' + (ocrText ? '\n\nText aus der lokalen Texterkennung (kann Lesefehler enthalten):\n<texterkennung>\n' + ocrText + '\n</texterkennung>' : '') },
    ];
    let res;
    try {
      res = await client.beta.messages.create({
        model: KI_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      });
    } catch (e) {
      throw new Error(errorText(mod, e));
    }
    if (res.stop_reason === 'refusal') throw new Error('Die KI hat diese Karte nicht ausgelesen.');
    if (res.stop_reason === 'max_tokens') throw new Error('Die Antwort der KI war unvollständig.');
    const texts = (res.content || []).filter(b => b.type === 'text');
    if (!texts.length) throw new Error('Die KI hat keine Daten zurückgegeben.');
    try {
      return JSON.parse(texts[texts.length - 1].text);
    } catch (e) {
      throw new Error('Die Antwort der KI war nicht lesbar.');
    }
  }

  root.ONLINE = { checkAddress, kiExtract, KI_MODEL };
})(this);
