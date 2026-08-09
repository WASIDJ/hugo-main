interface Env {
    DB: D1Database;
}

type ArticleEvent = 'view' | 'complete';

interface ArticleStats {
    views: number;
    completions: number;
}

const API_PATH = '/api/article-stats';
const COOKIE_NAME = '__Host-blog_reader';
const ALLOWED_ORIGINS = new Set([
    'https://www.jeffkafka.top',
    'https://jeffkafka.top',
    'http://localhost:1313',
    'http://127.0.0.1:1313'
]);

function corsHeaders(origin: string | null): HeadersInit {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        Vary: 'Origin'
    };
}

function json(
    body: object,
    status = 200,
    origin: string | null = null,
    extraHeaders: HeadersInit = {}
): Response {
    const headers = new Headers(corsHeaders(origin));
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
    return Response.json(body, { status, headers });
}

function parseCookies(header: string | null): Map<string, string> {
    const cookies = new Map<string, string>();
    if (!header) return cookies;

    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1) continue;
        cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
    return cookies;
}

function normalizeArticlePath(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 512) return null;

    try {
        const parsed = new URL(value, 'https://blog.invalid');
        if (parsed.origin !== 'https://blog.invalid') return null;
        const path = parsed.pathname.replace(/\/{2,}/g, '/');
        if (!path.startsWith('/post/') || /[\u0000-\u001f]/.test(path)) return null;
        return path.endsWith('/') ? path : `${path}/`;
    } catch {
        return null;
    }
}

async function visitorHash(visitorId: string, eventDate: string): Promise<string> {
    const bytes = new TextEncoder().encode(`${visitorId}:${eventDate}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getStats(db: D1Database, path: string): Promise<ArticleStats> {
    const row = await db
        .prepare('SELECT views, completions FROM article_stats WHERE path = ?1')
        .bind(path)
        .first<ArticleStats>();

    return row ?? { views: 0, completions: 0 };
}

async function handleGet(request: Request, env: Env, origin: string | null): Promise<Response> {
    const path = normalizeArticlePath(new URL(request.url).searchParams.get('path'));
    if (!path) return json({ error: 'Invalid article path' }, 400, origin);

    return json({ path, ...(await getStats(env.DB, path)) }, 200, origin);
}

async function handlePost(request: Request, env: Env, origin: string | null): Promise<Response> {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return json({ error: 'Origin not allowed' }, 403, origin);
    }

    let payload: { path?: unknown; event?: unknown };
    try {
        payload = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
    }

    const path = normalizeArticlePath(payload.path);
    const event = payload.event;
    if (!path || (event !== 'view' && event !== 'complete')) {
        return json({ error: 'Invalid article event' }, 400, origin);
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    const existingVisitor = cookies.get(COOKIE_NAME);
    const visitorId = existingVisitor && /^[a-f0-9-]{36}$/i.test(existingVisitor)
        ? existingVisitor
        : crypto.randomUUID();
    const eventDate = new Date().toISOString().slice(0, 10);
    const hash = await visitorHash(visitorId, eventDate);

    const result = await env.DB
        .prepare(`
            INSERT OR IGNORE INTO article_events (path, event_type, visitor_hash, event_date)
            VALUES (?1, ?2, ?3, ?4)
        `)
        .bind(path, event satisfies ArticleEvent, hash, eventDate)
        .run();

    const headers: HeadersInit = {};
    if (!existingVisitor) {
        headers['Set-Cookie'] = `${COOKIE_NAME}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
    }

    return json(
        {
            path,
            event,
            counted: result.meta.changes > 0,
            ...(await getStats(env.DB, path))
        },
        200,
        origin,
        headers
    );
}

export default {
    async fetch(request, env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');

        if (url.pathname !== API_PATH) {
            return json({ error: 'Not found' }, 404, origin);
        }

        if (request.method === 'OPTIONS') {
            if (!origin || !ALLOWED_ORIGINS.has(origin)) {
                return json({ error: 'Origin not allowed' }, 403, origin);
            }
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        try {
            if (request.method === 'GET') return await handleGet(request, env, origin);
            if (request.method === 'POST') return await handlePost(request, env, origin);
            return json({ error: 'Method not allowed' }, 405, origin, { Allow: 'GET, POST, OPTIONS' });
        } catch (error) {
            console.error('article_stats_request_failed', {
                method: request.method,
                path: url.pathname,
                error: error instanceof Error ? error.message : String(error)
            });
            return json({ error: 'Internal server error' }, 500, origin);
        }
    }
} satisfies ExportedHandler<Env>;
