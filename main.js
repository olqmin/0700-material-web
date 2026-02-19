const API_URL = 'https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts';
const LOGO_BASE_URL = 'https://admin.0700bezplatnite.com';
const FAVICON_SERVICE = 'https://www.google.com/s2/favicons?sz=128&domain_url=';
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

const searchInput = document.getElementById('searchInput');
const callList = document.getElementById('callList');
const statusMessage = document.getElementById('statusMessage');

let contacts = [];

function debugLog(stage, details = {}) {
  if (!DEBUG) return;
  console.log(`[DialerDebug] ${stage}`, details);
}

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

function normalizeLogoUrl(input) {
  const raw = `${input || ''}`.trim();
  if (!raw) return '';

  const srcMatch = raw.match(/src\s*=\s*['\"]([^'\"]+)['\"]/i);
  const urlMatch = raw.match(/(https?:\/\/[^\s"'>]+|\/logos\/[^\s"'>]+)/i);
  const value = (srcMatch?.[1] || urlMatch?.[1] || raw).trim();

  if (!value) return '';
  let normalized = value;
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  else if (normalized.startsWith('http://')) normalized = `https://${normalized.slice('http://'.length)}`;
  else if (normalized.startsWith('/')) normalized = `${LOGO_BASE_URL}${normalized}`;
  else if (!/^https?:\/\//i.test(normalized)) normalized = `${LOGO_BASE_URL}/${normalized.replace(/^\/+/, '')}`;

  normalized = normalized.replace(/^http:\/\//i, 'https://');
  normalized = normalized.replace('://admin.0700bezplatnite.com:80/', '://admin.0700bezplatnite.com/');
  return normalized;
}

function fallbackLogoFromWebsite(website) {
  const raw = `${website || ''}`.trim();
  if (!raw) return '';

  const fixed = raw.startsWith('http://') ? `https://${raw.slice('http://'.length)}` : raw;
  const normalized = /^https?:\/\//i.test(fixed) ? fixed : `https://${fixed.replace(/^\/+/, '')}`;
  return `${FAVICON_SERVICE}${encodeURIComponent(normalized)}`;
}

function textQuality(text) {
  const value = `${text || ''}`;
  const cyrillicCount = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (value.match(/[A-Za-z]/g) || []).length;
  const digitCount = (value.match(/[0-9]/g) || []).length;
  const replacementCount = (value.match(/�/g) || []).length;
  const questionCount = (value.match(/\?/g) || []).length;
  const mojibakeCount = (value.match(/[ÐÑÃÂ]/g) || []).length;

  return cyrillicCount * 7 + latinCount + digitCount - replacementCount * 10 - questionCount * 6 - mojibakeCount * 5;
}

function parseJsonText(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
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

function repairTextMojibake(text) {
  const input = `${text || ''}`.trim();
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

function looksEncodingBroken(text) {
  const value = `${text || ''}`.trim();
  if (!value) return true;
  const questionCount = (value.match(/\?/g) || []).length;
  return questionCount >= 3 || questionCount / Math.max(value.length, 1) > 0.18;
}


function pickReadableName(raw, index) {
  const sourceName = pickFirst(raw, ['name', 'fullName', 'displayName', 'contactName']);
  const repairedName = repairTextMojibake(sourceName);

  if (!sourceName) {
    return `Contact ${index + 1}`;
  }

  return repairedName || sourceName;
}

function pickFirst(raw, keys) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value !== null && value !== undefined && `${value}`.trim() !== '') {
      return `${value}`.trim();
    }
  }
  return '';
}

function payloadQuality(payload) {
  const list = asList(payload).slice(0, 80);
  if (!list.length) return -100000;

  let score = 0;
  for (const row of list) {
    const name = pickFirst(row, ['name', 'fullName', 'displayName', 'contactName']);
    const phone = pickFirst(row, ['phone', 'phoneNumber', 'number', 'telephone']);
    const logo = pickFirst(row, ['logoUrl', 'logo', 'image', 'avatar']);
    score += textQuality(`${name} ${phone}`);
    if (logo) score += 2;
  }
  return score;
}

function tryDecode(buffer, charset) {
  const decoder = new TextDecoder(charset);
  const text = decoder.decode(buffer);
  const parsed = parseJsonText(text);
  const score = payloadQuality(parsed);
  const first = asList(parsed)[0] || {};
  const firstName = pickFirst(first, ['name', 'fullName', 'displayName', 'contactName']);

  debugLog('decode-attempt', {
    charset,
    score,
    firstName,
  });

  return { charset, score, parsed };
}

function decodeJsonPayload(buffer, contentType = '') {
  const declaredCharset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const charsets = [declaredCharset, 'utf-8', 'windows-1251', 'koi8-r', 'iso-8859-1'].filter(Boolean);

  const seen = new Set();
  const attempts = [];

  for (const charset of charsets) {
    if (seen.has(charset)) continue;
    seen.add(charset);

    try {
      attempts.push(tryDecode(buffer, charset));
    } catch (error) {
      debugLog('decode-attempt-failed', { charset, error: String(error) });
    }
  }

  if (!attempts.length) {
    throw new Error('Unable to decode contacts payload as JSON.');
  }

  attempts.sort((a, b) => b.score - a.score);
  debugLog('decode-selected', { charset: attempts[0].charset, score: attempts[0].score });
  return attempts[0].parsed;
}

function debugCharsetSamples(bytes) {
  if (!DEBUG) return;

  const sampleSets = ['utf-8', 'windows-1251', 'iso-8859-1', 'koi8-r'];
  for (const charset of sampleSets) {
    try {
      const text = new TextDecoder(charset).decode(bytes);
      const parsed = parseJsonText(text);
      const rows = asList(parsed).slice(0, 5);
      debugLog('charset-sample', {
        charset,
        names: rows.map((row) => pickFirst(row, ['name', 'fullName', 'displayName', 'contactName'])),
      });
    } catch (error) {
      debugLog('charset-sample-failed', { charset, error: String(error) });
    }
  }
}

function normalizeContact(raw, index) {
  const name = pickReadableName(raw, index);
  const phone = repairTextMojibake(pickFirst(raw, ['phone', 'phoneNumber', 'number', 'mobile', 'telephone']));
  const paidPhone = repairTextMojibake(pickFirst(raw, ['paidPhone', 'paid_number', 'paidNumber', 'secondaryPhone']));

  const explicitLogoRaw = pickFirst(raw, ['logoUrl', 'logo', 'image', 'avatar', 'photo', 'profileImage']);
  const website = pickFirst(raw, ['website', 'url', 'site']);
  const logo = normalizeLogoUrl(explicitLogoRaw) || fallbackLogoFromWebsite(website);

  debugLog('contact-normalized', {
    index,
    name,
    phone,
    paidPhone,
    explicitLogoRaw,
    website,
    finalLogo: logo,
  });

  return {
    name,
    phone,
    paidPhone,
    logo,
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
  debugLog('render-contacts', { count: list.length });

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

  debugLog('filter', { query: normalized, visibleCount });

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
    debugLog('load-start', { url: API_URL });

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain, */*' },
    });

    debugLog('load-response', {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '';
    const bytePreview = Array.from(new Uint8Array(bytes).slice(0, 80));

    debugLog('load-bytes', {
      byteLength: bytes.byteLength,
      preview: bytePreview,
    });

    debugCharsetSamples(bytes);
    const payload = decodeJsonPayload(bytes, contentType);
    const list = asList(payload);

    debugLog('payload-shape', {
      listCount: list.length,
      sampleKeys: Object.keys(list[0] || {}),
    });

    contacts = list.map(normalizeContact);
    renderContacts(contacts);
  } catch (error) {
    console.error('[DialerDebug] load-failed', error);
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
