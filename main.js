const root = document.documentElement;
const nameInput = document.getElementById('nameInput');
const greetBtn = document.getElementById('greetBtn');
const toggleThemeBtn = document.getElementById('toggleThemeBtn');
const message = document.getElementById('message');

const storedTheme = localStorage.getItem('theme');
if (storedTheme === 'dark') {
  root.classList.add('dark');
}

greetBtn?.addEventListener('click', () => {
  const name = (nameInput?.value || '').trim();
  message.textContent = name
    ? `Welcome, ${name}! Your Material Web starter is ready.`
    : 'Please type your name first.';
});

toggleThemeBtn?.addEventListener('click', () => {
  root.classList.toggle('dark');
  localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
});
