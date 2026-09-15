const menuButton = document.querySelector('.menu-button');
const header = document.querySelector('.site-header');
const navLinks = document.querySelectorAll('.main-nav a');
menuButton?.addEventListener('click', () => {
  const active = header.classList.toggle('menu-active');
  menuButton.setAttribute('aria-expanded', active ? 'true' : 'false');
  document.body.classList.toggle('nav-open', active);
});
navLinks.forEach(link => link.addEventListener('click', () => {
  header.classList.remove('menu-active');
  document.body.classList.remove('nav-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));

const gallery = document.getElementById('gallery');
const galleryEmpty = document.getElementById('gallery-empty');
let portfolioCategories = [];

function makeGalleryItem(category, image, position) {
  const item = document.createElement('a');
  const variants = ['tall', '', '', 'wide', '', 'tall', '', 'wide'];
  item.className = `gallery-item ${variants[position % variants.length]}`.trim();
  item.dataset.cat = category.slug;
  item.href = '#contato';
  item.innerHTML = `<img src="${image}" alt="${category.name} — fotografia WA Estúdio" loading="lazy" /><span class="gallery-meta"><b>${category.name}</b><small>${category.subtitle || 'Momentos'}</small></span>`;
  item.addEventListener('click', () => {
    const msg = encodeURIComponent(`Olá WA Estúdio! Vi o portfólio de ${category.name} e gostaria de saber mais.`);
    item.href = `https://wa.me/5548991868509?text=${msg}`;
    item.target = '_blank';
  }, { once: true });
  return item;
}
async function getRemoteGallery() {
  try {
    const response = await fetch('/api/gallery', { cache: 'no-store' });
    if (!response.ok) throw new Error('API offline');
    return await response.json();
  } catch { return null; }
}
function renderFilters(categories) {
  const row = document.querySelector('.category-row');
  if (!row) return;
  row.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'filter active';
  all.dataset.filter = 'all';
  all.textContent = 'Todos';
  row.appendChild(all);
  categories.forEach(c => {
    const button = document.createElement('button');
    button.className = 'filter';
    button.dataset.filter = c.slug;
    button.textContent = c.name;
    row.appendChild(button);
  });
  setupFilters();
}
function setupFilters() {
  const filters = document.querySelectorAll('.filter');
  const items = document.querySelectorAll('.gallery-item');
  filters.forEach(filter => filter.addEventListener('click', () => {
    const value = filter.dataset.filter;
    filters.forEach(f => f.classList.remove('active'));
    filter.classList.add('active');
    items.forEach(item => item.classList.toggle('hide', value !== 'all' && item.dataset.cat !== value));
  }));
}
async function buildGallery() {
  const remote = await getRemoteGallery();
  if (!remote) return;
  portfolioCategories = remote.categories || [];
  gallery.innerHTML = '';
  let total = 0;
  let position = 0;
  for (const category of portfolioCategories) {
    const images = remote.images?.[category.slug] || [];
    images.forEach(src => { gallery.appendChild(makeGalleryItem(category, src, position++)); total++; });
  }
  galleryEmpty.hidden = total > 0;
  renderFilters(portfolioCategories);
}
buildGallery();
document.getElementById('year').textContent = new Date().getFullYear();
const heroImage = document.querySelector('.hero-media img');
window.addEventListener('scroll', () => {
  if (!heroImage || window.innerWidth < 700) return;
  const y = Math.min(window.scrollY * .08, 55);
  heroImage.style.transform = `scale(1.02) translateY(${y}px)`;
}, { passive: true });
