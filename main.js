const API_URL = 'https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts';
const LOGO_BASE_URL = 'https://admin.0700bezplatnite.com';
const FAVICON_SERVICE = 'https://www.google.com/s2/favicons?sz=128&domain_url=';

const searchInput = document.getElementById('searchInput');
const callList = document.getElementById('callList');
const statusMessage = document.getElementById('statusMessage');

let contacts = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.contacts)) return payload.contacts;
  return [];
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9а-я]/gi, '');
}

function normalizeLogoUrl(logo) {
  const raw = `${logo || ''}`.trim();
  if (!raw) return '';

  const srcMatch = raw.match(/src\s*=\s*['\"]([^'\"]+)['\"]/i);
  const urlMatch = raw.match(/(https?:\/\/[^\s"'>]+|\/logos\/[^\s"'>]+)/i);
  const value = (srcMatch?.[1] || urlMatch?.[1] || raw).trim();

  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  if (value.startsWith('/')) return `${LOGO_BASE_URL}${value}`;
  if (!/^https?:\/\//i.test(value)) return `${LOGO_BASE_URL}/${value.replace(/^\/+/, '')}`;
  return value.replace(/^http:\/\//i, 'https://');
}

function decodeLatin1BytesAsUtf8(text) {
  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function decodeUtf8BytesAsCp1251(text) {
  try {
    const bytes = new TextEncoder().encode(text);
    return new TextDecoder('windows-1251', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function textQuality(text) {
  const value = `${text || ''}`;
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const digits = (value.match(/[0-9]/g) || []).length;
  const spaces = (value.match(/\s/g) || []).length;
  const replacement = (value.match(/�/g) || []).length;
  const questions = (value.match(/\?/g) || []).length;
  const mojibake = (value.match(/[ÐÑÃÂ]/g) || []).length;

  return cyrillic * 6 + latin * 1.2 + digits + spaces * 0.4 - replacement * 10 - questions * 6 - mojibake * 5;
}

function repairTextMojibake(value) {
  const input = `${value ?? ''}`.trim();
  if (!input) return '';

  const variants = [
    input,
    decodeLatin1BytesAsUtf8(input),
    decodeUtf8BytesAsCp1251(input),
    decodeLatin1BytesAsUtf8(decodeUtf8BytesAsCp1251(input)),
    decodeUtf8BytesAsCp1251(decodeLatin1BytesAsUtf8(input)),
  ];

  return variants.reduce((best, candidate) => (textQuality(candidate) > textQuality(best) ? candidate : best), input);
}

function collectLeafStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = `${value}`.trim();
    if (text) out.push(text);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectLeafStrings(item, out);
    return out;
  }

  if (typeof value === 'object') {
    for (const nested of Object.values(value)) collectLeafStrings(nested, out);
  }

  return out;
}

function collectAliasCandidates(raw, aliases) {
  const aliasKeys = aliases.map(normalizeKey);
  const candidates = [];

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 4) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const normalized = normalizeKey(key);
      const matched = aliasKeys.some((alias) => normalized === alias || normalized.includes(alias));

      if (matched) {
        const values = collectLeafStrings(value).map(repairTextMojibake);
        candidates.push(...values);
      }

      if (value && typeof value === 'object') {
        walk(value, depth + 1);
      }
    }
  }

  walk(raw);
  return candidates;
}

function bestTextCandidate(candidates, fallback = '') {
  if (!candidates.length) return fallback;

  const ranked = [...new Set(candidates)]
    .map((value) => ({ value, score: textQuality(value) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.value || fallback;
}

function bestPhoneCandidate(candidates) {
  const cleaned = [...new Set(candidates)]
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!cleaned.length) return '';

  cleaned.sort((a, b) => (b.match(/[0-9]/g) || []).length - (a.match(/[0-9]/g) || []).length);
  return cleaned[0];
}

function bestLogoCandidate(candidates) {
  const cleaned = [...new Set(candidates)].map(normalizeLogoUrl).filter(Boolean);
  if (!cleaned.length) return '';

  function logoScore(url) {
    let score = 0;
    if (url.startsWith('https://')) score += 5;
    if (/\/logos\//i.test(url)) score += 8;
    if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url)) score += 4;
    if (/placeholder|default|no-image|nologo/i.test(url)) score -= 6;
    return score;
  }

  cleaned.sort((a, b) => logoScore(b) - logoScore(a));
  return cleaned[0];
}

function fallbackLogoFromWebsite(website) {
  const raw = `${website || ''}`.trim();
  if (!raw) return '';

  const fixed = raw.startsWith('http://') ? `https://${raw.slice(7)}` : raw;
  const safe = fixed.startsWith('https://') ? fixed : `https://${fixed.replace(/^\/+/, '')}`;
  return `${FAVICON_SERVICE}${encodeURIComponent(safe)}`;
}

function pickName(raw, index) {
  const name = bestTextCandidate(collectAliasCandidates(raw, [
    'name', 'fullname', 'displayname', 'contactname', 'title', 'companyname', 'firmname', 'ime', 'naimenovanie',
  ]));

  return name || `Contact ${index + 1}`;
}

function pickPhone(raw) {
  return bestPhoneCandidate(collectAliasCandidates(raw, [
    'phone', 'phonenumber', 'number', 'mobile', 'mobilephone', 'telephone', 'tel', 'gsm', 'mainphone', 'contactphone',
  ]));
}

function pickPaidPhone(raw, mainPhone) {
  const paid = bestPhoneCandidate(collectAliasCandidates(raw, [
    'paidphone', 'paidnumber', 'paid', 'secondaryphone', 'servicephone', 'pricephone', 'platen', 'platennomer',
  ]));

  if (!paid) return '';
  if (mainPhone && paid.replace(/\D/g, '') === mainPhone.replace(/\D/g, '')) return '';
  return paid;
}

function pickLogo(raw) {
  const explicitLogo = bestLogoCandidate(collectAliasCandidates(raw, [
    'logo', 'avatar', 'image', 'photo', 'profileimage', 'img', 'icon', 'picture', 'thumbnail', 'logourl', 'logoimage',
  ]));

  if (explicitLogo) return explicitLogo;

  const website = bestTextCandidate(collectAliasCandidates(raw, ['website', 'url', 'site']));
  return fallbackLogoFromWebsite(website);
}

function normalizeContact(raw, index) {
  const name = pickName(raw, index);
  const phone = pickPhone(raw);

  return {
    name,
    phone,
    paidPhone: pickPaidPhone(raw, phone),
    logo: pickLogo(raw),
  };
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function parseJsonText(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function payloadQuality(payload) {
  const list = asList(payload).slice(0, 50);
  if (!list.length) return -100000;

  let score = 0;
  for (const item of list) {
    const name = pickName(item, 0);
    const phone = pickPhone(item);
    const paid = pickPaidPhone(item, phone);
    const logo = pickLogo(item);
    score += textQuality(`${name} ${phone} ${paid}`);
    if (logo) score += 4;
  }

  return score;
}

function tryDecode(buffer, charset) {
  const parsed = parseJsonText(new TextDecoder(charset).decode(buffer));
  return { parsed, charset, score: payloadQuality(parsed) };
}

function decodeJsonPayload(buffer, contentType = '') {
  const declaredCharset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const charsets = [declaredCharset, 'utf-8', 'windows-1251', 'koi8-r', 'iso-8859-1'].filter(Boolean);

  const attempts = [];
  const seen = new Set();

  for (const charset of charsets) {
    if (seen.has(charset)) continue;
    seen.add(charset);

    try {
      attempts.push(tryDecode(buffer, charset));
    } catch {
      // skip unsupported/invalid decode candidate
    }
  }

  if (!attempts.length) {
    throw new Error('Unable to decode contacts payload as JSON.');
  }

  attempts.sort((a, b) => b.score - a.score);
  return attempts[0].parsed;
}

function contactRowTemplate(contact) {
  const safeName = escapeHtml(contact.name);
  const safePhone = escapeHtml(contact.phone || 'No phone number');
  const safePaidPhone = escapeHtml(contact.paidPhone || '');
  const safeNameLower = escapeHtml(contact.name.toLowerCase());
  const safePhoneLower = escapeHtml((contact.phone || '').toLowerCase());
  const safePaidLower = escapeHtml((contact.paidPhone || '').toLowerCase());

  const avatar = contact.logo
    ? `<img class="avatar-image" src="${encodeURI(contact.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.textContent='${escapeHtml(initials(contact.name))}';" />`
    : `<span>${escapeHtml(initials(contact.name))}</span>`;

  const paidPhoneLine = contact.paidPhone
    ? `<p class="meta"><span class="material-symbols-rounded">paid</span> Paid: ${safePaidPhone}</p>`
    : '';

  return `
    <li class="call-item" data-name="${safeNameLower}" data-phone="${safePhoneLower}" data-paid="${safePaidLower}">
      <div class="avatar">${avatar}</div>
      <div class="details">
        <p class="name">${safeName}</p>
        <p class="meta"><span class="material-symbols-rounded">call</span> ${safePhone}</p>
        ${paidPhoneLine}
      </div>
      <button class="icon-action" aria-label="Call ${safeName}"><span class="material-symbols-rounded">phone_forwarded</span></button>
    </li>
  `;
}

function renderContacts(list) {
  if (!list.length) {
    callList.innerHTML = '';
    statusMessage.textContent = 'No contacts available.';
    statusMessage.hidden = false;
    return;
  }

  statusMessage.hidden = true;
  callList.innerHTML = list.map(contactRowTemplate).join('');
}

function filterContacts(query) {
  const normalized = query.trim().toLowerCase();
  const rows = callList.querySelectorAll('.call-item');

  let visibleCount = 0;

  for (const row of rows) {
    const haystack = `${row.dataset.name || ''} ${row.dataset.phone || ''} ${row.dataset.paid || ''}`;
    const visible = !normalized || haystack.includes(normalized);
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  }

  if (!normalized) {
    statusMessage.hidden = true;
    return;
  }

  if (visibleCount === 0) {
    statusMessage.textContent = 'No contacts match your search.';
    statusMessage.hidden = false;
  } else {
    statusMessage.hidden = true;
  }
}

async function loadContacts() {
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '';
    const payload = decodeJsonPayload(bytes, contentType);

    contacts = asList(payload).map(normalizeContact);
    renderContacts(contacts);
  } catch (error) {
    console.error(error);
    contacts = [];
    renderContacts([]);
    statusMessage.textContent = 'Could not load contacts from API. Check CORS/network and try again.';
    statusMessage.hidden = false;
  }
}

searchInput?.addEventListener('input', (event) => {
  filterContacts(event.target?.value || '');
});

loadContacts();
