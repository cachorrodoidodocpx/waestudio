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

const PORTFOLIO = [
  ['casamento', 'Casamentos', 'Celebração'],
  ['gestante', 'Gestante', 'Esperando você'],
  ['bebe-reborn', 'Baby Reborn', 'Detalhes'],
  ['infantil', 'Infantil', 'Acompanhamento'],
  ['familia', 'Família', 'Afeto'],
  ['ensaios', 'Ensaios', 'Retratos'],
  ['natal', 'Natal', 'Especial'],
  ['datas-especiais', 'Datas Especiais', 'Momentos']
];
const LOCAL_FALLBACK = {
  // Manifesto local gerado a partir das fotos recebidas.
  casamento: [], 'bebe-reborn': [], natal: [],
  gestante: [1,2,3,4].map(i => `assets/portfolio/gestante/${String(i).padStart(2,'0')}.webp`),
  infantil: [1,2,3,4,5,6].map(i => `assets/portfolio/infantil/${String(i).padStart(2,'0')}.webp`),
  familia: [1,2,3,4].map(i => `assets/portfolio/familia/${String(i).padStart(2,'0')}.webp`),
  ensaios: [1,2,3,4].map(i => `assets/portfolio/ensaios/${String(i).padStart(2,'0')}.webp`),
  'datas-especiais': [1,2,3,4].map(i => `assets/portfolio/datas-especiais/${String(i).padStart(2,'0')}.webp`)
};

const gallery = document.getElementById('gallery');
const galleryEmpty = document.getElementById('gallery-empty');

function makeGalleryItem(category, title, subtitle, image, position) {
  const item = document.createElement('a');
  const variants = ['tall', '', '', 'wide', '', 'tall', '', 'wide'];
  item.className = `gallery-item ${variants[position % variants.length]}`.trim();
  item.dataset.cat = category;
  item.href = '#contato';
  item.innerHTML = `<img src="${image}" alt="${title} — fotografia WA Estúdio" loading="lazy" /><span class="gallery-meta"><b>${title}</b><small>${subtitle}</small></span>`;
  item.addEventListener('click', e => {
    const msg = encodeURIComponent(`Olá WA Estúdio! Vi o portfólio de ${title} e gostaria de saber mais.`);
    item.href = `https://wa.me/5548991868509?text=${msg}`;
    item.target = '_blank';
  }, { once: true });
  return item;
}

async function getRemoteGallery() {
  try {
    const response = await fetch('/api/gallery', { cache: 'no-store' });
    if (!response.ok) throw new Error('API offline');
    const data = await response.json();
    return data.categories || {};
  } catch {
    return null;
  }
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
  gallery.innerHTML = '';
  let total = 0;
  let position = 0;
  for (const [folder, title, subtitle] of PORTFOLIO) {
    const images = remote?.[folder]?.length
      ? remote[folder].map(key => `/media/${encodeURIComponent(key).replace(/%2F/g, '/')}`)
      : (LOCAL_FALLBACK[folder] || []);
    images.forEach(src => {
      gallery.appendChild(makeGalleryItem(folder, title, subtitle, src, position++));
      total++;
    });
  }
  galleryEmpty.hidden = total > 0;
  setupFilters();
}

buildGallery();
document.getElementById('year').textContent = new Date().getFullYear();

const heroImage = document.querySelector('.hero-media img');
window.addEventListener('scroll', () => {
  if (!heroImage || window.innerWidth < 700) return;
  const y = Math.min(window.scrollY * .08, 55);
  heroImage.style.transform = `scale(1.02) translateY(${y}px)`;
}, { passive: true });
