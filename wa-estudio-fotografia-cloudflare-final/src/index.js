const COOKIE_NAME = "wa_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const DEFAULT_CATEGORIES = [
  { slug: "casamento", name: "Casamentos", subtitle: "Celebração", active: true },
  { slug: "gestante", name: "Gestante", subtitle: "Esperando você", active: true },
  { slug: "bebe-reborn", name: "Baby Reborn", subtitle: "Detalhes", active: true },
  { slug: "infantil", name: "Acompanhamento Infantil", subtitle: "Acompanhamento", active: true },
  { slug: "familia", name: "Família", subtitle: "Afeto", active: true },
  { slug: "ensaios", name: "Ensaios", subtitle: "Retratos", active: true },
  { slug: "natal", name: "Natal", subtitle: "Especial", active: true },
  { slug: "datas-especiais", name: "Datas Especiais", subtitle: "Momentos", active: true }
];
const CONFIG_KEY = "_config/site.json";
const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decodeBase64url(value) {
  let normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}
async function createSession(secret) {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return `${base64url(encoder.encode(payload))}.${base64url(await hmac(secret, payload))}`;
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const found = raw.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : null;
}
async function hasValidSession(request, secret) {
  if (!secret) return false;
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let payload, actual;
  try {
    payload = new TextDecoder().decode(decodeBase64url(parts[0]));
    actual = decodeBase64url(parts[1]);
  } catch { return false; }
  const timestamp = Number(payload.split(".", 1)[0]);
  if (!Number.isFinite(timestamp)) return false;
  if (Date.now() - timestamp > SESSION_TTL_MS) return false;
  if (timestamp > Date.now() + 60_000) return false;
  const expected = await hmac(secret, payload);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function cookieHeader(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}
function slugify(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
function safeFileName(value) {
  return String(value || "foto").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "foto";
}
function isSafePortfolioKey(key) {
  return key.startsWith("portfolio/") && !key.includes("..") && !key.includes("\\");
}
async function readConfig(env) {
  if (!env.MEDIA) return { managedMode: false, categories: DEFAULT_CATEGORIES.map(x => ({ ...x })) };
  const object = await env.MEDIA.get(CONFIG_KEY);
  if (!object) return { managedMode: false, categories: DEFAULT_CATEGORIES.map(x => ({ ...x })) };
  try {
    const data = await object.json();
    return {
      managedMode: Boolean(data.managedMode),
      categories: Array.isArray(data.categories) ? data.categories.filter(validCategory) : DEFAULT_CATEGORIES.map(x => ({ ...x }))
    };
  } catch {
    return { managedMode: false, categories: DEFAULT_CATEGORIES.map(x => ({ ...x })) };
  }
}
function validCategory(category) {
  return category && typeof category.slug === "string" && /^[a-z0-9-]{1,48}$/.test(category.slug) && typeof category.name === "string" && category.name.trim();
}
async function writeConfig(env, config) {
  await env.MEDIA.put(CONFIG_KEY, JSON.stringify(config), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
}
async function getLocalManifest(env, request) {
  try {
    const url = new URL("/assets/portfolio-manifest.json", request.url);
    const response = await env.ASSETS.fetch(new Request(url));
    if (!response.ok) return {};
    return await response.json();
  } catch { return {}; }
}
async function listR2Objects(env) {
  const result = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: "portfolio/", cursor, limit: 1000 });
    for (const object of page.objects) result.push({ key: object.key, size: object.size, uploaded: object.uploaded, source: "r2" });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}
async function handleGallery(env, request) {
  const config = await readConfig(env);
  const categories = {};
  for (const category of config.categories.filter(c => c.active !== false)) categories[category.slug] = [];

  if (config.managedMode && env.MEDIA) {
    const objects = await listR2Objects(env);
    for (const object of objects) {
      const relative = object.key.slice("portfolio/".length);
      const slash = relative.indexOf("/");
      if (slash < 1) continue;
      const category = relative.slice(0, slash);
      if (!categories[category]) continue;
      categories[category].push(`/media/${object.key.split("/").map(encodeURIComponent).join("/")}`);
    }
  } else {
    const manifest = await getLocalManifest(env, request);
    for (const category of config.categories.filter(c => c.active !== false)) {
      categories[category.slug] = (manifest[category.slug] || []).map(item => item.src);
    }
  }

  for (const key of Object.keys(categories)) categories[key].sort();
  return json({ managedMode: config.managedMode, categories: config.categories.filter(c => c.active !== false), images: categories });
}
async function handleMedia(request, env) {
  if (!env.MEDIA) return new Response("R2 não configurado", { status: 503 });
  let key;
  try { key = decodeURIComponent(new URL(request.url).pathname.slice("/media/".length)); } catch { return new Response("Not found", { status: 404 }); }
  if (!isSafePortfolioKey(key)) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
async function requireAdmin(request, env) {
  return hasValidSession(request, env.SESSION_SECRET);
}
async function importInitialAssets(env, request) {
  if (!env.MEDIA) throw new Error("R2 não configurado.");
  const config = await readConfig(env);
  const manifest = await getLocalManifest(env, request);
  const imported = [];
  for (const category of config.categories) {
    const entries = Array.isArray(manifest[category.slug]) ? manifest[category.slug] : [];
    for (const item of entries) {
      const localPath = new URL(`/${item.src}`, request.url);
      const response = await env.ASSETS.fetch(new Request(localPath));
      if (!response.ok) continue;
      const filename = item.src.split("/").pop() || "foto.webp";
      const ext = filename.split(".").pop()?.toLowerCase() || "webp";
      const key = `portfolio/${category.slug}/inicial-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      await env.MEDIA.put(key, response.body, { httpMetadata: { contentType: response.headers.get("Content-Type") || "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
      imported.push(key);
    }
  }
  await writeConfig(env, { ...config, managedMode: true });
  return imported;
}
async function deletePrefix(env, prefix) {
  let cursor;
  let count = 0;
  do {
    const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) {
      await env.MEDIA.delete(page.objects.map(o => o.key));
      count += page.objects.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return count;
}
async function handleAdmin(request, env) {
  if (request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ authenticated: false });
    if (!env.MEDIA) return json({ authenticated: true, objects: [], categories: DEFAULT_CATEGORIES, managedMode: false, error: "R2 não configurado." }, 503);
    const config = await readConfig(env);
    let objects = await listR2Objects(env);
    if (!config.managedMode) {
      const manifest = await getLocalManifest(env, request);
      for (const [slug, entries] of Object.entries(manifest)) {
        for (const item of Array.isArray(entries) ? entries : []) objects.push({ key: item.src, size: 0, uploaded: null, source: "local", category: slug });
      }
    }
    return json({ authenticated: true, objects, categories: config.categories, managedMode: config.managedMode });
  }

  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }

    if (body.action === "login") {
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Configure ADMIN_PASSWORD e SESSION_SECRET no Cloudflare." }, 503);
      if (String(body.password ?? "") !== env.ADMIN_PASSWORD) return json({ error: "Senha incorreta." }, 401);
      const token = await createSession(env.SESSION_SECRET);
      return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, token, 604800) });
    }
    if (body.action === "logout") return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
    if (!(await requireAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
    if (!env.MEDIA) return json({ error: "R2 não configurado." }, 503);

    if (body.action === "import-initial") {
      const imported = await importInitialAssets(env, request);
      return json({ ok: true, imported, managedMode: true });
    }
    if (body.action === "create-category") {
      const name = String(body.name || "").trim();
      const subtitle = String(body.subtitle || "").trim() || "Momentos";
      const slug = slugify(body.slug || name);
      if (!slug || !name) return json({ error: "Informe o nome da sessão." }, 400);
      const config = await readConfig(env);
      if (config.categories.some(c => c.slug === slug)) return json({ error: "Essa sessão já existe." }, 409);
      config.categories.push({ slug, name, subtitle, active: true });
      await writeConfig(env, { ...config, managedMode: true });
      return json({ ok: true, categories: config.categories });
    }
    if (body.action === "update-category") {
      const slug = String(body.slug || "");
      const config = await readConfig(env);
      const category = config.categories.find(c => c.slug === slug);
      if (!category) return json({ error: "Sessão não encontrada." }, 404);
      category.name = String(body.name || category.name).trim() || category.name;
      category.subtitle = String(body.subtitle || category.subtitle).trim() || category.subtitle;
      category.active = body.active !== false;
      await writeConfig(env, { ...config, managedMode: true });
      return json({ ok: true, categories: config.categories });
    }
    if (body.action === "move-category") {
      const slug = String(body.slug || "");
      const direction = body.direction === "up" ? -1 : 1;
      const config = await readConfig(env);
      const index = config.categories.findIndex(c => c.slug === slug);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= config.categories.length) return json({ ok: true, categories: config.categories });
      [config.categories[index], config.categories[next]] = [config.categories[next], config.categories[index]];
      await writeConfig(env, { ...config, managedMode: true });
      return json({ ok: true, categories: config.categories });
    }
    if (body.action === "delete-category") {
      const slug = String(body.slug || "");
      const config = await readConfig(env);
      if (!config.categories.some(c => c.slug === slug)) return json({ error: "Sessão não encontrada." }, 404);
      const removed = await deletePrefix(env, `portfolio/${slug}/`);
      config.categories = config.categories.filter(c => c.slug !== slug);
      await writeConfig(env, { ...config, managedMode: true });
      return json({ ok: true, removed, categories: config.categories });
    }
    if (body.action === "delete") {
      const key = String(body.key || "");
      if (!isSafePortfolioKey(key) || key.includes("/../")) return json({ error: "Arquivo inválido." }, 400);
      await env.MEDIA.delete(key);
      return json({ ok: true });
    }
    return json({ error: "Ação inválida." }, 400);
  }

  if (!(await requireAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
  if (!env.MEDIA) return json({ error: "R2 não configurado." }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Não foi possível ler o envio." }, 400); }
  const category = String(form.get("category") || "");
  const config = await readConfig(env);
  if (!config.categories.some(c => c.slug === category)) return json({ error: "Sessão inválida." }, 400);
  const files = form.getAll("photos").filter(value => value && typeof value.arrayBuffer === "function");
  if (!files.length) return json({ error: "Nenhuma imagem enviada." }, 400);
  const uploaded = [], skipped = [];
  for (const file of files) {
    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension || file.size <= 0 || file.size > MAX_FILE_BYTES) { skipped.push(file.name || "arquivo"); continue; }
    const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "foto";
    const key = `portfolio/${category}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
    uploaded.push(key);
  }
  const newConfig = config.managedMode ? config : { ...config, managedMode: true };
  await writeConfig(env, newConfig);
  return json({ ok: true, uploaded, skipped });
}
async function handleReplace(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
  if (!env.MEDIA) return json({ error: "R2 não configurado." }, 503);
  const form = await request.formData();
  const oldKey = String(form.get("oldKey") || "");
  const category = String(form.get("category") || "");
  const file = form.get("photo");
  if (!isSafePortfolioKey(oldKey) || !file || typeof file.arrayBuffer !== "function") return json({ error: "Dados inválidos." }, 400);
  const config = await readConfig(env);
  if (!config.categories.some(c => c.slug === category)) return json({ error: "Sessão inválida." }, 400);
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension || file.size <= 0 || file.size > MAX_FILE_BYTES) return json({ error: "Formato/tamanho inválido." }, 400);
  const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "foto";
  const newKey = `portfolio/${category}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
  await env.MEDIA.put(newKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  await env.MEDIA.delete(oldKey);
  return json({ ok: true, key: newKey });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/gallery" && request.method === "GET") return handleGallery(env, request);
    if (url.pathname === "/api/admin") return handleAdmin(request, env);
    if (url.pathname === "/api/admin/replace" && request.method === "POST") return handleReplace(request, env);
    if (url.pathname.startsWith("/media/") && request.method === "GET") return handleMedia(request, env);
    return env.ASSETS.fetch(request);
  }
};
