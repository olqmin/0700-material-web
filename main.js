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

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      return `${value}`.trim();
    }
  }
  return '';
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.contacts)) return payload.contacts;
  return [];
}

function normalizeLogoUrl(logo) {
  const value = `${logo || ''}`.trim();
  if (!value) return '';

  if (value.startsWith('//')) {
    return `https:${value}`;
  }

  if (value.startsWith('http://')) {
    return `https://${value.slice('http://'.length)}`;
  }

  if (value.startsWith('/')) {
    return `${LOGO_BASE_URL}${value}`;
  }

  if (!/^https?:\/\//i.test(value)) {
    return `${LOGO_BASE_URL}/${value.replace(/^\/+/, '')}`;
  }

  return value;
}

function normalizeContact(raw, index) {
  const name = pick(raw, ['name', 'fullName', 'displayName', 'contactName']) || `Contact ${index + 1}`;
  const phone = pick(raw, ['phone', 'phoneNumber', 'number', 'mobile', 'mobilePhone', 'telephone']);
  const paidPhone = pick(raw, ['paidPhone', 'paid_number', 'paidNumber', 'secondaryPhone', 'paid']);
  const logoRaw = pick(raw, ['logo', 'avatar', 'image', 'photo', 'profileImage']);

  return {
    name,
    phone,
    paidPhone,
    logo: normalizeLogoUrl(logoRaw),
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
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/[0-9]/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const replacement = (text.match(/�/g) || []).length;
  // Penalize obvious decoding artifacts heavily.
  return cyrillic * 4 + latin + digits - questions * 3 - replacement * 6;
}

function payloadQuality(payload) {
  const list = asList(payload).slice(0, 40);
  if (!list.length) return -100000;

  let score = 0;
  for (const item of list) {
    const name = pick(item, ['name', 'fullName', 'displayName', 'contactName']);
    const phone = pick(item, ['phone', 'phoneNumber', 'number', 'mobile', 'mobilePhone', 'telephone']);
    score += textQuality(`${name} ${phone}`);
  }
  return score;
}

function tryDecode(buffer, charset) {
  const text = new TextDecoder(charset).decode(buffer);
  const parsed = parseJsonText(text);
  return { parsed, score: payloadQuality(parsed), charset };
}

function decodeJsonPayload(buffer, contentType = '') {
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  const declaredCharset = charsetMatch?.[1]?.trim().toLowerCase();

  const candidates = [];
  const seen = new Set();

  function addCandidate(charset) {
    if (!charset || seen.has(charset)) return;
    seen.add(charset);
    try {
      candidates.push(tryDecode(buffer, charset));
    } catch {
      // ignore failed decode/parse candidates
    }
  }

  addCandidate(declaredCharset);
  addCandidate('utf-8');
  addCandidate('windows-1251');
  addCandidate('iso-8859-1');

  if (!candidates.length) {
    throw new Error('Unable to decode contacts payload as JSON.');
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].parsed;
}

function contactRowTemplate(contact) {
  const safeName = escapeHtml(contact.name);
  const safePhone = escapeHtml(contact.phone || 'No phone number');
  const safePaidPhone = escapeHtml(contact.paidPhone || '');
  const safeNameLower = escapeHtml(contact.name.toLowerCase());
  const safePhoneLower = escapeHtml((contact.phone || '').toLowerCase());
  const safePaidLower = escapeHtml((contact.paidPhone || '').toLowerCase());

  const avatar = contact.logo
    ? `<img class="avatar-image" src="${encodeURI(contact.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
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
