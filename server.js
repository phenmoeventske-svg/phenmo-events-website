const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Load .env if present
if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch (e) {
        // .env file is optional
    }
}

const sqliteDb = require('./server/db');
const supabaseApi = require('./server/supabase');

// Active data provider: Supabase if configured, otherwise local SQLite
const useSupabase = process.env.DATA_STORE === 'supabase' ||
    (process.env.DATA_STORE !== 'sqlite' && supabaseApi.isConfigured());
const db = useSupabase ? supabaseApi : sqliteDb;

if (useSupabase) {
    console.log('[Phenmo Backend] Active Data Store: Supabase Cloud PostgreSQL');
} else {
    console.log('[Phenmo Backend] Active Data Store: Local SQLite (data/phenmo.db)');
}

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || __dirname);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v'
};

function getCorsOrigin(req) {
    const origin = req && req.headers && req.headers.origin;

    if (!origin) {
        return '*';
    }

    if (ALLOWED_ORIGINS.length === 0) {
        return '*';
    }

    return ALLOWED_ORIGINS.includes(origin) ? origin : '*';
}

function applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res, statusCode, data, req) {
    const corsOrigin = getCorsOrigin(req);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    applySecurityHeaders(res);
    res.writeHead(statusCode);
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
            // Safeguard against large payloads (> 5MB)
            if (body.length > 5 * 1024 * 1024) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        const corsOrigin = getCorsOrigin(req);
        res.writeHead(204, {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        applySecurityHeaders(res);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // ==========================================
    // REST API ROUTES (/api/...)
    // ==========================================
    if (pathname.startsWith('/api/')) {
        try {
            // STATE: Full sync for staff portal client
            if (pathname === '/api/state') {
                if (req.method === 'GET') {
                    const state = await db.getState();
                    return sendJson(res, 200, state, req);
                }

                if (req.method === 'POST') {
                    const body = await parseBody(req);
                    await db.saveFullState(body);
                    return sendJson(res, 200, { success: true }, req);
                }
            }

            // AUTH: Portal Master Security Gate (All-Round Access Code)
            if (pathname === '/api/auth/gate' && req.method === 'POST') {
                const body = await parseBody(req);
                const { masterPassword } = body;
                const expectedMaster = (process.env.PORTAL_MASTER_KEY || 'phenmo2026').trim();

                if (!masterPassword || masterPassword.trim() !== expectedMaster) {
                    return sendJson(res, 401, { success: false, error: 'Incorrect master portal access code' }, req);
                }

                return sendJson(res, 200, { success: true, message: 'Portal access authorized' }, req);
            }

            // AUTH: Login
            if (pathname === '/api/auth/login' && req.method === 'POST') {
                const body = await parseBody(req);
                const { accountId, email, password } = body;
                const identifier = (email || accountId || '').trim();

                if (!identifier || typeof password !== 'string') {
                    return sendJson(res, 400, { success: false, error: 'Email or account ID and password required' }, req);
                }

                const account = await db.getAccountByIdOrEmail(identifier);

                if (!account || !db.verifyPassword(password.trim(), account.password)) {
                    return sendJson(res, 401, { success: false, error: 'Invalid email or password' }, req);
                }

                const safeAccount = {
                    id: account.id,
                    name: account.name,
                    role: account.role,
                    email: account.email
                };

                const isFirstTime = db.verifyPassword('0000', account.password);

                return sendJson(res, 200, {
                    success: true,
                    requiresSetup: isFirstTime,
                    message: isFirstTime
                        ? 'First-time login detected. Permanent email capture and new password required.'
                        : 'Login successful.',
                    account: safeAccount
                }, req);
            }

            // AUTH: Complete First-Time Setup
            if (pathname === '/api/auth/setup' && req.method === 'POST') {
                const body = await parseBody(req);
                const { accountId, email, newPassword, deviceInfo } = body;

                if (!accountId || !email || !newPassword) {
                    return sendJson(res, 400, { success: false, error: 'Account ID, email, and new password are required' }, req);
                }

                try {
                    const updated = await db.completeFirstTimeSetup(accountId, email, newPassword, deviceInfo);
                    const safeAccount = {
                        id: updated.id,
                        name: updated.name,
                        role: updated.role,
                        email: updated.email
                    };

                    return sendJson(res, 200, {
                        success: true,
                        requiresSetup: false,
                        message: 'Account setup complete. Managing Director Steve has been notified of your first login.',
                        account: safeAccount
                    }, req);
                } catch (err) {
                    return sendJson(res, 400, { success: false, error: err.message || 'Setup failed' }, req);
                }
            }

            // AUTH: Change Password
            if (pathname === '/api/auth/change-password' && req.method === 'POST') {
                const body = await parseBody(req);
                const { accountId, currentPassword, newPassword } = body;

                if (!accountId || !newPassword || !newPassword.trim()) {
                    return sendJson(res, 400, { success: false, error: 'Account ID and password required' }, req);
                }

                const account = await db.getAccountById(accountId);
                if (!account) {
                    return sendJson(res, 404, { success: false, error: 'Account not found' }, req);
                }

                // Never allow a password change without proving knowledge of the
                // existing one — accountId is public (see GET /api/accounts).
                if (!currentPassword || !db.verifyPassword(currentPassword.trim(), account.password)) {
                    return sendJson(res, 401, { success: false, error: 'Current password is incorrect' }, req);
                }

                if (newPassword.trim() === '0000') {
                    return sendJson(res, 400, { success: false, error: 'New password cannot be the default code 0000' }, req);
                }

                await db.updatePassword(accountId, newPassword.trim());
                return sendJson(res, 200, { success: true, message: 'Password updated successfully' }, req);
            }

            // ACCOUNTS: List public profiles
            if (pathname === '/api/accounts' && req.method === 'GET') {
                const rawAccounts = await db.getAccounts();
                const accounts = (rawAccounts || []).map((acc) => ({
                    id: acc.id,
                    name: acc.name,
                    role: acc.role,
                    email: acc.email
                }));
                return sendJson(res, 200, accounts, req);
            }

            // EVENTS: List all
            if (pathname === '/api/events' && req.method === 'GET') {
                const events = await db.getEvents();
                return sendJson(res, 200, events, req);
            }

            // EVENTS: Create or update
            if (pathname === '/api/events' && req.method === 'POST') {
                const body = await parseBody(req);
                if (!body.eventName || !body.clientName || !body.eventDate) {
                    return sendJson(res, 400, { success: false, error: 'Event name, client, and date are required' });
                }

                if (!body.id) {
                    body.id = `evt-${Date.now()}`;
                }

                const saved = await db.saveEvent(body);
                return sendJson(res, 201, saved);
            }

            // EVENTS: Single event routes (/api/events/:id)
            if (pathname.startsWith('/api/events/')) {
                const eventId = pathname.replace('/api/events/', '');

                if (req.method === 'GET') {
                    const event = await db.getEventById(eventId);
                    if (!event) return sendJson(res, 404, { error: 'Event not found' }, req);
                    return sendJson(res, 200, event, req);
                }

                if (req.method === 'PUT') {
                    const body = await parseBody(req);
                    body.id = eventId;
                    const saved = await db.saveEvent(body);
                    return sendJson(res, 200, saved, req);
                }

                if (req.method === 'DELETE') {
                    const deleted = await db.deleteEvent(eventId);
                    return sendJson(res, deleted ? 200 : 404, { success: deleted }, req);
                }
            }

            // INVENTORY: Search (/api/inventory/search?q=...)
            if (pathname === '/api/inventory/search' && req.method === 'GET') {
                const query = parsedUrl.searchParams.get('q') || '';
                const results = await db.searchInventory(query);
                return sendJson(res, 200, results, req);
            }

            // INVENTORY: Lookup by ID or Serial (/api/inventory/lookup?code=...)
            if (pathname === '/api/inventory/lookup' && req.method === 'GET') {
                const code = parsedUrl.searchParams.get('code') || '';
                const item = await db.findInventoryItemByIdOrSerial(code);
                if (!item) return sendJson(res, 404, { error: 'Equipment not found' }, req);
                return sendJson(res, 200, item, req);
            }

            // INVENTORY: List all
            if (pathname === '/api/inventory' && req.method === 'GET') {
                const inventory = await db.getInventory();
                return sendJson(res, 200, inventory, req);
            }

            // INVENTORY: Update item (/api/inventory/:id)
            if (pathname.startsWith('/api/inventory/') && req.method === 'PUT') {
                const itemId = pathname.replace('/api/inventory/', '');
                const body = await parseBody(req);
                const updated = await db.updateInventoryItem(itemId, body);
                if (!updated) return sendJson(res, 404, { error: 'Inventory item not found' }, req);
                return sendJson(res, 200, updated, req);
            }

            // MESSAGES: List visible messages
            if (pathname === '/api/messages' && req.method === 'GET') {
                const userId = parsedUrl.searchParams.get('userId');
                if (!userId) {
                    return sendJson(res, 400, { error: 'userId query parameter required' }, req);
                }
                const messages = await db.getMessages(userId);
                return sendJson(res, 200, messages, req);
            }

            // MESSAGES: Send message
            if (pathname === '/api/messages' && req.method === 'POST') {
                const body = await parseBody(req);
                const { senderId, recipientId, text } = body;

                if (!senderId || !recipientId || !text || !text.trim()) {
                    return sendJson(res, 400, { error: 'Sender, recipient, and text required' }, req);
                }

                const saved = await db.sendMessage(senderId, recipientId, text.trim());
                return sendJson(res, 201, saved);
            }

            // STATS: Aggregated stats
            if (pathname === '/api/stats' && req.method === 'GET') {
                const events = await db.getEvents();
                const inventoryCategories = await db.getInventory();
                const inventoryItems = (inventoryCategories || []).flatMap((c) => c.items);

                const today = new Date().toISOString().split('T')[0];
                const upcoming = (events || []).filter((e) => e.eventDate >= today).length;
                const planned = (events || []).filter((e) => e.status === 'Planned').length;
                const lowStock = inventoryItems.filter((i) => i.available <= 2 || i.status !== 'Available').length;
                const totalUnits = inventoryItems.reduce((sum, i) => sum + (Number(i.available) || 0), 0);

                return sendJson(res, 200, {
                    totalEvents: (events || []).length,
                    upcomingEvents: upcoming,
                    plannedEvents: planned,
                    totalInventoryItems: inventoryItems.length,
                    lowStockItems: lowStock,
                    totalAvailableUnits: totalUnits
                }, req);
            }

            return sendJson(res, 404, { error: 'API endpoint not found' }, req);
        } catch (error) {
            console.error('API Error:', error);
            return sendJson(res, 500, { error: error.message || 'Internal Server Error' }, req);
        }
    }

    // ==========================================
    // STATIC FILE SERVING
    // ==========================================
    function sendPlain(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(message);
    }

    let requestedPath;
    try {
        requestedPath = decodeURIComponent(pathname);
    } catch (err) {
        // Malformed percent-encoding (e.g. a stray "%")
        return sendPlain(res, 400, '400 Bad Request');
    }

    // Reject null bytes outright — they can truncate paths at the syscall layer.
    // Resolve FIRST, then verify containment: path.join() silently normalises
    // '..' segments away, so a join-then-startsWith check never rejects traversal.
    let filePath = requestedPath.includes('\0')
        ? null
        : path.resolve(PUBLIC_DIR, '.' + path.posix.normalize('/' + requestedPath));

    if (!filePath || (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep))) {
        return sendPlain(res, 403, '403 Forbidden');
    }

    // Default to index.html for root and directory requests
    if (pathname === '/') {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        return sendPlain(res, 404, '404 Not Found');
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
        return sendPlain(res, 404, '404 Not Found');
    }

    // Recognise double extensions such as "photo.jpg" by resolving the
    // longest matching MIME suffix, since path.extname() only returns ".jpg".
    const lowerPath = filePath.toLowerCase();
    const matchedExt = Object.keys(MIME_TYPES)
        .sort((a, b) => b.length - a.length)
        .find((candidate) => lowerPath.endsWith(candidate));
    const contentType = MIME_TYPES[matchedExt] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    applySecurityHeaders(res);

    // Support HTTP Range requests for video seeking and smooth mobile/iOS Safari playback
    const range = req.headers.range;
    if (range && stat.size > 0) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

        if (isNaN(start) || isNaN(end) || start >= stat.size || end >= stat.size || start > end) {
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return sendPlain(res, 416, '416 Range Not Satisfiable');
        }

        const chunksize = (end - start) + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', () => {
            if (!res.headersSent) {
                sendPlain(res, 500, '500 Server Error');
            } else {
                res.destroy();
            }
        });

        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', chunksize);
        res.writeHead(206);
        stream.pipe(res);
    } else {
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
            if (!res.headersSent) {
                sendPlain(res, 500, '500 Server Error');
            } else {
                res.destroy();
            }
        });

        res.setHeader('Content-Length', stat.size);
        res.writeHead(200);
        stream.pipe(res);
    }
});

if (require.main === module) {
    server.listen(PORT, HOST, () => {
        console.log(`Phenmo Events server running at http://${HOST}:${PORT}`);
        console.log(`- Public site:   http://${HOST}:${PORT}/`);
        console.log(`- Staff portal:  http://${HOST}:${PORT}/staff-portal/`);
        console.log(`- REST API:      http://${HOST}:${PORT}/api/`);
    });
}

module.exports = server;
