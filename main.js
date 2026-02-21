const API_URL = 'https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts';
const LOGO_BASE_URL = 'https://admin.0700bezplatnite.com';
const FAVICON_SERVICE = 'https://www.google.com/s2/favicons?sz=128&domain_url=';
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

const searchInput = document.getElementById('searchInput');
const callList = document.getElementById('callList');
const statusMessage = document.getElementById('statusMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const topAppBar = document.querySelector('.top-app-bar');

const mobileSearchMedia = window.matchMedia('(max-width: 768px) and (hover: none) and (pointer: coarse)');

const prefersBulgarian = (navigator.language || navigator.languages?.[0] || '').toLowerCase().startsWith('bg');

function searchLabelText(count) {
  const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
  if (prefersBulgarian) {
    return `Търсене в ${safeCount} контакта`;
  }
  return `Search in ${safeCount} contacts`;
}

function updateSearchCopy(count) {
  if (!searchInput) return;
  const label = searchLabelText(count);
  searchInput.label = label;
  searchInput.setAttribute('aria-label', label);
}


function loadingCopyText() {
  return prefersBulgarian ? 'Зареждане на контакти…' : 'Loading contacts…';
}

function setLoadingState(isLoading) {
  document.body.classList.toggle('app-loading', Boolean(isLoading));
  if (loadingText) loadingText.textContent = loadingCopyText();
  if (loadingOverlay) loadingOverlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}

function isLikelyMobileDevice() {
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const iPadLikeTouch = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return mobileUa || iPadLikeTouch;
}

const mobileDevice = isLikelyMobileDevice();
document.body.classList.toggle('is-mobile-device', mobileDevice);

function setMobileSearchActive(isActive) {
  document.body.classList.toggle('mobile-search-active', Boolean(isActive && mobileSearchMedia.matches && mobileDevice));
}

let mobileSearchOpenedAt = 0;
let suppressRowClickUntil = 0;
let mobileSearchCloseRequested = false;

function markMobileSearchOpened() {
  mobileSearchOpenedAt = Date.now();
  setMobileSearchActive(true);
}

function closeMobileSearch() {
  mobileSearchCloseRequested = true;
  const internalInput = searchInput?.shadowRoot?.querySelector('input, textarea');
  internalInput?.blur();
  searchInput?.blur();
  setMobileSearchActive(false);
}

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

function pickFirst(raw, keys) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value !== null && value !== undefined && `${value}`.trim() !== '') {
      return `${value}`.trim();
    }
  }
  return '';
}

function getMimeType(contentType = '') {
  return `${contentType}`.split(';')[0].trim().toLowerCase();
}

