/*
 * Penyimpanan data di repositori GitHub (tanpa database/server).
 *
 *  - data/transactions.json  : semua catatan transaksi
 *  - assets/<nomor>.jpg      : foto/screenshot transaksi
 *
 * Membaca (semua orang)  : fetch file statis dari situs itu sendiri (Vercel), cadangan raw.githubusercontent.com.
 * Menulis (hanya admin)  : GitHub Contents API memakai Personal Access Token.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GitHubStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DATA_PATH = 'data/transactions.json';
    const emptyData = () => ({ version: 1, transactions: [] });

    function utf8ToB64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }
    function b64ToUtf8(b64) {
        const bin = atob(String(b64).replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    function friendlyError(status, apiMessage) {
        const msg = apiMessage ? ` (${apiMessage})` : '';
        if (status === 401) return 'Password salah atau sesi admin berakhir.';
        if (status === 403) return 'Akses ditolak GitHub: pastikan token di server punya izin "Contents: Read and write" untuk repo ini, atau tunggu jika kena batas permintaan.' + msg;
        if (status === 404) return 'Layanan admin atau repo tidak ditemukan. Pastikan aplikasi dibuka dari Vercel dan GITHUB_OWNER/GITHUB_REPO sudah benar.';
        if (status === 500 || status === 502) return (apiMessage || 'Server bermasalah.');
        if (status === 409 || status === 422) return 'Data di GitHub baru saja berubah. Coba lagi.' + msg;
        return `GitHub error ${status}.` + msg;
    }

    /** Baca data publik (untuk viewer): tanpa token. */
    async function loadPublic(opts) {
        opts = opts || {};
        const doFetch = opts.fetchImpl || fetch;
        const stamp = '?_=' + Date.now();
        const urls = [DATA_PATH + stamp];
        if (opts.owner && opts.repo) urls.push(`https://raw.githubusercontent.com/${opts.owner}/${opts.repo}/HEAD/${DATA_PATH}${stamp}`);
        let lastError = null;
        let sawNotFound = false;
        for (const url of urls) {
            try {
                const res = await doFetch(url, { cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    return { version: 1, transactions: Array.isArray(json.transactions) ? json.transactions : [] };
                }
                if (res.status === 404) sawNotFound = true;
                else lastError = new Error('HTTP ' + res.status);
            } catch (e) {
                lastError = e;
            }
        }
        if (sawNotFound && !lastError) return emptyData();       // belum ada catatan sama sekali
        if (sawNotFound) return emptyData();
        throw lastError || new Error('Data tidak dapat dimuat.');
    }

    /** Klien admin: butuh owner, repo, token. */
    function createStore(cfg) {
        const doFetch = cfg.fetchImpl || ((...a) => fetch(...a));
        // Mode perantara (Vercel): cfg.endpoint = '/api/github', otorisasi lewat cfg.headers (password).
        // Mode langsung (uji/opsional): langsung ke api.github.com memakai cfg.token.
        const base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
        const urlFor = path => cfg.endpoint ? `${cfg.endpoint}?path=${encodeURIComponent(path)}` : base + path;

        async function gh(method, path, body) {
            const res = await doFetch(urlFor(path), {
                method,
                cache: 'no-store',
                headers: {
                    ...(cfg.endpoint ? {} : {
                        Authorization: 'Bearer ' + cfg.token,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }),
                    ...(cfg.headers || {}),
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
            if (res.status === 404 && method === 'GET' && path.startsWith('/contents/')) return null;
            if (!res.ok) {
                let apiMessage = '';
                try { apiMessage = (await res.json()).message || ''; } catch (_) { /* abaikan */ }
                const err = new Error(friendlyError(res.status, apiMessage));
                err.status = res.status;
                throw err;
            }
            return res.status === 204 ? null : res.json();
        }

        const enc = p => p.split('/').map(encodeURIComponent).join('/');

        async function verify() {
            const info = await gh('GET', '');
            if (info && info.permissions && info.permissions.push === false) {
                const err = new Error('Token hanya punya akses baca. Beri izin "Contents: Read and write".');
                err.status = 403;
                throw err;
            }
            return info;
        }

        async function getFile(path) {
            return gh('GET', '/contents/' + enc(path));
        }

        async function readData() {
            const file = await getFile(DATA_PATH);
            if (!file) return { data: emptyData(), sha: null };
            let data;
            try { data = JSON.parse(b64ToUtf8(file.content)); } catch (_) { data = emptyData(); }
            if (!Array.isArray(data.transactions)) data.transactions = [];
            return { data, sha: file.sha };
        }

        async function putFile(path, base64Content, message) {
            const existing = await getFile(path);
            return gh('PUT', '/contents/' + enc(path), {
                message,
                content: base64Content,
                ...(existing ? { sha: existing.sha } : {})
            });
        }

        async function deleteFile(path, message) {
            const existing = await getFile(path);
            if (!existing) return false;
            await gh('DELETE', '/contents/' + enc(path), { message, sha: existing.sha });
            return true;
        }

        /**
         * Baca data terbaru -> jalankan mutator -> simpan.
         * Bila ada konflik versi (409/422), diulang dari data terbaru.
         */
        async function updateData(mutator, message) {
            let lastErr = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                const { data, sha } = await readData();
                const result = await mutator(data);
                data.version = 1;
                try {
                    await gh('PUT', '/contents/' + enc(DATA_PATH), {
                        message: typeof message === 'function' ? message(result) : message,
                        content: utf8ToB64(JSON.stringify(data, null, 2) + '\n'),
                        ...(sha ? { sha } : {})
                    });
                    return { data, result };
                } catch (e) {
                    lastErr = e;
                    if (e.status !== 409 && e.status !== 422) throw e;
                }
            }
            throw lastErr;
        }

        return { verify, readData, updateData, putFile, deleteFile, getFile };
    }

    return { createStore, loadPublic, utf8ToB64, b64ToUtf8, DATA_PATH };
});
