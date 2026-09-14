// ==============================================================================
// PHENMO EVENTS — SYNC LOCAL DATA TO SUPABASE
// ==============================================================================
// Run this script after setting SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
// Usage: npm run sync:supabase   OR   node server/sync-to-supabase.js
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const supabaseApi = require('./supabase');

if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch (e) {
        // .env file is optional
    }
}

async function syncToSupabase() {
    console.log('--- Starting Phenmo -> Supabase Cloud Migration ---');

    if (!supabaseApi.isConfigured()) {
        console.error('Error: Supabase is not configured.');
        console.error('Please add your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file:');
        console.error('  SUPABASE_URL=https://your-project.supabase.co');
        console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...');
        process.exit(1);
    }

    const client = supabaseApi.getClient();
    const dbPath = path.join(__dirname, '..', 'data', 'phenmo.db');
    if (!fs.existsSync(dbPath)) {
        console.error('Error: SQLite database not found at', dbPath);
        process.exit(1);
    }

    const db = new DatabaseSync(dbPath);

    // 1. Sync Accounts
    console.log('1. Syncing staff accounts...');
    const accounts = db.prepare('SELECT id, name, role, email, password, created_at FROM accounts').all();
    const { error: accError } = await client
        .from('accounts')
        .upsert(accounts, { onConflict: 'id' });
    if (accError) {
        if (accError.message && accError.message.includes('schema cache')) {
            console.error('\n⚠️  Supabase Tables Not Found in Database!');
            console.error('To initialize the tables:');
            console.error('  1. Open your Supabase Dashboard (https://supabase.com/dashboard/project/umsrfbsanpjpqkppyltl).');
            console.error('  2. Click "SQL Editor" (>_ icon on the left menu).');
            console.error('  3. Click "New Query", paste the entire contents of "supabase/schema.sql", and click "Run".');
            console.error('  4. Then run: npm run sync:supabase\n');
            process.exit(1);
        }
        console.error('  Failed to sync accounts:', accError.message);
    } else {
        console.log(`  Synced ${accounts.length} accounts.`);
    }

    // 2. Sync Categories
    console.log('2. Syncing inventory categories...');
    const categories = db.prepare('SELECT id, name, sort_order FROM inventory_categories').all();
    const { error: catError } = await client
        .from('inventory_categories')
        .upsert(categories, { onConflict: 'id' });
    if (catError) {
        console.error('  Failed to sync categories:', catError.message);
    } else {
        console.log(`  Synced ${categories.length} categories.`);
    }

    // 3. Sync Inventory Items (in batches of 100)
    console.log('3. Syncing inventory items...');
    const items = db.prepare(`
        SELECT id, category_id, name, available, status, notes,
               COALESCE(model, '') as model,
               COALESCE(serial_number, '') as serial_number,
               COALESCE(serials, '[]') as serials_raw,
               COALESCE(sub_category, '') as sub_category,
               COALESCE(condition, 'Good') as condition,
               COALESCE(location, 'In Store') as location
        FROM inventory_items
    `).all();

    const formattedItems = items.map((it) => {
        let serials = [];
        try {
            serials = JSON.parse(it.serials_raw);
        } catch (e) {
            serials = [];
        }
        return {
            id: it.id,
            category_id: it.category_id,
            name: it.name,
            available: it.available,
            status: it.status,
            notes: it.notes,
            model: it.model,
            serial_number: it.serial_number,
            serials: Array.isArray(serials) ? serials : [],
            sub_category: it.sub_category,
            condition: it.condition,
            location: it.location
        };
    });

    const batchSize = 100;
    let syncedItemsCount = 0;
    for (let i = 0; i < formattedItems.length; i += batchSize) {
        const batch = formattedItems.slice(i, i + batchSize);
        const { error: itemError } = await client
            .from('inventory_items')
            .upsert(batch, { onConflict: 'id' });
        if (itemError) {
            console.error(`  Batch ${i / batchSize + 1} error:`, itemError.message);
        } else {
            syncedItemsCount += batch.length;
        }
    }
    console.log(`  Synced ${syncedItemsCount} of ${formattedItems.length} inventory items.`);

    // 4. Sync Events & Event Inventory
    console.log('4. Syncing events...');
    const events = db.prepare('SELECT * FROM events').all();
    if (events.length > 0) {
        const formattedEvents = events.map((e) => ({
            id: e.id,
            event_name: e.event_name,
            client_name: e.client_name,
            event_date: e.event_date,
            venue: e.venue,
            start_time: e.start_time,
            end_time: e.end_time,
            setup_time: e.setup_time,
            breakdown_time: e.breakdown_time,
            equipment_booked: e.equipment_booked,
            returned_equipment: e.returned_equipment,
            notes: e.notes,
            assigned_to: e.assigned_to,
            status: e.status
        }));
        const { error: evtError } = await client
            .from('events')
            .upsert(formattedEvents, { onConflict: 'id' });
        if (evtError) {
            console.error('  Failed to sync events:', evtError.message);
        } else {
            console.log(`  Synced ${formattedEvents.length} events.`);
        }
    }

    // 5. Sync Messages
    console.log('5. Syncing messages...');
    const messages = db.prepare('SELECT id, sender_id, recipient_id, text, sent_at FROM messages').all();
    if (messages.length > 0) {
        const { error: msgError } = await client
            .from('messages')
            .upsert(messages, { onConflict: 'id' });
        if (msgError) {
            console.error('  Failed to sync messages:', msgError.message);
        } else {
            console.log(`  Synced ${messages.length} messages.`);
        }
    }

    console.log('\n--- Sync Complete! Phenmo data is now live on Supabase ---');
}

if (require.main === module) {
    syncToSupabase().catch((err) => {
        console.error('Fatal sync error:', err);
        process.exit(1);
    });
}

module.exports = syncToSupabase;