function parseJsonPayload(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
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

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  const secure = withProtocol.replace(/^http:\/\//i, 'https://');
  return `${FAVICON_SERVICE}${encodeURIComponent(secure)}`;
}

function normalizeContact(raw, index) {
  const name = pickFirst(raw, ['name', 'fullName', 'displayName', 'contactName']) || `Contact ${index + 1}`;
  const phone = pickFirst(raw, ['phone', 'phoneNumber', 'number', 'mobile', 'telephone']);
  const paidPhone = pickFirst(raw, ['paidPhone', 'paid_number', 'paidNumber', 'secondaryPhone']);

  const explicitLogoRaw = pickFirst(raw, ['logoUrl', 'logo', 'image', 'avatar', 'photo', 'profileImage']);
  const website = pickFirst(raw, ['website', 'url', 'site']);
  const logo = normalizeLogoUrl(explicitLogoRaw) || fallbackLogoFromWebsite(website);

  debugLog('contact-normalized', {
    name,
    phone,
    paidPhone,
    explicitLogoRaw,
    logo,
  });

  return { name, phone, paidPhone, logo };
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function toTelHref(phone) {
  const raw = `${phone || ''}`.trim();
  if (!raw) return 'tel:';
  const normalized = raw.replace(/[^\d+#*;,]/g, '');
  return `tel:${normalized}`;
}

function contactRowTemplate(contact) {
  const safeName = escapeHtml(contact.name);
  const safePhone = escapeHtml(contact.phone || 'No phone number');
  const safePaidPhone = escapeHtml(contact.paidPhone || '');

  const safeNameLower = escapeHtml(contact.name.toLowerCase());
  const safePhoneLower = escapeHtml((contact.phone || '').toLowerCase());
  const safePaidLower = escapeHtml((contact.paidPhone || '').toLowerCase());
  const telHref = escapeHtml(toTelHref(contact.phone));

  const avatar = contact.logo
    ? `<img class="avatar-image" src="${encodeURI(contact.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.textContent='${escapeHtml(initials(contact.name))}';" />`
    : `<span>${escapeHtml(initials(contact.name))}</span>`;

  const paidPhoneLine = contact.paidPhone
    ? `<p class="meta"><span class="material-symbols-rounded">paid</span> Paid: ${safePaidPhone}</p>`
    : '';

  return `
    <li>
      <a class="call-item" href="${telHref}" data-name="${safeNameLower}" data-phone="${safePhoneLower}" data-paid="${safePaidLower}" aria-label="Call ${safeName}">
        <div class="avatar">${avatar}</div>
        <div class="details">
          <p class="name">${safeName}</p>
          <p class="meta"><span class="material-symbols-rounded">call</span> ${safePhone}</p>
          ${paidPhoneLine}
        </div>
        <span class="icon-action" aria-hidden="true"><span class="material-symbols-rounded">phone_forwarded</span></span>
      </a>
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
    setLoadingState(true);
    debugLog('load-start', { url: API_URL });

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        Accept: '*/*',
      },
    });

    const contentType = getMimeType(response.headers.get('content-type') || '');

    debugLog('load-response', {
      ok: response.ok,
      status: response.status,
      contentType,
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const responseText = await response.text();
    debugLog('load-text-preview', {
      firstChars: responseText.slice(0, 240),
      length: responseText.length,
    });

    const payload = parseJsonPayload(responseText);
    const list = asList(payload);

    debugLog('payload-shape', {
      listCount: list.length,
      sampleKeys: Object.keys(list[0] || {}),
      sampleName: pickFirst(list[0], ['name', 'fullName', 'displayName', 'contactName']),
    });

    contacts = list.map(normalizeContact);
    updateSearchCopy(contacts.length);
    renderContacts(contacts);
  } catch (error) {
    console.error('[DialerDebug] load-failed', error);
    contacts = [];
    updateSearchCopy(0);
    renderContacts([]);
    statusMessage.textContent = 'Could not load contacts from API. Check CORS/network and try again.';
    statusMessage.hidden = false;
  } finally {
    setLoadingState(false);
  }
}

searchInput?.addEventListener('input', (event) => {
  filterContacts(event.target?.value || '');
});


searchInput?.addEventListener('focusin', () => {
  if (!mobileSearchMedia.matches || !mobileDevice) return;
  mobileSearchCloseRequested = false;
  markMobileSearchOpened();
});

searchInput?.addEventListener('focusout', () => {
  if (!mobileSearchMedia.matches || !mobileDevice) return;

  if (mobileSearchCloseRequested) {
    mobileSearchCloseRequested = false;
    return;
  }

  markMobileSearchOpened();
});

searchInput?.addEventListener('pointerdown', (event) => {
  if (!mobileSearchMedia.matches || !mobileDevice) return;

  event.stopPropagation();

  mobileSearchCloseRequested = false;

  const now = Date.now();
  suppressRowClickUntil = now + 900;
});

searchInput?.addEventListener('click', (event) => {
  if (!mobileSearchMedia.matches || !mobileDevice) return;
  event.stopPropagation();

  if (searchInput.matches(':focus-within')) return;

  const internalInput = searchInput.shadowRoot?.querySelector('input, textarea');
  internalInput?.focus();
  searchInput.focus();
  markMobileSearchOpened();
});

document.addEventListener('click', (event) => {
  if (!mobileSearchMedia.matches || !mobileDevice) return;
  if (!document.body.classList.contains('mobile-search-active')) return;

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const clickedSearchArea = path.includes(searchInput) || path.includes(topAppBar) || topAppBar?.contains(event.target);
  if (clickedSearchArea) return;

  const stillFocused = searchInput?.matches(':focus-within');
  if (stillFocused) return;

  const justOpened = Date.now() - mobileSearchOpenedAt < 500;
  if (justOpened) return;

  closeMobileSearch();
});

mobileSearchMedia.addEventListener('change', () => {
  if (!mobileSearchMedia.matches || !mobileDevice) {
    setMobileSearchActive(false);
  }
});


callList?.addEventListener('click', (event) => {
  if (Date.now() <= suppressRowClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
});

callList?.addEventListener('pointerdown', (event) => {
  const row = event.target.closest('.call-item');
  if (!row) return;

  const bounds = row.getBoundingClientRect();
  const diameter = Math.max(bounds.width, bounds.height);
  const ripple = document.createElement('span');
  ripple.className = 'row-ripple';
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${event.clientX - bounds.left - diameter / 2}px`;
  ripple.style.top = `${event.clientY - bounds.top - diameter / 2}px`;

  row.querySelector('.row-ripple')?.remove();
  row.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
});

updateSearchCopy(0);
setLoadingState(true);
loadContacts();
