const COOKIE_NAME = "wa_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const CATEGORIES = new Set([
  "casamento",
  "gestante",
  "bebe-reborn",
  "infantil",
  "familia",
  "ensaios",
  "natal",
  "datas-especiais"
]);

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
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function createSession(secret) {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return `${base64url(encoder.encode(payload))}.${base64url(await hmac(secret, payload))}`;
}

function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const found = raw
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : null;
}

async function hasValidSession(request, secret) {
  if (!secret) return false;
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  let payload;
  let actual;
  try {
    payload = new TextDecoder().decode(decodeBase64url(parts[0]));
    actual = decodeBase64url(parts[1]);
  } catch {
    return false;
  }

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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function cookieHeader(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function listObjects(env) {
  const result = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: "portfolio/", cursor, limit: 1000 });
    for (const object of page.objects) {
      result.push({ key: object.key, size: object.size, uploaded: object.uploaded });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  result.sort((a, b) => b.key.localeCompare(a.key));
  return result;
}

function isSafePortfolioKey(key) {
  return key.startsWith("portfolio/") && !key.includes("..") && !key.includes("\\");
}

async function handleGallery(env) {
  if (!env.MEDIA) return json({ categories: {} });
  const categories = {};
  let cursor;

  do {
    const page = await env.MEDIA.list({ prefix: "portfolio/", cursor, limit: 1000 });
    for (const object of page.objects) {
      const relative = object.key.slice("portfolio/".length);
      const slash = relative.indexOf("/");
      if (slash < 1) continue;
      const category = relative.slice(0, slash);
      if (!CATEGORIES.has(category)) continue;
      (categories[category] ||= []).push(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  for (const values of Object.values(categories)) values.sort();
  return json({ categories });
}

async function handleMedia(request, env) {
  if (!env.MEDIA) return new Response("R2 não configurado", { status: 503 });
  const url = new URL(request.url);
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice("/media/".length));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!isSafePortfolioKey(key)) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function handleAdmin(request, env) {
  if (request.method === "GET") {
    if (!(await hasValidSession(request, env.SESSION_SECRET))) return json({ authenticated: false });
    if (!env.MEDIA) return json({ authenticated: true, objects: [], error: "R2 não configurado." }, 503);
    return json({ authenticated: true, objects: await listObjects(env) });
  }

  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }

    if (body.action === "login") {
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
        return json({ error: "Configure ADMIN_PASSWORD e SESSION_SECRET no Cloudflare." }, 503);
      }
      if (String(body.password ?? "") !== env.ADMIN_PASSWORD) return json({ error: "Senha incorreta." }, 401);

      const token = await createSession(env.SESSION_SECRET);
      return json(
        { ok: true },
        200,
        { "Set-Cookie": cookieHeader(request, token, 604800) }
      );
    }

    if (body.action === "logout") {
      return json(
        { ok: true },
        200,
        { "Set-Cookie": cookieHeader(request, "", 0) }
      );
    }

    if (body.action === "delete") {
      if (!(await hasValidSession(request, env.SESSION_SECRET))) return json({ error: "Não autorizado." }, 401);
      if (!env.MEDIA) return json({ error: "R2 não configurado." }, 503);
      const key = String(body.key || "");
      if (!isSafePortfolioKey(key)) return json({ error: "Arquivo inválido." }, 400);
      await env.MEDIA.delete(key);
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  }

  if (!(await hasValidSession(request, env.SESSION_SECRET))) return json({ error: "Não autorizado." }, 401);
  if (!env.MEDIA) return json({ error: "R2 não configurado." }, 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Não foi possível ler o envio." }, 400);
  }

  const category = String(form.get("category") || "");
  if (!CATEGORIES.has(category)) return json({ error: "Categoria inválida." }, 400);

  const files = form.getAll("photos").filter(value => value && typeof value.arrayBuffer === "function");
  if (!files.length) return json({ error: "Nenhuma imagem enviada." }, 400);

  const uploaded = [];
  const skipped = [];

  for (const file of files) {
    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      skipped.push(file.name || "arquivo");
      continue;
    }

    const safeBase = String(file.name || "foto")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "foto";

    const key = `portfolio/${category}/${Date.now()}-${crypto.randomUUID()}-${safeBase.replace(/\.[^.]+$/, "")}.${extension}`;
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable"
      }
    });
    uploaded.push(key);
  }

  return json({ ok: true, uploaded, skipped });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/gallery" && request.method === "GET") {
      return handleGallery(env);
    }

    if (url.pathname === "/api/admin") {
      return handleAdmin(request, env);
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      return handleMedia(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
