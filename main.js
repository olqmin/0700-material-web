const API_URL = 'https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts';

const searchInput = document.getElementById('searchInput');
const callList = document.getElementById('callList');
const statusMessage = document.getElementById('statusMessage');

let contacts = [];

function escapeHtml(value) {
  return value
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

function normalizeContact(raw, index) {
  const name = pick(raw, ['name', 'fullName', 'displayName', 'contactName']) || `Contact ${index + 1}`;
  const phone = pick(raw, ['phone', 'phoneNumber', 'number', 'mobile', 'mobilePhone', 'telephone']);
  const paidPhone = pick(raw, ['paidPhone', 'paid_number', 'paidNumber', 'secondaryPhone', 'paid']);
  const logo = pick(raw, ['logo', 'avatar', 'image', 'photo', 'profileImage']);

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

  const avatar = contact.logo
    ? `<img class="avatar-image" src="${encodeURI(contact.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span>${escapeHtml(initials(contact.name))}</span>`;

  const paidPhoneLine = contact.paidPhone
    ? `<p class="meta"><span class="material-symbols-rounded">paid</span> Paid: ${safePaidPhone}</p>`
    : '';

  return `
    <li class="call-item" data-name="${escapeHtml(contact.name.toLowerCase())}" data-phone="${escapeHtml((contact.phone || '').toLowerCase())}" data-paid="${escapeHtml((contact.paidPhone || '').toLowerCase())}">
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

    const payload = await response.json();
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
