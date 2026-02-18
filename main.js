const API_URL = 'https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts';
const LOGO_BASE_URL = 'https://admin.0700bezplatnite.com';

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

function normalizeLogoUrl(logo) {
  const raw = `${logo || ''}`.trim();
  if (!raw) return '';

  const srcMatch = raw.match(/src\s*=\s*['\"]([^'\"]+)['\"]/i);
  const value = (srcMatch?.[1] || raw).trim();

  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  if (value.startsWith('/')) return `${LOGO_BASE_URL}${value}`;
  if (!/^https?:\/\//i.test(value)) return `${LOGO_BASE_URL}/${value.replace(/^\/+/, '')}`;
  return value.replace(/^http:\/\//i, 'https://');
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9а-я]/gi, '');
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

function pickByAliases(raw, aliases) {
  const aliasSet = new Set(aliases.map(normalizeKey));
  const candidates = [];

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 3) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const normalized = normalizeKey(key);
      if ([...aliasSet].some((alias) => normalized === alias || normalized.includes(alias))) {
        const values = collectLeafStrings(value);
        candidates.push(...values);
      }
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  }

  walk(raw, 0);

  return candidates.find((entry) => `${entry}`.trim() !== '') || '';
}

function pickName(raw, index) {
  return pickByAliases(raw, [
    'name', 'fullname', 'displayname', 'contactname', 'title', 'companyname', 'firmname', 'ime', 'naimenovanie',
  ]) || `Contact ${index + 1}`;
}

function pickPhone(raw) {
  return pickByAliases(raw, [
    'phone', 'phonenumber', 'number', 'mobile', 'mobilephone', 'telephone', 'tel', 'gsm', 'mainphone', 'contactphone',
  ]);
}

function pickPaidPhone(raw) {
  return pickByAliases(raw, [
    'paidphone', 'paidnumber', 'paid', 'secondaryphone', 'servicephone', 'pricephone', 'platen', 'platennomer',
  ]);
}

function pickLogo(raw) {
  return pickByAliases(raw, [
    'logo', 'avatar', 'image', 'photo', 'profileimage', 'img', 'icon', 'picture', 'thumbnail', 'logourl', 'logoimage',
  ]);
}

function normalizeContact(raw, index) {
  return {
    name: pickName(raw, index),
    phone: pickPhone(raw),
    paidPhone: pickPaidPhone(raw),
    logo: normalizeLogoUrl(pickLogo(raw)),
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

function textQuality(text) {
  const value = `${text || ''}`;
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const digits = (value.match(/[0-9]/g) || []).length;
  const replacement = (value.match(/�/g) || []).length;
  const questions = (value.match(/\?/g) || []).length;
  const mojibake = (value.match(/[ÐÑÃ]/g) || []).length;

  return cyrillic * 5 + latin + digits - replacement * 8 - questions * 4 - mojibake * 3;
}

function payloadQuality(payload) {
  const list = asList(payload).slice(0, 50);
  if (!list.length) return -100000;

  let score = 0;
  for (const item of list) {
    const name = pickName(item, 0);
    const phone = pickPhone(item);
    const logo = pickLogo(item);
    score += textQuality(`${name} ${phone} ${logo}`);
  }

  return score;
}

function tryDecode(buffer, charset) {
  const decoder = new TextDecoder(charset);
  const parsed = parseJsonText(decoder.decode(buffer));
  return { parsed, charset, score: payloadQuality(parsed) };
}

function decodeJsonPayload(buffer, contentType = '') {
  const declaredCharset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const charsets = [declaredCharset, 'utf-8', 'windows-1251', 'koi8-r', 'iso-8859-1'].filter(Boolean);

  const results = [];
  const seen = new Set();

  for (const charset of charsets) {
    if (seen.has(charset)) continue;
    seen.add(charset);
    try {
      results.push(tryDecode(buffer, charset));
    } catch {
      // skip decode candidate
    }
  }

  if (!results.length) {
    throw new Error('Unable to decode contacts payload as JSON.');
  }

  results.sort((a, b) => b.score - a.score);
  return results[0].parsed;
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
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    const bytes = await response.arrayBuffer();
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
