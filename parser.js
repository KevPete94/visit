// Liest erkannten Text einer Visitenkarte aus und baut daraus eine vCard.
// Läuft im Browser (window.VK) und in Node (module.exports) für Tests.
(function (root) {
  'use strict';

  const COMPANY = /\b(GmbH|AG|KG|OHG|UG|e\.\s?K\.?|e\.\s?V\.?|mbH|SE|KGaA|PartG|PartmbB|Inc\.?|Ltd\.?|LLC|LLP|S\.?A\.?|S\.?r\.?l\.?|B\.?V\.?|Kanzlei|Gruppe|Group|Holding|Werke|Stiftung|Verlag|Agentur|Studio|Praxis|Klinik|Universität|University|Hochschule|Institut|Bank|Versicherung)\b|&\s?Co\b/i;
  const JOB = /\b(Geschäftsführ\w*|Gesch\.?-?führ\w*|Inhaber\w*|Vorstand\w*|Vorsitz\w*|Leiter\w*|Leitung|Head|Director|Direktor\w*|Manager\w*|Managing|CEO|CTO|CFO|COO|CIO|CMO|Founder|Gründer\w*|Partner\w*|Berater\w*|Consultant|Referent\w*|Sachbearbeiter\w*|Assistent\w*|Assistant|Ingenieur\w*|Engineer\w*|Entwickler\w*|Developer|Designer\w*|Architekt\w*|Vertrieb\w*|Sales|Marketing|Einkauf|Projekt\w*|Project|Account|Key|Officer|Specialist|Spezialist\w*|Analyst\w*|Rechtsanwält\w*|Rechtsanwalt|Patentanwält\w*|Patentanwalt|Notar\w*|Steuerberater\w*|Wirtschaftsprüfer\w*|Fachanwält\w*|Fachanwalt|Arzt|Ärztin|Zahnarzt|Zahnärztin|Associate|Attorney|Counsel|Lawyer|Senior|Junior|Prokurist\w*|Mitarbeiter\w*|Teamleiter\w*|Abteilungsleiter\w*|Bereichsleiter\w*|Professor\w*|Coach|Trainer\w*|Makler\w*|Kundenberater\w*|Customer|Support|Service)\b/i;
  const STREET = /(straße|strasse|str\.|str\b|weg\b|platz\b|allee\b|gasse\b|ring\b|damm\b|ufer\b|chaussee\b|markt\b|steig\b|pfad\b|stieg\b|berg\b|hof\b|graben\b|kai\b|zeile\b|park\b|street|st\.|road|rd\.|avenue|ave\.|lane)/i;
  const PREFIX = /^(Dr\.?|Prof\.?|Dipl\.?-?\s?[\wäöü]+\.?|Mag\.?|Ing\.?|Herr|Frau|Mr\.?|Mrs\.?|Ms\.?|Dres\.?|med\.?|rer\.?|nat\.?|jur\.?|phil\.?|h\.\s?c\.?|habil\.?)$/i;
  const SUFFIX = /^(LL\.?\s?M\.?|M\.?\s?Sc\.?|B\.?\s?Sc\.?|M\.?\s?A\.?|B\.?\s?A\.?|MBA|Ph\.?\s?D\.?|Jr\.?|Sr\.?|MdB|M\.?\s?Eng\.?|B\.?\s?Eng\.?)$/i;
  const PARTICLE = /^(von|van|de|der|den|zu|zum|zur|vom|di|da|del|du|le|la|ten|ter)$/i;
  const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
  const URLRE = /\b((?:https?:\/\/)?(?:www\.)[^\s,;|]+|(?:https?:\/\/)[^\s,;|]+|[a-z0-9][a-z0-9\-]*\.(?:de|com|net|org|eu|io|at|ch|info|biz|co|app|law|legal|tech|online|shop|berlin|hamburg|koeln|bayern)(?:\/[^\s,;|]*)?)\b/i;
  const FREEMAIL = /^(gmail|googlemail|gmx|web|t-online|yahoo|hotmail|outlook|icloud|me|mac|live|aol|freenet|posteo|mailbox|protonmail|proton)\./i;

  function fold(s) {
    return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function cleanLine(l) {
    return l.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d\u201e]/g, '"')
      .replace(/\s+@\s+|\s+@|@\s+/g, '@')
      .replace(/^[\s|•·*_~»«<>=\-–—]+|[\s|•·*_~»«<>=]+$/g, '')
      .replace(/\s{2,}/g, '  ').trim();
  }

  function phoneLabel(before, num) {
    const b = fold(before.slice(-14));
    if (/(mobil|mobile|handy|cell|\bmob\b|\bm\b\s*[.:]?\s*$)/.test(b)) return 'cell';
    if (/(fax|\bf\b\s*[.:]?\s*$)/.test(b)) return 'fax';
    if (/(tel|phone|fon|\bt\b\s*[.:]?\s*$|\bp\b\s*[.:]?\s*$|zentrale|office|buero|durchwahl|direkt)/.test(b)) {
      return isMobileNumber(num) ? 'cell' : 'work';
    }
    return isMobileNumber(num) ? 'cell' : 'work';
  }

  function isMobileNumber(num) {
    const d = num.replace(/[^\d+]/g, '').replace(/^00/, '+');
    return /^(\+49\(?0?\)?1[5-7]|01[5-7]|\+43\(?0?\)?6[5-9]|06[5-9]|\+41\(?0?\)?7[5-9]|07[5-9])/.test(d.replace(/[()]/g, ''));
  }

  function tidyPhone(num) {
    return num.replace(/\(0\)/g, '').replace(/[^\d+\s\/\-]/g, ' ').replace(/\//g, ' ')
      .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').replace(/^00/, '+').trim();
  }

  function parse(text) {
    const out = { prefix: '', first: '', last: '', suffix: '', org: '', title: '', cell: '', work: '', fax: '',
      email: '', url: '', street: '', zip: '', city: '', country: '', note: '' };
    const lines = text.split(/\r?\n/).map(cleanLine).filter(l => l.length > 1);
    // Teile pro Zeile: getrennt durch | • · oder doppelte Leerzeichen
    const segs = [];
    lines.forEach((l, li) => l.split(/\s*[|•·]\s*|\s{2,}/).map(s => s.trim()).filter(s => s.length > 1)
      .forEach(s => segs.push({ s, li, used: false })));

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
      if (g.email) continue;
      const re = /(\+|00)?\s?\(?\d[\d\s\/().\-]{4,}\d/g;
      let m, hit = false;
      while ((m = re.exec(g.s))) {
        const digits = m[0].replace(/\D/g, '');
        if (digits.length < 6 || digits.length > 16) continue;
        // PLZ + Ort nicht als Telefonnummer werten
        if (/^\d{4,5}$/.test(m[0].trim())) continue;
        const kind = phoneLabel(g.s.slice(0, m.index), m[0]);
        const num = tidyPhone(m[0]);
        if (!out[kind]) out[kind] = num;
        else if (kind === 'work' && !out.cell && isMobileNumber(num)) out.cell = num;
        hit = true;
      }
      if (hit) g.used = true;
    }

    // Adresse: PLZ + Ort, Straße davor (gleiche Zeile oder Zeile darüber)
    for (let i = 0; i < segs.length && !out.zip; i++) {
      const g = segs[i];
      if (g.email) continue;
      const parts = g.s.split(/\s*,\s*/);
      for (let p = 0; p < parts.length; p++) {
        const m = parts[p].match(/^(?:(D|A|CH|DE|AT)[\s\-–]{0,2})?(\d{4,5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-\s()]{1,40})$/);
        if (!m || (m[2].length === 4 && !m[1] && !/\b(wien|graz|linz|salzburg|innsbruck|zürich|zurich|basel|bern|luzern|genf|lausanne)\b/i.test(m[3]))) continue;
        out.zip = m[2];
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
    if (/\b(Deutschland|Germany)\b/i.test(text)) out.country = out.country || 'Deutschland';
    else if (/\b(Österreich|Austria)\b/i.test(text)) out.country = 'Österreich';
    else if (/\b(Schweiz|Switzerland|Suisse)\b/i.test(text)) out.country = 'Schweiz';
    else if (!out.country && out.zip && out.zip.length === 5) out.country = 'Deutschland';
    segs.forEach(g => { if (/^(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland)$/i.test(g.s)) g.used = true; });

    // Firma (auch „Müller & Partner“; eine Großbuchstaben-Zeile direkt darüber gehört meist dazu)
    const isCompany = g => !g.used && !/\d{3,}|@/.test(g.s) && (COMPANY.test(g.s) || (/\s&\s/.test(g.s) && g.s === g.s.toUpperCase()));
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (!isCompany(g)) continue;
      g.used = true; g.org = true; out.org = g.s;
      const next = segs[i + 1];
      const prev = segs[i - 1];
      if (next && next.li === g.li + 1 && isCompany(next) && !next.used) { out.org += ' ' + next.s; next.used = true; }
      else if (prev && prev.li === g.li - 1 && !prev.used && !/\d|@/.test(prev.s) && prev.s === prev.s.toUpperCase() && prev.s.length > 2) {
        out.org = prev.s + ' ' + out.org; prev.used = true;
      }
      break;
    }

    // Name: bevorzugt passend zur E-Mail-Adresse
    const local = out.email ? fold(out.email.split('@')[0]).split(/[._\-+]/).filter(t => t.length > 1) : [];
    let best = null, bestScore = -99;
    for (const g of segs) {
      if (g.used || /\d|@|:/.test(g.s)) continue;
      const words = g.s.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
      const core = words.filter(w => w !== ',' && !PREFIX.test(w) && !SUFFIX.test(w));
      if (core.length < 2 || core.length > 4) continue;
      if (!core.every(w => /^[A-ZÄÖÜ][a-zäöüßéèáàíóúç'\-]+\.?$|^[A-ZÄÖÜ]\.$|^[A-ZÄÖÜ][a-zäöüß]+-[A-ZÄÖÜ][a-zäöüß]+$/.test(w) || PARTICLE.test(w))) {
        // auch Namen in Großbuchstaben zulassen, mit Abzug
        if (!core.every(w => /^[A-ZÄÖÜ][A-ZÄÖÜß'\-]+\.?$/.test(w) || PARTICLE.test(w))) continue;
      }
      let score = 0;
      if (JOB.test(g.s)) score -= 6;
      if (COMPANY.test(g.s)) score -= 6;
      if (STREET.test(g.s)) score -= 3;
      const f = fold(core.join(' '));
      const fw = f.split(/[\s\-]+/);
      local.forEach(t => { if (fw.some(w => w.replace(/\./g, '') === t)) score += 5; else if (t.length <= 2 && fw.some(w => w[0] === t[0])) score += 1; });
      if (out.email && local.length === 1 && f.replace(/\s/g, '').includes(local[0])) score += 3;
      if (words.some(w => PREFIX.test(w))) score += 3;
      score += Math.max(0, 3 - g.li);
      if (core.every(w => w === w.toUpperCase())) score -= 1;
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (best) {
      best.used = true;
      const raw = best.s.split(',');
      const words = raw[0].split(/\s+/).filter(Boolean);
      const after = raw.slice(1).join(',').trim();
      const pre = [], suf = [], core = [];
      words.forEach(w => (PREFIX.test(w) && !core.length ? pre : SUFFIX.test(w) ? suf : core).push(w));
      if (after) suf.push(after);
      // Nachname = letztes Wort plus vorangestellte Partikel (von, van, de …)
      let cut = core.length - 1;
      while (cut > 1 && PARTICLE.test(core[cut - 1])) cut--;
      const cap = w => (w === w.toUpperCase() && w.length > 2 ? w.charAt(0) + w.slice(1).toLowerCase().replace(/-(.)/g, (_, c) => '-' + c.toUpperCase()) : w);
      out.first = core.slice(0, cut).map(cap).join(' ');
      out.last = core.slice(cut).map(w => (PARTICLE.test(w) ? w.toLowerCase() : cap(w))).join(' ');
      out.prefix = pre.join(' ').replace(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)\s*/i, '');
      out.suffix = suf.join(' ');
    } else if (local.length >= 2) {
      const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
      out.first = cap(local[0]);
      out.last = cap(local[local.length - 1]);
    }

    // Position
    for (const g of segs) {
      if (!g.used && JOB.test(g.s) && !/@|\d{4,}/.test(g.s)) {
        const same = segs.filter(h => h.li === g.li && !h.used && !/@|\d{4,}/.test(h.s));
        same.forEach(h => { h.used = true; });
        out.title = same.map(h => h.s).join(', ');
        break;
      }
    }

    // Firma notfalls aus der E-Mail-Domain ableiten
    if (!out.org && out.email) {
      const dom = out.email.split('@')[1];
      if (!FREEMAIL.test(dom)) {
        const base = dom.split('.').slice(-2, -1)[0];
        const hit = segs.find(g => !g.used && fold(g.s).replace(/[^a-z0-9]/g, '').includes(base.replace(/[^a-z0-9]/g, '')));
        if (hit) { out.org = hit.s; hit.used = true; }
      }
    }
    if (!out.url && out.email) {
      const dom = out.email.split('@')[1];
      if (!FREEMAIL.test(dom)) out.url = 'www.' + dom.toLowerCase();
    }
    return out;
  }

  // vCard-Text (z. B. aus einem QR-Code) in dieselben Felder übernehmen
  function parseVCard(text) {
    const out = parse('');
    const raw = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    for (const line of raw) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i).toUpperCase();
      const val = line.slice(i + 1);
      const name = head.split(';')[0].replace(/^ITEM\d+\./, '');
      const parts = val.split(/(?<!\\);/).map(unesc);
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

  const api = { parse, parseVCard, buildVCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VK = api;
})(this);
