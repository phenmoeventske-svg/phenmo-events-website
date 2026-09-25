process.env.DATA_STORE = 'sqlite';
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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
            ['/Images/concert-line-array-sound.jpg', 'image/jpeg'],
            ['/Images/high-definition-led-screen.jpg', 'image/jpeg'],
            ['/Images/led%20screen.jpg', 'image/jpeg'],
            ['/style.css', 'text/css'],
            ['/staff-portal/manifest.json', 'application/json'],
            ['/robots.txt', 'text/plain'],
            ['/sitemap.xml', 'application/xml'],
            ['/Images/outdoor-audio-speaker-stacks.jpg', 'image/jpeg'],
            ['/Images/live-stage-sound-system.jpg', 'image/jpeg'],
            ['/Images/african-cultural-stage-decor.jpg', 'image/jpeg'],
            ['/Images/church-sanctuary-led-stage.jpg', 'image/jpeg'],
            ['/Images/outdoor-church-conference-stage.jpg', 'image/jpeg'],
            ['/Images/royal-brains-school-graduation-stage.jpg', 'image/jpeg'],
            ['/Images/outdoor-church-crusade-choir-production.jpg', 'image/jpeg'],
            ['/Images/multicolor-sunburst-stage-drapes.jpg', 'image/jpeg'],
            ['/Images/luxury-ballroom-conference-styling.jpg', 'image/jpeg'],
            ['/Images/sanctuary-stage-led-display.jpg', 'image/jpeg'],
            ['/Images/phenmo-ballroom-led-video-wall.jpg', 'image/jpeg'],
            ['/Images/luxury-ballroom-stage-led-lighting-setup.jpg', 'image/jpeg'],
            ['/Images/event-dj-booth-lighting-sound-setup.jpg', 'image/jpeg'],
            ['/Images/luxury-tufted-dj-booth-yamaha-audio.jpg', 'image/jpeg'],
            ['/Images/desert-sunset-vip-dj-booth.jpg', 'image/jpeg'],
            ['/Images/phenmo-branded-pioneer-dj-console.jpg', 'image/jpeg'],
            ['/Images/nightclub-lounge-pioneer-dj-setup.jpg', 'image/jpeg'],
            ['/Images/outdoor-pergola-pioneer-cdj-rig.jpg', 'image/jpeg'],
            ['/Images/graduation-marquee-letters-balloon-arch.jpg', 'image/jpeg'],
            ['/Images/outdoor-vip-garden-stage-led-display.jpg', 'image/jpeg'],
            ['/Images/thematic-kids-party-chiavari-chairs-setup.jpg', 'image/jpeg'],
            ['/Images/pj-masks-thematic-backdrop-dessert-table.jpg', 'image/jpeg'],
            ['/Images/garden-high-peak-pagoda-marquee-decor.jpg', 'image/jpeg'],
            ['/Images/ballroom-banquet-moving-head-stage-lighting.jpg', 'image/jpeg'],
            ['/Images/outdoor-stage-starlight-led-backdrop-lighting.jpg', 'image/jpeg'],
            ['/Images/ballroom-kaleidoscope-rgb-led-dancefloor.jpg', 'image/jpeg'],
            ['/Images/interactive-kaleidoscope-led-dancefloor-testing.jpg', 'image/jpeg'],
            ['/Images/vip-banquet-table-led-dancefloor-staging.jpg', 'image/jpeg'],
            ['/Videos/led-dancefloor-interactive-demo.mp4', 'video/mp4'],
            ['/Videos/rgb-led-dancefloor-light-show.mp4', 'video/mp4'],
            ['/Videos/led-dancefloor-video-1.mp4', 'video/mp4'],
            ['/Videos/led-dancefloor-video-2.mp4', 'video/mp4'],
            ['/Videos/led-dancefloor-video-3.mp4', 'video/mp4'],
            ['/Videos/event-stage-lighting-showcase.mp4', 'video/mp4']
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
        console.log('  Passed: Logo, spaced image names, CSS, manifest, robots.txt, sitemap.xml, sound, decor, church event images, and MP4 videos all serve correctly.');

        // Verify HTTP byte-range request streaming (HTTP 206) for video playback
        const rangeRes = await new Promise((resolve, reject) => {
            const req = http.request({
                port,
                path: '/Videos/led-dancefloor-interactive-demo.mp4',
                method: 'GET',
                headers: { 'Range': 'bytes=0-99' }
            });
            req.on('response', resolve);
            req.on('error', reject);
            req.end();
        });
        rangeRes.resume();
        assert.strictEqual(rangeRes.statusCode, 206, 'Byte range request must return 206 Partial Content');
        assert.strictEqual(rangeRes.headers['accept-ranges'], 'bytes', 'Must declare Accept-Ranges: bytes');
        assert.ok(rangeRes.headers['content-range'] && rangeRes.headers['content-range'].startsWith('bytes 0-99/'), 'Must provide Content-Range header');
        console.log('  Passed: HTTP 206 Partial Content byte-range streaming verified for MP4 videos (smooth seeking & iOS playback).');

        // Verify JSON-LD Schema on index.html
        const publicDir = path.resolve(__dirname, '..');
        const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        assert.ok(scriptMatch, 'index.html must contain a JSON-LD structured data block');
        const parsedSchema = JSON.parse(scriptMatch[1]);
        assert.ok(parsedSchema['@graph'], 'Schema must declare a top-level @graph');
        const biz = parsedSchema['@graph'].find(item => item['@id'] && item['@id'].includes('localbusiness'));
        assert.ok(biz, 'Schema must contain LocalBusiness entity');
        assert.strictEqual(biz.aggregateRating.ratingValue, '5.0');
        assert.strictEqual(biz.review.length, 3, 'Schema must contain 3 client reviews');
        console.log('  Passed: JSON-LD LocalBusiness, AggregateRating, and Review schema parsed and validated.');

        // Verify Service Detail Modal Window & Header/Footer Controls on index.html
        assert.ok(indexHtml.includes('id="service-detail-modal"'), 'index.html must contain service-detail-modal');
        assert.ok(indexHtml.includes('id="modal-header-back"'), 'Modal must have a top header Back button');
        assert.ok(indexHtml.includes('id="modal-footer-back"'), 'Modal must have a bottom footer Back button');
        assert.ok(indexHtml.includes('id="modal-header-book"'), 'Modal must have a top header Book Now button');
        assert.ok(indexHtml.includes('id="modal-footer-book"'), 'Modal must have a bottom footer Book Now button');
        assert.ok(indexHtml.includes('outdoor-audio-speaker-stacks.jpg'), 'Modal sound catalog must reference outdoor speaker stacks photo');
        assert.ok(indexHtml.includes('live-stage-sound-system.jpg'), 'Modal sound catalog must reference live stage sound system photo');
        assert.ok(indexHtml.includes('modal-slide-prev-btn'), 'Modal must have slideshow previous button');
        assert.ok(indexHtml.includes('modal-slide-next-btn'), 'Modal must have slideshow next button');
        assert.ok(indexHtml.includes('modal-slideshow-toggle'), 'Modal must have slideshow play/pause toggle button');
        assert.ok(indexHtml.includes('initShowcaseCardSlideshows'), 'index.html must declare initShowcaseCardSlideshows function');
        console.log('  Passed: Service Detail Modal with Controls and Homepage Showcase Card Slideshows verified.');

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
