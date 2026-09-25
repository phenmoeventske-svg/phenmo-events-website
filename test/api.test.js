process.env.DATA_STORE = 'sqlite';
const assert = require('node:assert');
const http = require('node:http');

// Helper to make JSON HTTP requests
function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                let parsed;
                try {
                    parsed = body ? JSON.parse(body) : null;
                } catch (e) {
                    parsed = body;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
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
    console.log('--- Starting Phenmo Database & API Test Suite ---');
    const db = require('../server/db');
    db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?').run('mariah@phenmoevents.co.ke', '0000', 'mariah');
    
    // Require server and listen on an available ephemeral port
    const server = require('../server');
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
        // 1. Test GET /api/accounts
        console.log('Test 1: GET /api/accounts');
        const accRes = await request({ port, path: '/api/accounts', method: 'GET' });
        assert.strictEqual(accRes.status, 200);
        assert.ok(Array.isArray(accRes.data));
        assert.ok(accRes.data.length >= 3);
        assert.ok(accRes.data.some(a => a.id === 'steve' && a.role === 'Managing Director'));
        assert.ok(accRes.data.some(a => a.id === 'mariah' && a.role === 'Admin'));
        assert.strictEqual(accRes.data[0].password, undefined, 'Passwords must not be exposed');
        console.log('  Passed: Accounts returned safely.');

        // 1b. Test POST /api/auth/gate (Master Security Gate)
        console.log('Test 1b: POST /api/auth/gate');
        const failGate = await request({ port, path: '/api/auth/gate', method: 'POST' }, { masterPassword: 'wrong' });
        assert.strictEqual(failGate.status, 401);

        const okGate = await request({ port, path: '/api/auth/gate', method: 'POST' }, { masterPassword: 'phenmo2026' });
        assert.strictEqual(okGate.status, 200);
        assert.strictEqual(okGate.data.success, true);
        console.log('  Passed: Master security gate verified correctly.');

        // 2. Test POST /api/auth/login
        console.log('Test 2: POST /api/auth/login');
        const failLogin = await request({ port, path: '/api/auth/login', method: 'POST' }, { accountId: 'steve', password: 'wrong' });
        assert.strictEqual(failLogin.status, 401);

        const okLogin = await request({ port, path: '/api/auth/login', method: 'POST' }, { accountId: 'steve', password: '0000' });
        assert.strictEqual(okLogin.status, 200);
        assert.strictEqual(okLogin.data.account.name, 'Steve');
        console.log('  Passed: Authentication operates correctly.');

        // 3. Test GET /api/inventory
        console.log('Test 3: GET /api/inventory');
        const invRes = await request({ port, path: '/api/inventory', method: 'GET' });
        assert.strictEqual(invRes.status, 200);
        assert.ok(Array.isArray(invRes.data));
        assert.strictEqual(invRes.data.length, 7, 'Must have all 7 warehouse departments');
        const totalItemsCount = invRes.data.reduce((sum, c) => sum + c.items.length, 0);
        // 776 physical assets:
        // - 4 CYCLOPS moving heads -> 1 row (-3)
        // - 10 CYCLOPS par lights -> 1 row (-9)
        // - 20 2m by 1m stage panels -> 1 row (-19)
        // - 80 adjustable stage legs -> 1 row (-79)
        // - 2 stage steps -> 1 row (-1)
        // - 41 stage c-clamps -> 1 row (-40)
        // - 25 stage single clamps -> 1 row (-24)
        // - 12 stage double clamps -> 1 row (-11)
        // - 29 stage velcro plates -> 1 row (-28)
        // - 38 multi-unit audio items (14 models) -> 14 rows (-24)
        // Total rows: 421 rows (after purging 117 lost in coast and reserved unrecoverable items).
        assert.strictEqual(totalItemsCount, 421, 'Expected 421 rows after purging reserved/lost-in-coast items and consolidating');
        console.log(`  Passed: 7 departments with 421 active inventory rows.`);

        // 3a. Consolidated CYCLOPS row keeps its unit count and serial numbers
        console.log('Test 3a: Consolidated CYCLOPS MOVING HEAD row');
        const visual = invRes.data.find((c) => c.id === 'visual');
        const movingHeads = visual.items.filter((i) => /CYCLOPS MOVING HEAD/i.test(i.name));
        assert.strictEqual(movingHeads.length, 1, 'Moving heads must collapse to a single row');
        assert.strictEqual(movingHeads[0].available, 4, 'Consolidated row must report 4 available units');
        assert.deepStrictEqual(
            movingHeads[0].serials.slice().sort(),
            ['S020110604061', 'S020110604062', 'S020110604076', 'S020110604084'],
            'All 4 unit serial numbers must be preserved'
        );
        assert.strictEqual(movingHeads[0].serialsJson, undefined, 'Raw serialsJson column must not leak');

        const parLights = visual.items.filter((i) => /CYCLOPS PAR LIGHT/i.test(i.name));
        assert.strictEqual(parLights.length, 1, 'Par lights must collapse to a single row');
        assert.strictEqual(parLights[0].available, 10, 'Consolidated par row must report 10 units');
        console.log('  Passed: 4 heads + 10 pars each collapsed to one row with counts intact.');

        // 3b. Test GET /api/inventory/search?q=KW153 (Search by model)
        console.log('Test 3b: GET /api/inventory/search?q=KW153');
        const searchRes = await request({ port, path: '/api/inventory/search?q=KW153', method: 'GET' });
        assert.strictEqual(searchRes.status, 200);
        assert.ok(Array.isArray(searchRes.data));
        assert.ok(searchRes.data.length > 0, 'Must find KW153 assets');
        assert.ok(searchRes.data.some((item) => item.model.includes('KW153') || item.name.includes('KW153')));
        console.log(`  Passed: Found ${searchRes.data.length} assets matching model "KW153".`);

        // 3c. Test GET /api/inventory/lookup?code=S1600401AL3 (Lookup by serial number)
        console.log('Test 3c: GET /api/inventory/lookup?code=S1600401AL3');
        const lookupRes = await request({ port, path: '/api/inventory/lookup?code=S1600401AL3', method: 'GET' });
        assert.strictEqual(lookupRes.status, 200);
        assert.strictEqual(lookupRes.data.serialNumber, 'S1600401AL3');
        assert.ok(lookupRes.data.name.includes('BEHRINGER'));
        console.log(`  Passed: Scanner lookup resolved exact hardware by serial number: ${lookupRes.data.name}.`);

        // Consolidated row must still resolve by any of its unit serial numbers.
        console.log('Test 3d: Consolidated unit serial resolves via lookup');
        for (const serial of ['S020110604061', 'S020110604062', 'S020110604076', 'S020110604084']) {
            const bySerial = await request({ port, path: `/api/inventory/lookup?code=${serial}`, method: 'GET' });
            assert.strictEqual(bySerial.status, 200, `Serial ${serial} must resolve`);
            assert.strictEqual(bySerial.data.name, 'CYCLOPS MOVING HEAD');
            assert.strictEqual(bySerial.data.available, 4);
        }
        console.log('  Passed: All 4 consolidated unit serials resolve to the merged row.');

        // 3e. Test Consolidated 2m by 1m Stage Panel row
        console.log('Test 3e: Consolidated 2m by 1m STAGE PANEL row');
        const stage = invRes.data.find((c) => c.id === 'stage');
        const stagePanels = stage.items.filter((i) => /2m by 1m Stage Panel/i.test(i.name));
        assert.strictEqual(stagePanels.length, 1, '2m by 1m stage panels must collapse to a single row');
        assert.strictEqual(stagePanels[0].available, 20, 'Consolidated stage panel row must report 20 available units');
        console.log('  Passed: 20 2m by 1m stage panels collapsed to one row with 20 available units.');

        // 3f. Test Consolidated Adjustable Stage Legs row
        console.log('Test 3f: Consolidated Adjustable Stage Legs row');
        const stageLegs = stage.items.filter((i) => /Adjustable Stage Legs/i.test(i.name));
        assert.strictEqual(stageLegs.length, 1, 'Adjustable stage legs must collapse to a single row');
        assert.strictEqual(stageLegs[0].available, 78, 'Consolidated stage legs row must report 78 available units');
        assert.strictEqual(stageLegs[0].model, '60cm-93cm');
        console.log('  Passed: 80 stage legs collapsed to one row with 78 available units.');

        // 3g. Test Consolidated Stage Steps row
        console.log('Test 3g: Consolidated Stage Steps row');
        const stageSteps = stage.items.filter((i) => /Stage Steps/i.test(i.name));
        assert.strictEqual(stageSteps.length, 1, 'Stage steps must collapse to a single row');
        assert.strictEqual(stageSteps[0].available, 2, 'Consolidated stage steps row must report 2 available units');
        console.log('  Passed: 2 stage steps collapsed to one row with 2 available units.');

        // 3h. Test Consolidated Stage C-Clamps row
        console.log('Test 3h: Consolidated Stage C-Clamps row');
        const stageCClamps = stage.items.filter((i) => /Stage C-Clamps/i.test(i.name));
        assert.strictEqual(stageCClamps.length, 1, 'Stage C-clamps must collapse to a single row');
        assert.strictEqual(stageCClamps[0].available, 41, 'Consolidated stage C-clamps row must report 41 available units');
        console.log('  Passed: 41 stage C-clamps collapsed to one row with 41 available units.');

        // 3i. Test Consolidated Stage Single Clamps row
        console.log('Test 3i: Consolidated Stage Single Clamps row');
        const stageSingleClamps = stage.items.filter((i) => /Stage Single Clamps/i.test(i.name));
        assert.strictEqual(stageSingleClamps.length, 1, 'Stage single clamps must collapse to a single row');
        assert.strictEqual(stageSingleClamps[0].available, 18, 'Consolidated stage single clamps row must report 18 available units');
        assert.ok(stageSingleClamps[0].notes.includes('Need Repair'), 'Must show units that need repair in notes');
        console.log('  Passed: 25 stage single clamps collapsed to one row showing 18 available and units needing repair.');

        // 3j. Test Consolidated Stage Double Clamps row
        console.log('Test 3j: Consolidated Stage Double Clamps row');
        const stageDoubleClamps = stage.items.filter((i) => /Stage Double Clamps/i.test(i.name));
        assert.strictEqual(stageDoubleClamps.length, 1, 'Stage double clamps must collapse to a single row');
        assert.strictEqual(stageDoubleClamps[0].available, 12, 'Consolidated stage double clamps row must report 12 available units');
        console.log('  Passed: 12 stage double clamps collapsed to one row with 12 available units.');

        // 3k. Test Consolidated Stage Velcro Plates row
        console.log('Test 3k: Consolidated Stage Velcro Plates row');
        const stageVelcroPlates = stage.items.filter((i) => /Stage Velcro Plates/i.test(i.name));
        assert.strictEqual(stageVelcroPlates.length, 1, 'Stage velcro plates must collapse to a single row');
        assert.strictEqual(stageVelcroPlates[0].available, 29, 'Consolidated stage velcro plates row must report 29 available units');
        console.log('  Passed: 29 stage velcro plates collapsed to one row with 29 available units.');

        // 3l. Test Consolidated Audio & Sound models
        console.log('Test 3l: Consolidated Audio & Sound models');
        const audio = invRes.data.find((c) => c.id === 'audio');
        assert.strictEqual(audio.items.length, 29, 'Audio items must be consolidated into 29 active rows (after purging reserved/lost)');

        // Check KW153 model row
        const kw153 = audio.items.find((i) => i.id === 'eq-0010');
        assert.ok(kw153, 'KW153 row must exist');
        assert.strictEqual(kw153.available, 1, 'KW153 must have 1 available unit');
        assert.ok(kw153.serials.includes('GCC650294') && kw153.serials.includes('GCC650293'), 'Both KW153 unit serials must be preserved');

        // Check PG58 model row
        const pg58 = audio.items.find((i) => i.id === 'eq-0041');
        assert.ok(pg58, 'PG58 row must exist');
        assert.strictEqual(pg58.available, 7, 'PG58 must have 7 available units');
        assert.strictEqual(pg58.serials.length, 8, 'PG58 must preserve all 8 physical unit serials');

        // Check SM57 model row
        const sm57 = audio.items.find((i) => i.id === 'eq-0051');
        assert.ok(sm57, 'SM57 row must exist');
        assert.strictEqual(sm57.available, 3, 'SM57 must have 3 available units');

        // Verify barcode lookup on secondary serial numbers resolves to consolidated row
        const kwLookup = await request({ port, path: '/api/inventory/lookup?code=GCC650293', method: 'GET' });
        assert.strictEqual(kwLookup.status, 200, 'Secondary serial GCC650293 must resolve');
        assert.strictEqual(kwLookup.data.id, 'eq-0010', 'Must resolve to primary KW153 row');

        const pgLookup = await request({ port, path: '/api/inventory/lookup?code=3PK1707915', method: 'GET' });
        assert.strictEqual(pgLookup.status, 200, 'Secondary serial 3PK1707915 must resolve');
        assert.strictEqual(pgLookup.data.id, 'eq-0041', 'Must resolve to primary PG58 row');
        console.log('  Passed: Audio models compiled into 29 active rows with unit counts and barcode lookups intact.');

        // Pick dynamic real test item
        const testItem = invRes.data[0].items[0];
        const testItemId = testItem.id;

        // 4. Test PUT /api/inventory/:id
        console.log(`Test 4: PUT /api/inventory/${testItemId}`);
        const updateInv = await request({ port, path: `/api/inventory/${testItemId}`, method: 'PUT' }, {
            available: testItem.available,
            status: 'Available',
            condition: 'Excellent',
            notes: 'Verified in automated test suite'
        });
        assert.strictEqual(updateInv.status, 200);
        assert.strictEqual(updateInv.data.notes, 'Verified in automated test suite');
        assert.strictEqual(updateInv.data.condition, 'Excellent');
        console.log('  Passed: Real inventory item updated in database.');

        // 5. Test POST /api/events (Create event)
        console.log('Test 5: POST /api/events');
        const testEvent = {
            id: `test-${Date.now()}`,
            eventName: 'Automated Test Gala',
            clientName: 'Test Corp Ltd',
            eventDate: '2026-11-15',
            venue: 'Nairobi Serena',
            startTime: '18:00',
            endTime: '22:00',
            setupTime: '15:00',
            breakdownTime: '23:00',
            equipmentBooked: 'Sound & LED screens',
            assignedTo: 'mariah',
            status: 'Planned',
            inventoryBooked: [
                { itemId: testItemId, quantity: 1, returnedCondition: '' }
            ]
        };

        const createRes = await request({ port, path: '/api/events', method: 'POST' }, testEvent);
        assert.strictEqual(createRes.status, 201);
        assert.strictEqual(createRes.data.eventName, 'Automated Test Gala');
        assert.strictEqual(createRes.data.inventoryBooked.length, 1);
        console.log('  Passed: Event created with relational inventory items.');

        // 6. Test GET /api/events/:id
        console.log('Test 6: GET /api/events/:id');
        const getRes = await request({ port, path: `/api/events/${testEvent.id}`, method: 'GET' });
        assert.strictEqual(getRes.status, 200);
        assert.strictEqual(getRes.data.clientName, 'Test Corp Ltd');
        console.log('  Passed: Event fetched by ID from SQLite.');

        // 7. Test PUT /api/events/:id (Update event with damage photo)
        console.log('Test 7: PUT /api/events/:id');
        testEvent.status = 'Confirmed';
        testEvent.inventoryBooked = [
            {
                itemId: testItemId,
                quantity: 1,
                returnedCondition: 'Damaged',
                damageDetails: {
                    serialNumber: testItem.serialNumber || 'SN-TEST-88',
                    problem: 'Blown bulb filament',
                    photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
                }
            }
        ];
        const putRes = await request({ port, path: `/api/events/${testEvent.id}`, method: 'PUT' }, testEvent);
        assert.strictEqual(putRes.status, 200);
        assert.strictEqual(putRes.data.status, 'Confirmed');
        assert.strictEqual(putRes.data.inventoryBooked[0].damageDetails.photo, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
        console.log('  Passed: Event updated in database with damage photo persistence.');

        // 8. Test DELETE /api/events/:id
        console.log('Test 8: DELETE /api/events/:id');
        const delRes = await request({ port, path: `/api/events/${testEvent.id}`, method: 'DELETE' });
        assert.strictEqual(delRes.status, 200);
        const checkDel = await request({ port, path: `/api/events/${testEvent.id}`, method: 'GET' });
        assert.strictEqual(checkDel.status, 404);
        console.log('  Passed: Event deleted and cascaded cleanly.');

        // 9. Test POST & GET /api/messages
        console.log('Test 9: Messages API');
        const msgRes = await request({ port, path: '/api/messages', method: 'POST' }, {
            senderId: 'steve',
            recipientId: 'dave',
            text: 'Database API verification message'
        });
        assert.strictEqual(msgRes.status, 201);

        const listMsg = await request({ port, path: '/api/messages?userId=dave', method: 'GET' });
        assert.strictEqual(listMsg.status, 200);
        assert.ok(listMsg.data.some(m => m.text === 'Database API verification message'));
        console.log('  Passed: Messages stored and retrieved.');

        // 10. Test GET /api/stats
        console.log('Test 10: GET /api/stats');
        const statsRes = await request({ port, path: '/api/stats', method: 'GET' });
        assert.strictEqual(statsRes.status, 200);
        assert.ok(typeof statsRes.data.totalEvents === 'number');
        assert.ok(typeof statsRes.data.totalAvailableUnits === 'number');
        console.log('  Passed: Aggregated KPIs computed successfully.');

        // 11. Test /api/state (Full state synchronization)
        console.log('Test 11: Full State Sync (/api/state)');
        const stateRes = await request({ port, path: '/api/state', method: 'GET' });
        assert.strictEqual(stateRes.status, 200);
        assert.ok(Array.isArray(stateRes.data.events));
        assert.ok(Array.isArray(stateRes.data.inventory));
        assert.ok(Array.isArray(stateRes.data.accounts));

        const syncRes = await request({ port, path: '/api/state', method: 'POST' }, stateRes.data);
        assert.strictEqual(syncRes.status, 200);
        console.log('  Passed: Full state sync reads and writes to SQLite.');

        // 12. Test First-Time Login requiring setup with 0000
        console.log('Test 12: First-time login with 0000 flags requiresSetup');
        const firstLogin = await request({ port, path: '/api/auth/login', method: 'POST' }, {
            accountId: 'mariah',
            password: '0000'
        });
        assert.strictEqual(firstLogin.status, 200);
        assert.strictEqual(firstLogin.data.requiresSetup, true);
        assert.strictEqual(firstLogin.data.account.id, 'mariah');
        console.log('  Passed: Default password 0000 correctly flagged for first-time account setup.');

        // 13. Test POST /api/auth/setup (Complete setup and notify Steve)
        console.log('Test 13: POST /api/auth/setup activates account & notifies Managing Director Steve');
        const setupRes = await request({ port, path: '/api/auth/setup', method: 'POST' }, {
            accountId: 'mariah',
            email: 'mariah.lead@phenmoevents.co.ke',
            newPassword: 'mariahPassword2026!',
            deviceInfo: 'Android Phone (Phenmo App)'
        });
        assert.strictEqual(setupRes.status, 200);
        assert.strictEqual(setupRes.data.requiresSetup, false);
        assert.strictEqual(setupRes.data.account.email, 'mariah.lead@phenmoevents.co.ke');

        // Verify Steve's messages contains the First Login Alert
        const steveMessages = await request({ port, path: '/api/messages?userId=steve', method: 'GET' });
        assert.strictEqual(steveMessages.status, 200);
        const alertMsg = steveMessages.data.find(m => m.text && m.text.includes('First Staff Login Alert') && m.text.includes('Mariah'));
        assert.ok(alertMsg, 'Managing Director Steve must receive an automated alert message for Mariah\'s first setup');
        assert.ok(alertMsg.text.includes('mariah.lead@phenmoevents.co.ke'));
        assert.ok(alertMsg.text.includes('Android Phone (Phenmo App)'));
        console.log('  Passed: Permanent email captured, new password set, and Managing Director Steve notified.');

        // 14. Test Routine Login with registered email & new password (NO Admin notification)
        console.log('Test 14: Routine login with permanent email & new password (No notification)');
        const msgCountBefore = steveMessages.data.length;
        const routineLogin = await request({ port, path: '/api/auth/login', method: 'POST' }, {
            email: 'mariah.lead@phenmoevents.co.ke',
            password: 'mariahPassword2026!'
        });
        assert.strictEqual(routineLogin.status, 200);
        assert.strictEqual(routineLogin.data.requiresSetup, false);
        assert.strictEqual(routineLogin.data.account.id, 'mariah');

        // Check Steve's messages count did not increase on routine login
        const steveMessagesAfter = await request({ port, path: '/api/messages?userId=steve', method: 'GET' });
        assert.strictEqual(steveMessagesAfter.data.length, msgCountBefore, 'Routine login must not send additional notifications to admin');
        console.log('  Passed: Routine email login succeeded without triggering admin alert.');

        // 15. Test that old code 0000 no longer works after setup
        console.log('Test 15: Initial code 0000 is rejected after setup completion');
        const oldCodeLogin = await request({ port, path: '/api/auth/login', method: 'POST' }, {
            email: 'mariah.lead@phenmoevents.co.ke',
            password: '0000'
        });
        assert.strictEqual(oldCodeLogin.status, 401);
        console.log('  Passed: Default 0000 password safely rejected after account activation.');

        console.log('\nAll 15 Database, API & Authentication tests passed successfully!');
    } finally {
        const db = require('../server/db');
        try {
            db.db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?').run('mariah@phenmoevents.co.ke', '0000', 'mariah');
        } catch (e) {}
        server.close();
    }
}

runTests().catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
