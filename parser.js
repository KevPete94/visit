// Liest erkannten Text einer Visitenkarte aus, prüft die Angaben und baut daraus eine vCard.
// Läuft im Browser (window.VK) und in Node (module.exports) für Tests.
//
// Optionaler Kontext für genauere Ergebnisse (alles darf fehlen):
//   lines  – Zeilen der Texterkennung mit Schrifthöhe: [{ text, h }]
//   names  – Vornamen/Nachnamen aus data/namen.json (VK.makeNames)
//   plz    – Postleitzahl → Ort aus data/plz.json
//   phone  – libphonenumber-js (max), prüft und formatiert Telefonnummern
//   know   – aus den eigenen Kontakten Gelerntes (VK.learn)
(function (root) {
  'use strict';

  const FIELDS = ['prefix', 'first', 'last', 'suffix', 'org', 'title', 'cell', 'work', 'fax', 'email', 'url',
    'street', 'zip', 'city', 'country', 'note'];

  const COMPANY = /\b(GmbH|AG|KG|OHG|UG|e\.\s?K\.?|e\.\s?V\.?|mbH|SE|KGaA|PartG|PartmbB|Inc\.?|Ltd\.?|LLC|LLP|S\.?A\.?|S\.?r\.?l\.?|B\.?V\.?|Kanzlei|Gruppe|Group|Holding|Werke|Stiftung|Verlag|Agentur|Studio|Praxis|Klinik|Universität|University|Hochschule|Institut|Bank|Versicherung|Sparkasse|Volksbank|Steuerberatung|Rechtsanwälte|Patentanwälte|Notariat|Architekten|Ingenieure|Consulting|Solutions|Systems|Technologies|Services)\b|&\s?Co\b/i;
  const JOB = /\b(Geschäftsführ\w*|Gesch\.?-?führ\w*|Inhaber\w*|Vorstand\w*|Vorsitz\w*|Leiter\w*|Leitung|Head|Director|Direktor\w*|Manager\w*|Managing|CEO|CTO|CFO|COO|CIO|CMO|Founder|Co-Founder|Gründer\w*|Partner\w*|Berater\w*|Consultant|Referent\w*|Sachbearbeiter\w*|Assistent\w*|Assistant|Ingenieur\w*|Engineer\w*|Entwickler\w*|Developer|Designer\w*|Architekt\w*|Vertrieb\w*|Sales|Marketing|Einkauf|Projekt\w*|Project|Account|Officer|Specialist|Spezialist\w*|Analyst\w*|Rechtsanwält\w*|Rechtsanwalt|Patentanwält\w*|Patentanwalt|Notar\w*|Steuerberater\w*|Wirtschaftsprüfer\w*|Fachanwält\w*|Fachanwalt|Arzt|Ärztin|Zahnarzt|Zahnärztin|Associate|Attorney|Counsel|Lawyer|Senior|Junior|Prokurist\w*|Mitarbeiter\w*|Teamleiter\w*|Abteilungsleiter\w*|Bereichsleiter\w*|Professor\w*|Coach|Trainer\w*|Makler\w*|Kundenberater\w*|Customer|Support|Service|Grafik\w*|Fotograf\w*|Redakteur\w*|Journalist\w*|Physiotherapeut\w*|Heilpraktiker\w*|Therapeut\w*|Meister\w*|Techniker\w*|Kaufm\w*|Agent\w*|Repräsentant\w*|Executive|President|Präsident\w*|Owner)\b/i;
  const STREET = /(straße|strasse|str\.|str\b|weg\b|platz\b|allee\b|gasse\b|ring\b|damm\b|ufer\b|chaussee\b|markt\b|steig\b|pfad\b|stieg\b|berg\b|hof\b|graben\b|kai\b|zeile\b|park\b|promenade\b|brücke\b|tor\b|feld\b|garten\b|anger\b|bogen\b|kamp\b|wall\b|deich\b|höhe\b|aue\b|street|st\.|road|rd\.|avenue|ave\.|lane)/i;
  const PREFIX = /^(Dr\.?|Prof\.?|Dipl\.?-?\s?[\wäöü]+\.?|Mag\.?|Ing\.?|Herr|Frau|Mr\.?|Mrs\.?|Ms\.?|Dres\.?|med\.?|rer\.?|nat\.?|jur\.?|phil\.?|h\.\s?c\.?|habil\.?)$/i;
  const SUFFIX = /^(LL\.?\s?M\.?|M\.?\s?Sc\.?|B\.?\s?Sc\.?|M\.?\s?A\.?|B\.?\s?A\.?|MBA|Ph\.?\s?D\.?|Jr\.?|Sr\.?|MdB|M\.?\s?Eng\.?|B\.?\s?Eng\.?)$/i;
  const PARTICLE = /^(von|van|de|der|den|zu|zum|zur|vom|di|da|del|du|le|la|ten|ter)$/i;
  const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
  const URLRE = /\b((?:https?:\/\/)?(?:www\.)[^\s,;|]+|(?:https?:\/\/)[^\s,;|]+|[a-z0-9][a-z0-9\-]*\.(?:de|com|net|org|eu|io|at|ch|info|biz|co|app|law|legal|tech|online|shop|berlin|hamburg|koeln|bayern)(?:\/[^\s,;|]*)?)\b/i;
  const FREEMAIL = /^(gmail|googlemail|gmx|web|t-online|yahoo|hotmail|outlook|icloud|me|mac|live|aol|freenet|posteo|mailbox|protonmail|proton)\./i;
  const NOT_PHONE = /\b(IBAN|BIC|SWIFT|USt|UStId|UID|HRB|HRA|Amtsgericht|Registergericht|Steuer|St\.?-?Nr|VAT|Konto|BLZ)\b/i;
  const COUNTRY = /^(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Suisse)$/i;

  // ---------- kleine Hilfen ----------

  function fold(s) {
    return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function norm(s) { return fold(s).replace(/[^a-z0-9]/g, ''); }

  // Ähnlichkeit zweier Texte von 0 bis 1 (Levenshtein, ohne Groß-/Kleinschreibung und Sonderzeichen)
  function sim(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  function cleanLine(l) {
    return String(l || '').replace(/([Ss])tra[B8]e/g, '$1traße').replace(/([Ss])tra[B8]\b/g, '$1traß')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d\u201e]/g, '"')
      .replace(/\s+@\s+|\s+@|@\s+/g, '@')
      .replace(/^[\s|•·*_~»«<>=\-–—]+|[\s|•·*_~»«<>=]+$/g, '')
      .replace(/\s{2,}/g, '  ').trim();
  }

  function makeNames(raw) {
    const f = new Set(), l = new Set();
    const all = ((raw && raw.first) || []).concat((raw && raw.last) || []);
    ((raw && raw.first) || []).forEach(n => f.add(fold(n)));
    ((raw && raw.last) || []).forEach(n => l.add(fold(n)));
    // Umlaute, die die Texterkennung bei Großbuchstaben oft verliert: MULLER → MÜLLER (nur wenn „Muller“ selbst kein Name ist)
    // Ist die Form ohne Umlaut selbst ein Name (z. B. „Muller“), gilt die Korrektur nur mit Beleg aus E-Mail oder Webseite.
    const plain = new Set(all.map(n => n.toLowerCase()));
    const um = new Map(), amb = new Set();
    all.forEach(n => {
      if (!/[äöüÄÖÜ]/.test(n)) return;
      const k = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (um.has(k) && um.get(k) !== n.toLowerCase()) amb.add(k);
      um.set(k, n.toLowerCase());
      if (plain.has(k)) amb.add(k);
    });
    return { first: f, last: l, umlaut: um, ambiguous: amb };
  }

  // Ersetzt Wörter ohne Umlaut durch die bekannte Schreibweise mit Umlaut, Groß-/Kleinschreibung bleibt
  function fixUmlauts(text, ctx, evidence) {
    const um = ctx.names && ctx.names.umlaut;
    if (!um || !text) return text;
    return text.replace(/[A-Za-z][a-z]*[A-Z]*[a-z]*/g, w => {
      const v = um.get(w.toLowerCase());
      if (!v) return w;
      if (ctx.names.ambiguous.has(w.toLowerCase()) && !(evidence && evidence.includes(fold(v)))) return w;
      if (w === w.toUpperCase()) return v.toUpperCase();
      if (w[0] === w[0].toUpperCase()) return v.charAt(0).toUpperCase() + v.slice(1);
      return v;
    });
  }

  function isFirstName(word, ctx) {
    const parts = fold(word).replace(/[^a-z\-]/g, '').split('-').filter(Boolean);
    if (!parts.length || parts[0].length < 2) return false;
    return parts.every(p => (ctx.names && ctx.names.first.has(p)) || (ctx.know && ctx.know.first && ctx.know.first[p]));
  }
  function isLastName(word, ctx) {
    const w = fold(word).replace(/[^a-z\-]/g, '');
    if (w.length < 2) return false;
    return !!((ctx.names && ctx.names.last.has(w)) || (ctx.know && ctx.know.last && ctx.know.last[w]));
  }

  // ---------- Telefon ----------

  function isMobileNumber(num) {
    const d = num.replace(/[^\d+]/g, '').replace(/^00/, '+');
    return /^(\+49\(?0?\)?1[5-7]|01[5-7]|\+43\(?0?\)?6[5-9]|06[5-9]|\+41\(?0?\)?7[5-9]|07[5-9])/.test(d.replace(/[()]/g, ''));
  }

  function tidyPhone(num) {
    return num.replace(/\(0\)/g, '').replace(/[^\d+\s\/\-]/g, ' ').replace(/\//g, ' ')
      .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').replace(/^00/, '+').trim();
  }

  // Prüft eine Nummer mit libphonenumber; gibt die formatierte Nummer und ob sie gültig/mobil ist zurück
  function phoneInfo(raw, ctx, cc) {
    const tidy = tidyPhone(raw);
    const PH = ctx.phone;
    if (PH && PH.parsePhoneNumberFromString) {
      try {
        const p = PH.parsePhoneNumberFromString(tidy.replace(/-/g, ''), cc || 'DE');
        if (p && p.isValid()) {
          const t = p.getType();
          return { num: p.formatInternational(), valid: true, mobile: t === 'MOBILE' || (t === 'FIXED_LINE_OR_MOBILE' && isMobileNumber(tidy)) };
        }
        return { num: tidy, valid: false, mobile: isMobileNumber(tidy) };
      } catch (e) { /* unten weiter */ }
    }
    return { num: tidy, valid: null, mobile: isMobileNumber(tidy) };
  }

  function phoneLabel(before) {
    const b = fold(before.slice(-14));
    if (/(mobil|mobile|handy|cell|\bmob\b|\bm\b\s*[.:]?\s*$)/.test(b)) return 'cell';
    if (/(fax|\bf\b\s*[.:]?\s*$)/.test(b)) return 'fax';
    if (/(tel|phone|fon|\bt\b\s*[.:]?\s*$|\bp\b\s*[.:]?\s*$|zentrale|office|buero|durchwahl|direkt)/.test(b)) return 'work';
    return '';
  }

  // ---------- Postleitzahl und Ort ----------

  function niceCity(plzCity) {
    if (/^Berlin\b/.test(plzCity)) return 'Berlin';
    return plzCity.replace(/^Halle\/\s?Saale$/, 'Halle (Saale)').replace(/\s+u\.\s?a\.$/, '');
  }
  function cityMatch(a, b) {
    const x = norm(a), y = norm(niceCity(b));
    if (!x || !y) return false;
    if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
    const fa = norm(String(a).split(/[\s\-\/(]/)[0]), fb = norm(String(b).split(/[\s\-\/(]/)[0]);
    return (fa.length > 3 && fa === fb) || sim(a, niceCity(b)) >= 0.75;
  }
  // Findet eine PLZ mit einer anderen Ziffer, die zum gelesenen Ort passt (Lesefehler in der PLZ)
  function plzCities(plz, zip) { return plz && plz[zip] ? String(plz[zip]).split('|') : []; }
  function nearZip(zip, city, plz) {
    // Ergebnis: { zip } nur bei eindeutiger Korrektur, { city } wenn alle Treffer denselben Ort haben
    if (!city || !plz) return {};
    const hits = [];
    for (let i = 0; i < zip.length; i++) {
      for (let d = 0; d <= 9; d++) {
        const c = zip.slice(0, i) + d + zip.slice(i + 1);
        const m = c !== zip && plzCities(plz, c).find(x => cityMatch(city, x));
        if (m) hits.push({ zip: c, city: niceCity(m) });
      }
    }
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && hits.every(h => h.city === hits[0].city)) return { city: hits[0].city };
    return {};
  }
  function fixZipDigits(z) {
    return z.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  }

  // ---------- Auswertung ----------

  function empty() {
    const o = {};
    FIELDS.forEach(k => { o[k] = ''; });
    return o;
  }

  function analyze(text, ctx) {
    ctx = ctx || {};
    const out = empty();
    const meta = { ok: {}, check: {} };

    const src = ctx.lines && ctx.lines.length ? ctx.lines : String(text || '').split(/\r?\n/).map(t => ({ text: t, h: 0 }));
    const maxH = Math.max(0, ...src.map(l => l.h || 0));
    const lines = src.map(l => ({ text: cleanLine(l.text), h: maxH ? (l.h || 0) / maxH : 0 }))
      .filter(l => l.text.length > 1 && /[A-Za-zÄÖÜäöüß0-9@]{2,}/.test(l.text));
    const full = lines.map(l => l.text).join('\n');

    // Teile pro Zeile: getrennt durch | • · oder doppelte Leerzeichen
    const segs = [];
    lines.forEach((l, li) => l.text.split(/\s*[|•·]\s*|\s{2,}/).map(s => s.trim()).filter(s => s.length > 1)
      .forEach(s => segs.push({ s, li, h: l.h, used: false })));

    const cc = /\b(Österreich|Austria)\b/i.test(full) || /\+43/.test(full) ? 'AT'
      : /\b(Schweiz|Switzerland|Suisse)\b/i.test(full) || /\+41/.test(full) ? 'CH' : 'DE';

    // E-Mail
    for (const g of segs) {
      const m = g.s.replace(/\s/g, '').match(EMAIL);
      if (m && !out.email) { out.email = m[0].replace(/[.,]$/, ''); g.used = true; g.email = true; }
    }

    // Web
    for (const g of segs) {
      if (out.url) break;
      const s = g.s.replace(EMAIL, ' ');
      const m = s.match(URLRE);
      if (m) {
        out.url = m[1].replace(/[.,]$/, '');
        if (s.replace(m[0], '').replace(/(web|internet|www|url|homepage)\s*[.:]?/i, '').trim().length < 3) g.used = true;
      }
    }

    // Telefonnummern
    for (const g of segs) {
      if (g.email || NOT_PHONE.test(g.s)) continue;
      if (/\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]{2,}/.test(g.s) && !/\+|tel|fon|fax|mobil|handy/i.test(g.s)) continue;
      const re = /(\+|00)?\s?\(?\d[\d\s\/().\-]{4,}\d/g;
      // typische Lesefehler in Nummern: O statt 0, l/I/| statt 1
      const line = g.s.replace(/(\d)[Oo]/g, (_, d) => d + '0').replace(/(\d)[Oo]/g, (_, d) => d + '0').replace(/[Oo](?=\d)/g, '0')
        .replace(/(\d)[lI|](?=\d)/g, (_, d) => d + '1').replace(/(\s)[lI|](?=\d{2})/g, (_, d) => d + '1');
      let m, hit = false;
      while ((m = re.exec(line))) {
        const digits = m[0].replace(/\D/g, '');
        if (digits.length < 6 || digits.length > 16) continue;
        if (/^\d{4,5}$/.test(m[0].trim())) continue;
        const info = phoneInfo(m[0], ctx, cc);
        let kind = phoneLabel(line.slice(0, m.index));
        if (!kind || kind === 'work') kind = info.mobile ? 'cell' : 'work';
        if (!out[kind]) { out[kind] = info.num; mark(meta, kind, info.valid); }
        else if (kind === 'work' && !out.cell && info.mobile) { out.cell = info.num; mark(meta, 'cell', info.valid); }
        hit = true;
      }
      if (hit) g.used = true;
    }

    // Adresse: PLZ + Ort, Straße davor (gleiche Zeile oder Zeile darüber)
    for (let i = 0; i < segs.length && !out.zip; i++) {
      const g = segs[i];
      if (g.email || (g.used && !/\d{4,5}\s+[A-ZÄÖÜ]/.test(g.s))) continue;
      let parts = g.s.split(/\s*,\s*/);
      const one = parts.length === 1 && g.s.match(/^(.*?\d{1,4}\s?[a-zA-Z]?)\s+((?:(?:D|A|CH|DE|AT)[\s\-–]{0,2})?\d{4,5}\s+[A-Za-zÄÖÜäöüß].*)$/);
      if (one && STREET.test(one[1])) parts = [one[1], one[2]];
      for (let p = 0; p < parts.length; p++) {
        const m = parts[p].match(/^(?:(D|A|CH|DE|AT)[\s\-–]{0,2})?([0-9OoIlSB]{4,5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-\s()\/]{1,40})$/);
        if (!m || (m[2].match(/\d/g) || []).length < 3) continue;
        const zip = fixZipDigits(m[2]);
        if (!/^\d+$/.test(zip)) continue;
        if (zip.length === 4 && !m[1] && !/\b(wien|graz|linz|salzburg|innsbruck|klagenfurt|zürich|zurich|basel|bern|luzern|genf|lausanne|winterthur|st\.\s?gallen)\b/i.test(m[3])) continue;
        out.zip = zip;
        out.city = m[3].replace(/\s+(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland)$/i, '').trim();
        if (m[1] === 'A' || m[1] === 'AT') out.country = 'Österreich';
        else if (m[1] === 'CH') out.country = 'Schweiz';
        g.used = true;
        if (p > 0) out.street = parts.slice(0, p).join(', ');
        else {
          const prev = segs[i - 1];
          if (prev && !prev.email && /\d/.test(prev.s) && (STREET.test(prev.s) || /^[A-ZÄÖÜ][\wäöüß.\- ]+\s\d{1,4}\s?[a-zA-Z]?$/.test(prev.s))) {
            out.street = prev.s; prev.used = true;
          }
        }
        break;
      }
    }
    if (!out.street) {
      for (const g of segs) {
        if (!g.used && /\d/.test(g.s) && STREET.test(g.s) && /[A-Za-zäöü]{3,}.*\d{1,4}\s?[a-zA-Z]?$/.test(g.s)) { out.street = g.s; g.used = true; break; }
      }
    }
    if (/\b(Deutschland|Germany)\b/i.test(full)) out.country = out.country || 'Deutschland';
    else if (/\b(Österreich|Austria)\b/i.test(full)) out.country = 'Österreich';
    else if (/\b(Schweiz|Switzerland|Suisse)\b/i.test(full)) out.country = 'Schweiz';
    else if (!out.country && out.zip && out.zip.length === 5) out.country = 'Deutschland';
    segs.forEach(g => { if (COUNTRY.test(g.s)) g.used = true; });

    // Firma (auch „Müller & Partner“; eine Großbuchstaben-Zeile direkt darüber gehört meist dazu)
    const isCompany = g => !g.used && !/\d{3,}|@/.test(g.s) && (COMPANY.test(g.s) || (/\s&\s/.test(g.s) && g.s === g.s.toUpperCase()));
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (!isCompany(g)) continue;
      g.used = true; out.org = g.s;
      const next = segs[i + 1];
      const prev = segs[i - 1];
      if (next && next.li === g.li + 1 && isCompany(next)) { out.org += ' ' + next.s; next.used = true; }
      else if (prev && prev.li === g.li - 1 && !prev.used && !/\d|@/.test(prev.s) && prev.s === prev.s.toUpperCase() && prev.s.length > 2) {
        out.org = prev.s + ' ' + out.org; prev.used = true;
      }
      break;
    }
    // Firma aus den eigenen Kontakten wiedererkennen
    const know = ctx.know;
    if (!out.org && know && know.orgs) {
      let best = null, bs = 0;
      for (const g of segs) {
        if (g.used || /\d{3,}|@/.test(g.s)) continue;
        for (const k in know.orgs) {
          const s = sim(g.s, know.orgs[k]);
          if (s > bs) { bs = s; best = { g, org: know.orgs[k] }; }
        }
      }
      if (best && bs >= 0.85) { out.org = best.org; best.g.used = true; meta.ok.org = true; }
    }

    // Name: bewertet nach Vornamenliste, E-Mail-Adresse, Schriftgröße und Position
    const local = out.email ? fold(out.email.split('@')[0]).split(/[._\-+]/).filter(t => t.length > 1) : [];
    let best = null, bestScore = -99;
    for (const g of segs) {
      if (g.used || /\d|@|:/.test(g.s)) continue;
      const words = g.s.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
      const core = words.filter(w => w !== ',' && !PREFIX.test(w) && !SUFFIX.test(w));
      if (core.length < 2 || core.length > 4) continue;
      // Wörter in normaler Schreibweise oder in Großbuchstaben (auch gemischt: „KRAUSE, Sabine“)
      if (!core.every(w => /^[A-ZÄÖÜ][a-zäöüßéèáàíóúç'\-]+\.?$|^[A-ZÄÖÜ]\.$|^[A-ZÄÖÜ][a-zäöüß]+-[A-ZÄÖÜ][a-zäöüß]+$/.test(w) ||
        /^[A-ZÄÖÜ][A-ZÄÖÜß'\-]+\.?$/.test(w) || PARTICLE.test(w))) continue;
      let score = 0;
      if (JOB.test(g.s)) score -= 6;
      if (COMPANY.test(g.s)) score -= 6;
      if (STREET.test(g.s)) score -= 3;
      if (isFirstName(core[0], ctx)) score += 5;
      else if (core.slice(1).some(w => isFirstName(w, ctx))) score += 2;
      if (isLastName(core[core.length - 1], ctx)) score += 2;
      const f = fold(core.join(' '));
      const fw = f.split(/[\s\-]+/);
      local.forEach(t => { if (fw.some(w => w.replace(/\./g, '') === t)) score += 5; else if (t.length <= 2 && fw.some(w => w[0] === t[0])) score += 1; });
      if (out.email && local.length === 1 && f.replace(/\s/g, '').includes(local[0])) score += 3;
      if (words.some(w => PREFIX.test(w))) score += 3;
      if (g.h >= 0.95) score += 2; else if (g.h >= 0.8) score += 1;
      score += Math.max(0, 3 - g.li);
      if (core.every(w => w === w.toUpperCase())) score -= 1;
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (best) {
      best.used = true;
      const raw = fixUmlauts(best.s, ctx, fold(out.email + ' ' + out.url)).split(',');
      let words = raw[0].split(/\s+/).filter(Boolean);
      let after = raw.slice(1).join(',').trim();
      // „Müller, Anna“ → Vorname nach dem Komma
      if (after && /^[A-ZÄÖÜ][\wäöüß\-]+$/.test(after) && isFirstName(after, ctx) && !words.some(w => isFirstName(w, ctx))) {
        words = [after].concat(words); after = '';
      }
      const pre = [], suf = [], core = [];
      words.forEach(w => (PREFIX.test(w) && !core.length ? pre : SUFFIX.test(w) ? suf : core).push(w));
      if (after) suf.push(after);
      let cut = core.length - 1;
      while (cut > 1 && PARTICLE.test(core[cut - 1])) cut--;
      const cap = w => (w === w.toUpperCase() && w.length > 2 ? w.charAt(0) + w.slice(1).toLowerCase().replace(/-(.)/g, (_, c) => '-' + c.toUpperCase()) : w);
      out.first = core.slice(0, cut).map(cap).join(' ');
      out.last = core.slice(cut).map(w => (PARTICLE.test(w) ? w.toLowerCase() : cap(w))).join(' ');
      out.prefix = pre.join(' ').replace(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)\s*/i, '');
      out.suffix = suf.join(' ');
      if (isFirstName(core[0], ctx)) meta.ok.first = true;
    } else if (local.length >= 2) {
      const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
      out.first = cap(local[0]);
      out.last = cap(local[local.length - 1]);
      meta.check.first = true; meta.check.last = true;
    }

    // Firma notfalls aus der E-Mail-Domain ableiten
    if (!out.org && out.email) {
      const dom = out.email.split('@')[1];
      if (!FREEMAIL.test(dom)) {
        const base = dom.split('.').slice(-2, -1)[0];
        const hit = segs.find(g => !g.used && norm(g.s).includes(base.replace(/[^a-z0-9]/g, '')));
        if (hit) { out.org = hit.s; hit.used = true; }
      }
    }

    // Position: Stichwort oder die Zeile direkt unter dem Namen
    for (const g of segs) {
      if (!g.used && JOB.test(g.s) && !/@|\d{4,}/.test(g.s)) {
        const same = segs.filter(h => h.li === g.li && !h.used && !/@|\d{4,}/.test(h.s));
        same.forEach(h => { h.used = true; });
        out.title = same.map(h => h.s).join(', ');
        break;
      }
    }
    if (!out.title && best) {
      const below = segs.find(h => h.li === best.li + 1 && !h.used && !/\d|@/.test(h.s) && h.s.split(/\s+/).length <= 6 && !STREET.test(h.s));
      if (below) { out.title = below.s; below.used = true; meta.check.title = true; }
    }

    if (!out.url && out.email) {
      const dom = out.email.split('@')[1];
      if (!FREEMAIL.test(dom)) out.url = 'www.' + dom.toLowerCase();
    }

    if (out.org && /[A-Z]{3,}/.test(out.org)) out.org = fixUmlauts(out.org, ctx, fold(out.email + ' ' + out.url));
    const res = validate(out, ctx, meta);
    return res;
  }

  function mark(meta, k, valid) {
    if (valid === true) { meta.ok[k] = true; delete meta.check[k]; }
    else if (valid === false) { meta.check[k] = true; delete meta.ok[k]; }
  }

  // Prüft und vereinheitlicht Felder (auch für Ergebnisse der KI): Telefon, PLZ/Ort, bekannte Firma
  function validate(fields, ctx, meta) {
    ctx = ctx || {};
    meta = meta || { ok: {}, check: {} };
    const f = Object.assign(empty(), fields);
    const cc = /Österreich|Austria/i.test(f.country) ? 'AT' : /Schweiz|Switzerland/i.test(f.country) ? 'CH' : 'DE';

    ['cell', 'work', 'fax'].forEach(k => {
      if (!f[k]) return;
      const info = phoneInfo(f[k], ctx, cc);
      if (info.valid !== null) { f[k] = info.num; mark(meta, k, info.valid); }
    });
    // Mobilnummer im Feld Telefon? Dann tauschen
    if (f.work && !f.cell && ctx.phone && phoneInfo(f.work, ctx, cc).mobile) {
      f.cell = f.work; f.work = '';
      if (meta.ok.work) { meta.ok.cell = true; delete meta.ok.work; }
      if (meta.check.work) { meta.check.cell = true; delete meta.check.work; }
    }

    if (ctx.plz && /^\d{5}$/.test(f.zip) && cc === 'DE') {
      const cs = plzCities(ctx.plz, f.zip);
      const hit = f.city ? cs.find(c => cityMatch(f.city, c)) : cs[0];
      if (hit) {
        f.city = niceCity(hit);
        mark(meta, 'zip', true); mark(meta, 'city', true);
      } else {
        const alt = nearZip(f.zip, f.city, ctx.plz);
        if (alt.city) f.city = alt.city;
        if (alt.zip) { f.zip = alt.zip; mark(meta, 'zip', true); mark(meta, 'city', true); }
        else mark(meta, 'zip', false);
      }
    } else if (ctx.plz && !f.zip && f.city && cc === 'DE') {
      meta.check.zip = true;
    }

    const know = ctx.know;
    if (know && f.email && f.email.includes('@')) {
      const dom = f.email.split('@')[1].toLowerCase();
      const k = know.domains && know.domains[dom];
      if (k && (!f.org || sim(f.org, k) >= 0.5 || COMPANY.test(k))) { f.org = k; meta.ok.org = true; }
    }
    if (know && know.orgs && f.org && !meta.ok.org) {
      for (const k in know.orgs) {
        if (sim(f.org, know.orgs[k]) >= 0.85) { f.org = know.orgs[k]; meta.ok.org = true; break; }
      }
    }
    return { fields: f, meta };
  }

  // Liste der Gründe, warum das Ergebnis unsicher ist („im Zweifel“)
  function doubts(f, meta, conf) {
    const d = [];
    if (!f.first || !f.last) d.push('Name');
    if (meta.check.first || meta.check.last) d.push('Name');
    if (!f.cell && !f.work && !f.email) d.push('Kontaktdaten');
    if (meta.check.cell || meta.check.work || meta.check.fax) d.push('Telefon');
    if (meta.check.zip || (f.street && (!f.zip || !f.city))) d.push('Adresse');
    if (conf != null && conf < 70) d.push('Lesequalität');
    return Array.from(new Set(d));
  }

  // Ergebnis der Adressprüfung (OpenStreetMap) übernehmen, wenn es zur gelesenen Adresse passt
  function adoptAddress(f, a, meta) {
    const res = {};
    if (!a) return res;
    const streetKey = s => fold(s).replace(/str\.|str\b/g, 'strasse').replace(/[^a-z]/g, '');
    const numM = (f.street || '').match(/\s(\d+\s?[a-zA-Z]?(?:\s*[-–\/]\s*\d+\s?[a-zA-Z]?)?)$/);
    const num = numM ? numM[1] : a.house;
    const name = (f.street || '').replace(/\s\d.*$/, '');
    const ss = name && a.road ? sim(streetKey(name), streetKey(a.road)) : 0;
    if (a.road && (ss >= 0.7 || !f.street)) res.street = a.road + (num ? ' ' + num : '');
    if (a.zip && (!f.zip || (meta && meta.check && meta.check.zip))) res.zip = a.zip;
    if (a.city && (!f.city || (meta && meta.check && meta.check.zip))) res.city = a.city;
    return res;
  }

  // ---------- Lernen aus eigenen Kontakten ----------

  function emptyKnowledge() {
    return { v: 1, n: 0, first: {}, last: {}, orgs: {}, domains: {}, zip: {}, emails: {}, phones: {} };
  }

  function learn(K, c) {
    if (!K || !c) return K;
    const inc = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
    const who = [c.first, c.last].filter(Boolean).join(' ') || c.org || '';
    String(c.first || '').split(/[\s\-]+/).forEach(w => { const x = fold(w).replace(/[^a-z]/g, ''); if (x.length > 1) inc(K.first, x); });
    const lastWord = fold(String(c.last || '').trim().split(/\s+/).pop()).replace(/[^a-z\-]/g, '');
    if (lastWord.length > 1) inc(K.last, lastWord);
    const org = String(c.org || '').trim();
    if (org.length > 1) K.orgs[norm(org)] = org;
    const em = String(c.email || '').toLowerCase().trim();
    if (EMAIL.test(em)) {
      const dom = em.split('@')[1];
      if (org && !FREEMAIL.test(dom)) K.domains[dom] = org;
      if (who) K.emails[em] = who;
    }
    if (/^\d{5}$/.test(c.zip || '') && c.city) K.zip[c.zip] = String(c.city).trim();
    [c.cell, c.work].forEach(t => {
      const d = String(t || '').replace(/\D/g, '').slice(-9);
      if (d.length >= 7 && who) K.phones[d] = who;
    });
    K.n++;
    return K;
  }

  // Ist diese Person schon in den gelernten Kontakten? Gibt den Namen zurück
  function findKnown(K, f) {
    if (!K) return '';
    const em = String(f.email || '').toLowerCase();
    if (em && K.emails[em]) return K.emails[em];
    for (const t of [f.cell, f.work]) {
      const d = String(t || '').replace(/\D/g, '').slice(-9);
      if (d.length >= 7 && K.phones[d]) return K.phones[d];
    }
    return '';
  }

  function knowledgeStats(K) {
    if (!K) return { contacts: 0, first: 0, orgs: 0, places: 0 };
    return { contacts: K.n, first: Object.keys(K.first).length, orgs: Object.keys(K.orgs).length, places: Object.keys(K.zip).length };
  }

  // ---------- vCard ----------

  // vCard-Text (z. B. aus einem QR-Code) in dieselben Felder übernehmen
  function parseVCard(text) {
    const out = empty();
    const raw = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    for (const line of raw) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i).toUpperCase();
      const val = line.slice(i + 1);
      const name = head.split(';')[0].replace(/^ITEM\d+\./, '');
      const parts = splitValue(val).map(unesc);
      if (name === 'N') { [out.last, out.first, , out.prefix, out.suffix] = parts.map(p => (p || '').trim()); }
      else if (name === 'FN' && !out.first && !out.last) { const w = unesc(val).trim().split(/\s+/); out.last = w.pop() || ''; out.first = w.join(' '); }
      else if (name === 'ORG') out.org = parts.filter(Boolean).join(', ');
      else if (name === 'TITLE') out.title = unesc(val);
      else if (name === 'EMAIL' && !out.email) out.email = val.trim();
      else if (name === 'URL' && !out.url) out.url = unesc(val).trim();
      else if (name === 'NOTE') out.note = unesc(val);
      else if (name === 'TEL') {
        const num = val.replace(/^tel:/i, '').trim();
        const kind = /FAX/.test(head) ? 'fax' : /CELL|MOBILE|IPHONE/.test(head) ? 'cell' : isMobileNumber(num) ? 'cell' : 'work';
        if (!out[kind]) out[kind] = num;
      } else if (name === 'ADR' && !out.street) {
        out.street = (parts[2] || '').replace(/\n/g, ', ');
        out.city = parts[3] || ''; out.zip = parts[5] || ''; out.country = parts[6] || '';
      }
    }
    return out;
  }

  // Teilt einen vCard-Wert an „;“, aber nicht an „\;“
  function splitValue(v) {
    const out = [];
    let cur = '';
    for (let i = 0; i < v.length; i++) {
      if (v[i] === '\\' && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; }
      else if (v[i] === ';') { out.push(cur); cur = ''; }
      else cur += v[i];
    }
    out.push(cur);
    return out;
  }

  // Mehrere vCards in einer Datei (z. B. Export aller Kontakte vom iPhone)
  function parseVCards(text) {
    const list = [];
    const re = /BEGIN:VCARD[\s\S]*?END:VCARD/gi;
    let m;
    while ((m = re.exec(String(text)))) list.push(parseVCard(m[0]));
    return list;
  }

  function esc(v) {
    return String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function buildVCard(f) {
    const L = ['BEGIN:VCARD', 'VERSION:3.0'];
    const fn = [f.prefix, f.first, f.last, f.suffix].filter(Boolean).join(' ') || f.org || 'Neuer Kontakt';
    L.push('N:' + [f.last, f.first, '', f.prefix, f.suffix].map(esc).join(';'));
    L.push('FN:' + esc(fn));
    if (f.org) L.push('ORG:' + esc(f.org));
    if (f.title) L.push('TITLE:' + esc(f.title));
    if (f.cell) L.push('TEL;type=CELL;type=VOICE;type=pref:' + f.cell);
    if (f.work) L.push('TEL;type=WORK;type=VOICE:' + f.work);
    if (f.fax) L.push('TEL;type=WORK;type=FAX:' + f.fax);
    if (f.email) L.push('EMAIL;type=INTERNET;type=WORK;type=pref:' + f.email);
    if (f.url) L.push('URL;type=WORK:' + (/^https?:\/\//i.test(f.url) ? f.url : 'https://' + f.url));
    if (f.street || f.city || f.zip || f.country) {
      L.push('ADR;type=WORK:;;' + [f.street, f.city, '', f.zip, f.country].map(esc).join(';'));
    }
    if (f.note) L.push('NOTE:' + esc(f.note));
    L.push('END:VCARD');
    return L.join('\r\n') + '\r\n';
  }

  function parse(text, ctx) { return analyze(text, ctx).fields; }

  const api = {
    FIELDS, parse, analyze, validate, doubts, adoptAddress, makeNames, sim,
    emptyKnowledge, learn, findKnown, knowledgeStats, parseVCard, parseVCards, buildVCard,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VK = api;
})(this);
