/*
 * Pembaca hasil OCR untuk screenshot pesanan Shopee dan bukti transfer bank.
 * Input : { lines: [{ text, words: [{ text, confidence }] }] }  (atau { text })
 * Output: { type, title, amount, note, bank, confidence, guessedAmount }
 *
 * Murni fungsi (tanpa DOM) supaya bisa diuji di Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ReceiptParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STATUS_RE = /\b(Selesai|Dikemas|Dikirim|Sedang Dikirim|Dibatalkan|Pengembalian|Menunggu Pembayaran|Belum Bayar|Perlu Dikirim|Diproses)\b/i;
    const BANKS = ['BCA', 'BNI', 'BRI', 'Mandiri', 'BSI', 'CIMB', 'Permata', 'Jago', 'SeaBank', 'DANA', 'OVO', 'GoPay', 'ShopeePay', 'BTN'];

    // Perbaiki salah baca OCR di dalam deretan angka (O->0, l->1, dst).
    function fixDigits(token) {
        return token
            .replace(/[Oo]/g, '0')
            .replace(/[lI|]/g, '1')
            .replace(/q/g, '9')
            .replace(/S/g, '5')
            .replace(/B/g, '8');
    }

    // "Rp21.400" / "Rp 2.002.500" / "Rp21,400" / "Rp21.400,00" -> angka
    function parseRupiah(raw) {
        if (!raw) return null;
        let t = fixDigits(String(raw).replace(/\s+/g, ''));
        t = t.replace(/[^0-9.,]/g, '');
        if (!t) return null;
        // buang desimal (",00" / ".5") bila segmen terakhir bukan kelompok ribuan (3 digit)
        const m = t.match(/^(.*\d)[.,](\d{1,2})$/);
        if (m) t = m[1];
        const n = Number(t.replace(/[.,]/g, ''));
        return Number.isFinite(n) && n >= 100 && n <= 1e10 ? n : null;
    }

    const AMOUNT_RE = /R[pP]\s*([0-9OolIqSB|][0-9OolIqSB|.,\s]{0,14}[0-9OolIqSB|])/;

    function amountIn(text) {
        const m = text.match(AMOUNT_RE);
        return m ? parseRupiah(m[1]) : null;
    }

    function normalizeLines(ocr) {
        if (ocr && Array.isArray(ocr.lines) && ocr.lines.length) {
            return ocr.lines
                .map(l => ({
                    text: (l.text || '').replace(/\s+/g, ' ').trim(),
                    words: Array.isArray(l.words) ? l.words : []
                }))
                .filter(l => l.text);
        }
        return String((ocr && ocr.text) || '')
            .split(/\r?\n/)
            .map(s => ({ text: s.replace(/\s+/g, ' ').trim(), words: [] }))
            .filter(l => l.text);
    }

    function alphaRatio(s) {
        const compact = s.replace(/\s/g, '');
        if (!compact) return 0;
        return (compact.match(/[A-Za-z]/g) || []).length / compact.length;
    }

    // Buang "sampah" di awal baris (ikon, thumbnail, angka acak) memakai confidence kata.
    function cleanLine(line) {
        let words = line.words.length ? line.words.slice() : line.text.split(' ').map(w => ({ text: w, confidence: 100 }));
        const isJunk = w => {
            const t = (w.text || '').trim();
            if (!t) return true;
            if (!/[A-Za-z0-9]{2,}/.test(t)) return true;                  // hanya simbol
            const c = typeof w.confidence === 'number' ? w.confidence : 100;
            if (c < 45 && t.length <= 12) return true;                    // kata ragu-ragu pendek
            if (/^\d{1,3}$/.test(t) && c < 80) return true;               // angka pendek ragu-ragu
            return false;
        };
        while (words.length && isJunk(words[0])) words.shift();
        while (words.length && isJunk(words[words.length - 1]) && !/\.{2,}|…$/.test(words[words.length - 1].text)) words.pop();
        return words.map(w => w.text).join(' ')
            .replace(/\s*(\.{2,}|…)\s*$/, '')
            .replace(/\s+x\d+$/i, '')
            .trim();
    }

    function isProductLine(line) {
        const t = line.text;
        if (t.length < 8) return false;
        if (alphaRatio(t) < 0.55) return false;
        if (!/[A-Za-z]{4,}/.test(t)) return false;
        if (/^(Rp|Total|Lihat Semua|Estimasi|Pesanan|Beli Lagi|Nilai|Hubungi)/i.test(t)) return false;
        if (/\bx\d+\s*$/i.test(t) && t.length < 25) return false;       // baris variasi pendek
        return true;
    }

    function detectBank(text) {
        for (const b of BANKS) {
            if (new RegExp('\\b' + b + '\\b', 'i').test(text)) return b;
        }
        return null;
    }

    function parseTransfer(lines, fullText) {
        const bank = detectBank(fullText);
        let amount = null;
        // Utamakan "Nominal"; biaya transaksi tidak ikut menambah saldo.
        for (const key of [/Nominal/i, /Jumlah( Transfer)?/i, /Amount/i]) {
            const hit = lines.find(l => key.test(l.text) && amountIn(l.text));
            if (hit) { amount = amountIn(hit.text); break; }
        }
        let guessed = false;
        if (!amount) {
            // Nominal besar di bawah "Transfer berhasil" (tanpa label)
            const idx = lines.findIndex(l => /Transfer\s+berhasil/i.test(l.text));
            const after = idx >= 0 ? lines.slice(idx, idx + 4) : [];
            const hit = after.find(l => amountIn(l.text) && !/Biaya/i.test(l.text));
            if (hit) amount = amountIn(hit.text);
        }
        if (!amount) {
            const all = lines.filter(l => !/Biaya/i.test(l.text)).map(l => amountIn(l.text)).filter(Boolean);
            if (all.length) { amount = Math.min(...all); guessed = true; }
        }
        const refMatch = fullText.match(/Ref(?:erence)?\.?\s*(?:ID|No)?\.?\s*:?\s*([0-9A-Z]{10,})/i);
        const sourceIdx = lines.findIndex(l => /Sumber dana/i.test(l.text));
        let sender = null;
        if (sourceIdx >= 0 && lines[sourceIdx + 1]) {
            const cand = cleanLine(lines[sourceIdx + 1]);
            if (/^[A-Za-z .,']{3,40}$/.test(cand)) sender = cand;
        }
        return {
            type: 'income',
            title: bank ? `Tambah Saldo via ${bank}` : 'Tambah Saldo (Transfer)',
            amount,
            note: [sender ? `Pengirim: ${sender}` : '', refMatch ? `Ref ID: ${refMatch[1]}` : ''].filter(Boolean).join('\n'),
            bank,
            guessedAmount: guessed
        };
    }

    function parseOrder(lines) {
        let amount = null;
        let guessed = false;
        let totalIdx = -1;
        let productCount = 1;

        const priority = [
            /Total\s*Pembayaran/i,
            /Total\s*Pesanan/i,
            /Total\s*\d+\s*produk/i
        ];
        for (const re of priority) {
            const idx = lines.findIndex(l => re.test(l.text) && amountIn(l.text));
            if (idx >= 0) {
                amount = amountIn(lines[idx].text);
                totalIdx = idx;
                const c = lines[idx].text.match(/Total\s*(\d+)\s*produk/i);
                if (c) productCount = Number(c[1]) || 1;
                break;
            }
        }
        if (!amount) {
            const idx = lines.findIndex(l => /Total/i.test(l.text) && amountIn(l.text));
            if (idx >= 0) { amount = amountIn(lines[idx].text); totalIdx = idx; }
        }
        if (!amount) {
            const all = lines.map(l => amountIn(l.text)).filter(Boolean);
            if (all.length) { amount = Math.max(...all); guessed = true; }
        }

        // Nama toko = baris yang memuat status pesanan; nama produk = baris layak setelahnya.
        const headerIdx = lines.findIndex(l => STATUS_RE.test(l.text));
        let store = null;
        if (headerIdx >= 0) {
            const s = cleanLine({ text: lines[headerIdx].text.replace(STATUS_RE, ''), words: lines[headerIdx].words.filter(w => !STATUS_RE.test(w.text)) });
            if (s.length >= 3) store = s;
        }
        const from = headerIdx >= 0 ? headerIdx + 1 : 0;
        const to = totalIdx >= 0 ? totalIdx : lines.length;
        let product = null;
        for (let i = from; i < to && i < from + 5; i++) {
            if (isProductLine(lines[i])) { product = cleanLine(lines[i]); break; }
        }
        if (!product) {
            for (let i = from; i < to; i++) {
                if (isProductLine(lines[i])) { product = cleanLine(lines[i]); break; }
            }
        }
        let title = product || '';
        if (title && productCount > 1) title += ` (+${productCount - 1} produk lain)`;

        return {
            type: 'expense',
            title,
            amount,
            note: store ? `Toko: ${store}` : '',
            bank: null,
            guessedAmount: guessed
        };
    }

    function parse(ocr) {
        const lines = normalizeLines(ocr);
        const fullText = lines.map(l => l.text).join('\n');
        const looksTransfer =
            /Transfer\s+berhasil/i.test(fullText) ||
            (/Penerima/i.test(fullText) && /Sumber dana|Nominal|Biaya transaksi/i.test(fullText)) ||
            /Bukti\s+(transfer|pembayaran)/i.test(fullText);
        const looksOrder = /Total\s*\d+\s*produk|Total\s*Pesanan|Total\s*Pembayaran/i.test(fullText) || STATUS_RE.test(fullText);
        const result = (looksTransfer && !/Total\s*\d+\s*produk/i.test(fullText))
            ? parseTransfer(lines, fullText)
            : parseOrder(lines);
        result.recognized = looksTransfer || looksOrder;
        return result;
    }

    return { parse, parseRupiah, amountIn };
});
