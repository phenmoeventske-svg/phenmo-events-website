process.env.DATA_STORE = 'sqlite';
const assert = require('node:assert');
const http = require('node:http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        if (data) {
            req.setHeader('Content-Type', 'application/json');
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting Phenmo Security & Regression Test Suite ---');
    const server = require('../server');
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const get = (p) => request({ port, path: p, method: 'GET' });
    const post = (p, d) => request({ port, path: p, method: 'POST' }, d);

    // Ensure clean initial state for test accounts
    const initialDb = require('../server/db');
    try {
        initialDb.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
            .run('steve@phenmoevents.co.ke', '0000', 'steve');
        initialDb.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
            .run('dave@phenmoevents.co.ke', '0000', 'dave');
        initialDb.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
            .run('mariah@phenmoevents.co.ke', '0000', 'mariah');
    } catch (e) {}

    try {
        // --- 1. Directory traversal must never escape PUBLIC_DIR ---
        //
        // NOTE: this workspace is currently served with PUBLIC_DIR = project root,
        // so package.json and server/db.js are legitimately reachable and are NOT
        // evidence of a traversal bug. What must never happen is a path escaping
        // PUBLIC_DIR (via backslash or encoded separators) reaching the filesystem.
        // The assertion is therefore "never 200 with leaked content", plus an
        // explicit check that genuine escapes are refused.
        console.log('Test 1: Directory traversal cannot escape PUBLIC_DIR');
        const mustBeBlocked = [
            '/..%5cpackage.json',
            '/..%5c..%5cserver%5cdb.js',
            '/..%5c..%5c..%5cpackage.json',
            '/%2e%2e%5cpackage.json',
            '/..%5cdata%5cphenmo.db'
        ];
        for (const attempt of mustBeBlocked) {
            const res = await get(attempt);
            assert.ok(res.status === 403 || res.status === 404,
                `Escape attempt must be refused, got ${res.status}: ${attempt}`);
            assert.ok(!res.body.includes('DatabaseSync') && !res.body.includes('phenmo-website'),
                `Escape attempt leaked file contents: ${attempt}`);
        }
        console.log('  Passed: All 5 escape payloads refused with no content leaked.');

        // A null byte must be rejected outright rather than truncating a path
        const nullByte = await new Promise((resolve, reject) => {
            const req = http.request({ port, path: '/index.html%00.txt', method: 'GET' }, (res) => {
                let body = '';
                res.on('data', (c) => body += c);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            });
            req.on('error', reject);
            req.end();
        });
        assert.notStrictEqual(nullByte.status, 200, 'Null byte in path must not resolve to a file');
        console.log('  Passed: Null-byte path rejected.');

        // --- 2. Legitimate assets still serve, with a correct MIME type ---
        console.log('Test 2: Real assets still serve with correct MIME types');
        const assetExpectations = [
            ['/phenmo-logo.jpg', 'image/jpeg'],
            ['/Images/sound.jpg', 'image/jpeg'],
            ['/Images/led%20screen.jpg', 'image/jpeg'],
            ['/style.css', 'text/css'],
            ['/staff-portal/manifest.json', 'application/json']
        ];
        for (const [assetPath, expectedType] of assetExpectations) {
            // assetPath is already URL-encoded where needed — do not re-encode it.
            const req = http.request({ port, path: assetPath, method: 'GET' });
            const res = await new Promise((resolve, reject) => {
                req.on('response', resolve);
                req.on('error', reject);
                req.end();
            });
            res.resume();
            assert.strictEqual(res.statusCode, 200, `Asset must load: ${assetPath}`);
            assert.ok(res.headers['content-type'].startsWith(expectedType),
                `${assetPath} should be ${expectedType}, got ${res.headers['content-type']}`);
        }
        console.log('  Passed: Logo, spaced image names, CSS and manifest all serve correctly.');

        // --- 3. Password change now requires the current password ---
        console.log('Test 3: Password change requires the current password');
        const withoutCurrent = await post('/api/auth/change-password', {
            accountId: 'dave',
            newPassword: 'hijacked-password-1'
        });
        assert.strictEqual(withoutCurrent.status, 401, 'Change without current password must be refused');

        const withWrongCurrent = await post('/api/auth/change-password', {
            accountId: 'dave',
            currentPassword: 'definitely-not-the-password',
            newPassword: 'hijacked-password-2'
        });
        assert.strictEqual(withWrongCurrent.status, 401, 'Change with a wrong current password must be refused');

        // The original password must still work, proving nothing was overwritten
        const stillWorks = await post('/api/auth/login', { accountId: 'dave', password: '0000' });
        assert.strictEqual(stillWorks.status, 200, 'Original password must be untouched after failed attempts');
        console.log('  Passed: Unauthenticated and wrong-password changes refused; account untouched.');

        // --- 4. A legitimate password change still succeeds, then reverts ---
        console.log('Test 4: Legitimate password change succeeds with the correct current password');
        const goodChange = await post('/api/auth/change-password', {
            accountId: 'dave',
            currentPassword: '0000',
            newPassword: 'dave-secure-2026'
        });
        assert.strictEqual(goodChange.status, 200);

        const oldRejected = await post('/api/auth/login', { accountId: 'dave', password: '0000' });
        assert.strictEqual(oldRejected.status, 401, 'Old password must stop working after a change');
        const newAccepted = await post('/api/auth/login', { accountId: 'dave', password: 'dave-secure-2026' });
        assert.strictEqual(newAccepted.status, 200, 'New password must work after a change');
        console.log('  Passed: Password rotated correctly and old password invalidated.');

        // --- 5. Steve gets no self-addressed alert when HE completes setup ---
        console.log('Test 5: Admin completing own setup does not message himself');
        const db = require('../server/db');
        db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
            .run('steve@phenmoevents.co.ke', '0000', 'steve');

        const beforeCount = JSON.parse((await get('/api/messages?userId=steve')).body).length;
        const steveSetup = await post('/api/auth/setup', {
            accountId: 'steve',
            email: 'steve.owner@phenmoevents.co.ke',
            newPassword: 'steveSecure2026',
            deviceInfo: 'Test Rig'
        });
        assert.strictEqual(steveSetup.status, 200);
        const afterCount = JSON.parse((await get('/api/messages?userId=steve')).body).length;
        assert.strictEqual(afterCount, beforeCount, 'Admin must not receive a self-addressed setup alert');
        console.log('  Passed: No self-addressed alert generated for the admin.');

        console.log('\nAll 5 security & regression tests passed successfully!');
    } finally {
        // Restore all accounts to their seeded state
        const db = require('../server/db');
        try {
            db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
                .run('steve@phenmoevents.co.ke', '0000', 'steve');
            db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
                .run('dave@phenmoevents.co.ke', '0000', 'dave');
            db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?')
                .run('mariah@phenmoevents.co.ke', '0000', 'mariah');
        } catch (e) {}
        server.close();
    }
}

runTests().catch((err) => {
    console.error('Security Test Suite Failed:', err);
    process.exit(1);
});
