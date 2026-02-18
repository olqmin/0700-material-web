const searchInput = document.getElementById('searchInput');
const callItems = Array.from(document.querySelectorAll('.call-item'));
const navItems = Array.from(document.querySelectorAll('.nav-item'));

function filterCalls(query) {
  const normalized = query.trim().toLowerCase();

  for (const item of callItems) {
    const name = (item.dataset.name || '').toLowerCase();
    const meta = (item.dataset.meta || '').toLowerCase();
    const visible = !normalized || name.includes(normalized) || meta.includes(normalized);
    item.hidden = !visible;
  }
}

searchInput?.addEventListener('input', (event) => {
  filterCalls(event.target.value || '');
});

for (const navItem of navItems) {
  navItem.addEventListener('click', () => {
    for (const item of navItems) {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    }

    navItem.classList.add('active');
    navItem.setAttribute('aria-current', 'page');
  });
}
