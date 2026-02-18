const searchInput = document.getElementById('searchInput');
const callItems = Array.from(document.querySelectorAll('.call-item'));

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
  const inputEl = event.target;
  const value = inputEl?.value || '';
  filterCalls(value);
});
