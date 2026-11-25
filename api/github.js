/*
 * Vercel Serverless Function: perantara admin -> GitHub.
 *
 * Admin cukup memakai PASSWORD. Token GitHub tidak pernah sampai ke browser:
 * ia disimpan sebagai Environment Variable di Vercel.
 *
 * Environment Variables (Vercel -> Project -> Settings -> Environment Variables):
 *   ADMIN_PASSWORD  password admin
 *   GITHUB_TOKEN    fine-grained token, hanya repo ini, izin Contents: Read and write
 *   GITHUB_OWNER    username/organisasi pemilik repo
 *   GITHUB_REPO     nama repo
 *
 * Hanya berkas data/transactions.json dan assets/<nama-file> yang boleh disentuh.
 */
const crypto = require('crypto');

const ALLOWED_PATH = /^\/contents\/(data\/transactions\.json|assets\/[A-Za-z0-9_.-]+)$/;
const MAX_CONTENT_CHARS = 6 * 1024 * 1024;   // ~4.5 MB biner

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function send(res, status, body) {
    res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

module.exports = async function handler(req, res) {
    const { ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
    if (!ADMIN_PASSWORD || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        return send(res, 500, { message: 'Server belum dikonfigurasi: isi ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO di Vercel.' });
    }

    const supplied = req.headers['x-admin-password'] || '';
    if (!safeEqual(supplied, ADMIN_PASSWORD)) {
        await new Promise(r => setTimeout(r, 600));          // memperlambat tebak-tebakan password
        return send(res, 401, { message: 'Password salah.' });
    }

    const path = String((req.query && req.query.path) || '');
    // Pemeriksaan password saja (dipakai saat login)
    if (path === '' && req.method === 'GET') {
        return send(res, 200, { ok: true, permissions: { push: true } });
    }

    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return send(res, 405, { message: 'Metode tidak diizinkan.' });
    if (!ALLOWED_PATH.test(path) || path.includes('..')) return send(res, 403, { message: 'Berkas ini tidak boleh diakses.' });

    let payload;
    if (req.method !== 'GET') {
        const b = req.body && typeof req.body === 'object' ? req.body : {};
        payload = { message: String(b.message || 'Update dari aplikasi').slice(0, 200) };
        if (b.sha) payload.sha = String(b.sha);
        if (req.method === 'PUT') {
            if (typeof b.content !== 'string' || !b.content || b.content.length > MAX_CONTENT_CHARS) {
                return send(res, 400, { message: 'Isi berkas kosong atau terlalu besar.' });
            }
            payload.content = b.content;
        }
    }

    try {
        const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
            method: req.method,
            headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'shopee-mhia-app',
                ...(payload ? { 'Content-Type': 'application/json' } : {})
            },
            body: payload ? JSON.stringify(payload) : undefined
        });
        const text = await ghRes.text();
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { message: text.slice(0, 200) }; }
        // 401/403 dari GitHub berarti token server bermasalah, bukan password pengguna salah.
        if (ghRes.status === 401) return send(res, 502, { message: 'Token GitHub di server tidak valid/kedaluwarsa. Perbarui GITHUB_TOKEN di Vercel.' });
        return send(res, ghRes.status, json);
    } catch (e) {
        return send(res, 502, { message: 'Tidak dapat menghubungi GitHub.' });
    }
};
