const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'phenmo.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Initialize schema
function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS inventory_items (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL REFERENCES inventory_categories(id),
            name TEXT NOT NULL,
            available INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Available',
            notes TEXT,
            FOREIGN KEY (category_id) REFERENCES inventory_categories(id)
        );

        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            event_name TEXT NOT NULL,
            client_name TEXT NOT NULL,
            event_date TEXT NOT NULL,
            venue TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            setup_time TEXT NOT NULL,
            breakdown_time TEXT NOT NULL,
            equipment_booked TEXT,
            returned_equipment TEXT,
            notes TEXT,
            assigned_to TEXT REFERENCES accounts(id),
            status TEXT NOT NULL DEFAULT 'Planned',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS event_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            returned_condition TEXT,
            damage_serial_number TEXT,
            damage_problem TEXT,
            damage_photo TEXT,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES inventory_items(id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL REFERENCES accounts(id),
            recipient_id TEXT NOT NULL REFERENCES accounts(id),
            text TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Ensure damage_photo column exists for existing databases
    try {
        const tableInfo = db.prepare('PRAGMA table_info(event_inventory)').all();
        const hasDamagePhoto = tableInfo.some((col) => col.name === 'damage_photo');
        if (!hasDamagePhoto) {
            db.prepare('ALTER TABLE event_inventory ADD COLUMN damage_photo TEXT').run();
        }
    } catch (e) {
        // Table may not have been created yet on first boot
    }

    // Ensure hardware asset tracking columns exist for inventory_items
    try {
        const itemCols = db.prepare('PRAGMA table_info(inventory_items)').all();
        const colNames = itemCols.map((col) => col.name);
        if (!colNames.includes('model')) db.prepare('ALTER TABLE inventory_items ADD COLUMN model TEXT DEFAULT ""').run();
        if (!colNames.includes('serial_number')) db.prepare('ALTER TABLE inventory_items ADD COLUMN serial_number TEXT DEFAULT ""').run();
        // Consolidated rows keep every physical unit's serial here as JSON.
        if (!colNames.includes('serials')) db.prepare('ALTER TABLE inventory_items ADD COLUMN serials TEXT DEFAULT "[]"').run();
        if (!colNames.includes('sub_category')) db.prepare('ALTER TABLE inventory_items ADD COLUMN sub_category TEXT DEFAULT ""').run();
        if (!colNames.includes('condition')) db.prepare('ALTER TABLE inventory_items ADD COLUMN condition TEXT DEFAULT "Good"').run();
        if (!colNames.includes('location')) db.prepare('ALTER TABLE inventory_items ADD COLUMN location TEXT DEFAULT "In Store"').run();
    } catch (e) {
        // Table may not have been created yet on first boot
    }
}

// Seed default data if database is brand new
function seedIfEmpty() {
    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
    if (accountCount.count === 0) {
        const insertAccount = db.prepare(`
            INSERT INTO accounts (id, name, role, email, password)
            VALUES (?, ?, ?, ?, ?)
        `);

        insertAccount.run('steve', 'Steve', 'Admin', 'steve@phenmoevents.co.ke', normalizeStoredPassword('0000'));
        insertAccount.run('mariah', 'Mariah', 'Manager', 'mariah@phenmoevents.co.ke', normalizeStoredPassword('0000'));
        insertAccount.run('dave', 'Dave', 'Technician', 'dave@phenmoevents.co.ke', normalizeStoredPassword('0000'));
    }

    const catCount = db.prepare('SELECT COUNT(*) as count FROM inventory_categories').get();
    if (catCount.count === 0) {
        syncInventoryFromSource();
    }

    const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
    if (eventCount.count === 0) {
        const insertEvent = db.prepare(`
            INSERT INTO events (id, event_name, client_name, event_date, venue, start_time, end_time, setup_time, breakdown_time, equipment_booked, returned_equipment, notes, assigned_to, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertEvent.run(
            'evt-001',
            'Wedding Reception',
            'Amina & Daniel',
            '2026-09-20',
            'Nairobi Garden Hotel',
            '15:00',
            '22:30',
            '12:30',
            '23:00',
            '2 line array speakers, 1 LED screen, 4 lighting trusses, 1 DJ setup',
            '',
            'Need an elegant lighting setup and strong sound coverage for the main hall.',
            'dave',
            'Planned'
        );

        insertEvent.run(
            'evt-002',
            'Corporate Launch',
            'BluePeak Ltd',
            '2026-09-25',
            'Kenyatta International Convention Centre',
            '09:00',
            '13:00',
            '07:00',
            '13:30',
            '1 LED screen, 1 projector, event lighting, sound system',
            '',
            'Company wants a formal stage look with crisp audio and presentation support.',
            'mariah',
            'Confirmed'
        );

        insertEvent.run(
            'evt-003',
            'Birthday Bash',
            'Joyline Muthoni',
            '2026-09-27',
            'Westlands Lounge',
            '18:00',
            '23:00',
            '16:30',
            '23:30',
            'Sound system, LED dance floor, decorative lighting, DJ services',
            '',
            'House playlist and dance floor lighting are key priorities for this event.',
            'dave',
            'In Progress'
        );
    }
}

initSchema();
seedIfEmpty();

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'inventory';
}

function normalizeInventorySource(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    if (Array.isArray(data)) {
        return { categories: data };
    }

    if (Array.isArray(data.categories)) {
        return { categories: data.categories };
    }

    if (Array.isArray(data.inventory)) {
        return { categories: data.inventory };
    }

    if (Array.isArray(data.items)) {
        return {
            categories: [{
                id: 'default',
                name: data.name || 'Inventory',
                sort_order: data.sort_order || 0,
                items: data.items
            }]
        };
    }

    return null;
}

function loadInventorySourceFromFile() {
    const defaultRootPath = path.join(__dirname, '..', 'company-inventory.json');
    const defaultDataPath = path.join(dataDir, 'company-inventory.json');
    const configuredPath = process.env.PHENMO_INVENTORY_SOURCE;
    const candidatePaths = [configuredPath, defaultRootPath, defaultDataPath].filter(Boolean);

    for (const candidatePath of candidatePaths) {
        if (!candidatePath || !fs.existsSync(candidatePath)) {
            continue;
        }

        try {
            const raw = fs.readFileSync(candidatePath, 'utf8');
            const parsed = JSON.parse(raw);
            return normalizeInventorySource(parsed);
        } catch (err) {
            console.warn(`Unable to load inventory source from ${candidatePath}:`, err.message);
            return null;
        }
    }

    return null;
}

function syncInventoryFromSource() {
    const inventorySource = loadInventorySourceFromFile();

    if (!inventorySource || !Array.isArray(inventorySource.categories)) {
        return;
    }

    for (const category of inventorySource.categories) {
        if (!category || typeof category !== 'object') {
            continue;
        }

        const categoryId = category.id || slugify(category.name || 'Inventory');
        const categoryName = category.name || 'Inventory';
        const sortOrder = Number(category.sort_order) || 0;

        db.prepare(`
            INSERT OR REPLACE INTO inventory_categories (id, name, sort_order)
            VALUES (?, ?, ?)
        `).run(categoryId, categoryName, sortOrder);

        const items = Array.isArray(category.items) ? category.items : [];
        for (const item of items) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            const itemId = item.id || slugify(item.name || categoryId);
            const itemName = item.name || itemId;
            const available = Number(item.available) || 0;
            const status = item.status || 'Available';
            const notes = item.notes || '';
            const model = item.model || '';
            const serialNumber = item.serialNumber || item.serial_number || '';
            const subCategory = item.subCategory || item.sub_category || '';
            const condition = item.condition || 'Good';
            const location = item.location || 'In Store';
            const serials = Array.isArray(item.serials) ? item.serials : [];

            db.prepare(`
                INSERT OR REPLACE INTO inventory_items (
                    id, category_id, name, available, status, notes,
                    model, serial_number, sub_category, condition, location, serials
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(itemId, categoryId, itemName, available, status, notes, model, serialNumber, subCategory, condition, location, JSON.stringify(serials));
        }
    }

    // Prune orphaned inventory items not in the authoritative source
    const allSourceIds = new Set();
    for (const category of inventorySource.categories) {
        if (!category || typeof category !== 'object') continue;
        const items = Array.isArray(category.items) ? category.items : [];
        for (const item of items) {
            if (item && item.id) allSourceIds.add(item.id);
        }
    }

    if (allSourceIds.size > 0) {
        const existingItems = db.prepare('SELECT id FROM inventory_items').all();
        for (const existing of existingItems) {
            if (!allSourceIds.has(existing.id)) {
                const hasRef = db.prepare('SELECT 1 FROM event_inventory WHERE item_id = ?').get(existing.id);
                if (!hasRef) {
                    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(existing.id);
                }
            }
        }
    }
}

syncInventoryFromSource();

function normalizeStoredPassword(password) {
    if (!password || typeof password !== 'string') {
        return '';
    }

    if (password.startsWith('$2a$') || password.startsWith('$2b$')) {
        return password;
    }

    return bcrypt.hashSync(password, 10);
}

// Strip the raw `serialsJson` column from a row before it leaves the data layer.
function withSerials(row) {
    if (!row) return row;
    const { serialsJson, ...rest } = row;
    return { ...rest, serials: parseSerials(serialsJson) };
}

// Consolidated rows store their unit serials as a JSON array in `serials`.
function parseSerials(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (err) {
        return [];
    }
}

function verifyStoredPassword(candidatePassword, storedPassword) {
    if (!candidatePassword || !storedPassword) {
        return false;
    }

    if (storedPassword === candidatePassword) {
        return true;
    }

    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
        return bcrypt.compareSync(candidatePassword, storedPassword);
    }

    return false;
}

// Helper database queries
module.exports = {
    db,

    // Accounts
    getAccounts() {
        return db.prepare('SELECT id, name, role, email, password, created_at FROM accounts ORDER BY name ASC').all();
    },

    getAccountById(id) {
        return db.prepare('SELECT id, name, role, email, password, created_at FROM accounts WHERE id = ?').get(id);
    },

    getAccountByEmail(email) {
        if (!email || typeof email !== 'string') return null;
        return db.prepare('SELECT id, name, role, email, password, created_at FROM accounts WHERE LOWER(email) = LOWER(?)').get(email.trim());
    },

    getAccountByIdOrEmail(identifier) {
        if (!identifier || typeof identifier !== 'string') return null;
        const clean = identifier.trim();
        return db.prepare('SELECT id, name, role, email, password, created_at FROM accounts WHERE id = ? OR LOWER(email) = LOWER(?)').get(clean, clean);
    },

    verifyPassword(candidatePassword, storedPassword) {
        return verifyStoredPassword(candidatePassword, storedPassword);
    },

    updatePassword(id, newPassword) {
        if (!newPassword || typeof newPassword !== 'string') {
            return null;
        }

        const normalizedPassword = normalizeStoredPassword(newPassword.trim());
        return db.prepare('UPDATE accounts SET password = ? WHERE id = ?').run(normalizedPassword, id);
    },

    completeFirstTimeSetup(accountId, email, newPassword, deviceInfo = '') {
        const account = this.getAccountById(accountId);
        if (!account) {
            throw new Error('Account not found');
        }

        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPassword = (newPassword || '').trim();

        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            throw new Error('A valid work email address is required');
        }
        if (!cleanPassword || cleanPassword.length < 4) {
            throw new Error('New password must be at least 4 characters');
        }
        if (cleanPassword === '0000') {
            throw new Error('New password cannot be the default code 0000');
        }

        // Check if email is already taken by another account
        const existingWithEmail = db.prepare('SELECT id FROM accounts WHERE LOWER(email) = LOWER(?) AND id != ?').get(cleanEmail, accountId);
        if (existingWithEmail) {
            throw new Error('This email address is already registered to another staff account');
        }

        // Update permanent email and new password in SQLite
        const normalizedPassword = normalizeStoredPassword(cleanPassword);
        db.prepare('UPDATE accounts SET email = ?, password = ? WHERE id = ?').run(cleanEmail, normalizedPassword, accountId);

        // Send activation notification to Admin Steve
        const now = new Date();
        const timeFormatted = now.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const deviceStr = deviceInfo ? ` Device: ${deviceInfo}.` : '';
        const alertText = `🔔 First Staff Login Alert: ${account.name} (${account.role}) completed first-time setup on ${timeFormatted}.${deviceStr} Permanent email: ${cleanEmail}.`;

        // Only notify the admin about OTHER staff. If the admin completes their
        // own setup, the alert would be a self-addressed message cluttering
        // their own inbox.
        if (accountId !== 'steve') {
            this.sendMessage(accountId, 'steve', alertText);
        }

        return this.getAccountById(accountId);
    },

    // Inventory
    getInventory() {
        const categories = db.prepare('SELECT id, name FROM inventory_categories ORDER BY sort_order ASC').all();
        const items = db.prepare(`
            SELECT id, category_id, name, available, status, notes,
                   COALESCE(model, '') as model,
                   COALESCE(serial_number, '') as serialNumber,
                   COALESCE(serials, '[]') as serialsJson,
                   COALESCE(sub_category, '') as subCategory,
                   COALESCE(condition, 'Good') as condition,
                   COALESCE(location, 'In Store') as location
            FROM inventory_items
            ORDER BY name ASC
        `).all();

        return categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            items: items
                .filter((item) => item.category_id === cat.id)
                .map(withSerials)
        }));
    },

    updateInventoryItem(id, updates) {
        const current = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
        if (!current) return null;

        const available = typeof updates.available === 'number' ? updates.available : current.available;
        const status = updates.status || current.status;
        const notes = updates.notes !== undefined ? updates.notes : current.notes;
        const condition = updates.condition || current.condition || 'Good';
        const location = updates.location || current.location || 'In Store';
        const serials = updates.serials !== undefined
            ? JSON.stringify(parseSerials(updates.serials))
            : (current.serials || '[]');

        db.prepare(`
            UPDATE inventory_items
            SET available = ?, status = ?, notes = ?, condition = ?, location = ?, serials = ?
            WHERE id = ?
        `).run(
            available,
            status,
            notes,
            condition,
            location,
            serials,
            id
        );

        const updated = db.prepare(`
            SELECT id, category_id, name, available, status, notes,
                   COALESCE(model, '') as model,
                   COALESCE(serial_number, '') as serialNumber,
                   COALESCE(serials, '[]') as serialsJson,
                   COALESCE(sub_category, '') as subCategory,
                   COALESCE(condition, 'Good') as condition,
                   COALESCE(location, 'In Store') as location
            FROM inventory_items WHERE id = ?
        `).get(id);

        return withSerials(updated);
    },

    findInventoryItemByIdOrSerial(identifier) {
        if (!identifier || typeof identifier !== 'string') return null;
        const clean = identifier.trim();
        const row = db.prepare(`
            SELECT i.id, i.category_id, i.name, i.available, i.status, i.notes,
                   COALESCE(i.model, '') as model,
                   COALESCE(i.serial_number, '') as serialNumber,
                   COALESCE(i.serials, '[]') as serialsJson,
                   COALESCE(i.sub_category, '') as subCategory,
                   COALESCE(i.condition, 'Good') as condition,
                   COALESCE(i.location, 'In Store') as location,
                   c.name as categoryName
            FROM inventory_items i
            JOIN inventory_categories c ON i.category_id = c.id
            WHERE LOWER(i.id) = LOWER(?)
               OR LOWER(i.serial_number) = LOWER(?)
               OR LOWER(i.model) = LOWER(?)
               OR EXISTS (
                    SELECT 1 FROM json_each(COALESCE(i.serials, '[]'))
                    WHERE LOWER(json_each.value) = LOWER(?)
               )
        `).get(clean, clean, clean, clean);

        return withSerials(row);
    },

    searchInventory(query) {
        if (!query || typeof query !== 'string') return [];
        const pattern = `%${query.trim().toLowerCase()}%`;
        const rows = db.prepare(`
            SELECT i.id, i.category_id, i.name, i.available, i.status, i.notes,
                   COALESCE(i.model, '') as model,
                   COALESCE(i.serial_number, '') as serialNumber,
                   COALESCE(i.serials, '[]') as serialsJson,
                   COALESCE(i.sub_category, '') as subCategory,
                   COALESCE(i.condition, 'Good') as condition,
                   COALESCE(i.location, 'In Store') as location,
                   c.name as categoryName
            FROM inventory_items i
            JOIN inventory_categories c ON i.category_id = c.id
            WHERE LOWER(i.name) LIKE ? OR LOWER(i.model) LIKE ? OR LOWER(i.serial_number) LIKE ? OR LOWER(i.sub_category) LIKE ? OR LOWER(c.name) LIKE ?
               OR EXISTS (
                    SELECT 1 FROM json_each(COALESCE(i.serials, '[]'))
                    WHERE LOWER(json_each.value) LIKE ?
               )
            ORDER BY c.sort_order ASC, i.name ASC
        `).all(pattern, pattern, pattern, pattern, pattern, pattern);

        return rows.map(withSerials);
    },

    // Events
    getEvents() {
        const events = db.prepare(`
            SELECT 
                e.id,
                e.event_name as eventName,
                e.client_name as clientName,
                e.event_date as eventDate,
                e.venue,
                e.start_time as startTime,
                e.end_time as endTime,
                e.setup_time as setupTime,
                e.breakdown_time as breakdownTime,
                e.equipment_booked as equipmentBooked,
                e.returned_equipment as returnedEquipment,
                e.notes,
                e.assigned_to as assignedTo,
                e.status,
                e.created_at as createdAt,
                e.updated_at as updatedAt
            FROM events e
            ORDER BY e.event_date ASC
        `).all();

        const bookedItems = db.prepare(`
            SELECT 
                event_id,
                item_id as itemId,
                quantity,
                returned_condition as returnedCondition,
                damage_serial_number as damageSerialNumber,
                damage_problem as damageProblem,
                damage_photo as damagePhoto
            FROM event_inventory
        `).all();

        return events.map((event) => {
            const eventBooked = bookedItems
                .filter((item) => item.event_id === event.id)
                .map((entry) => ({
                    itemId: entry.itemId,
                    quantity: entry.quantity,
                    returnedCondition: entry.returnedCondition || '',
                    damageDetails: entry.damageSerialNumber || entry.damageProblem || entry.damagePhoto
                        ? {
                            serialNumber: entry.damageSerialNumber || '',
                            problem: entry.damageProblem || '',
                            photo: entry.damagePhoto || ''
                        }
                        : null
                }));

            return {
                ...event,
                inventoryBooked: eventBooked
            };
        });
    },

    getEventById(id) {
        const event = db.prepare(`
            SELECT 
                e.id,
                e.event_name as eventName,
                e.client_name as clientName,
                e.event_date as eventDate,
                e.venue,
                e.start_time as startTime,
                e.end_time as endTime,
                e.setup_time as setupTime,
                e.breakdown_time as breakdownTime,
                e.equipment_booked as equipmentBooked,
                e.returned_equipment as returnedEquipment,
                e.notes,
                e.assigned_to as assignedTo,
                e.status
            FROM events e
            WHERE e.id = ?
        `).get(id);

        if (!event) return null;

        const bookedItems = db.prepare(`
            SELECT 
                item_id as itemId,
                quantity,
                returned_condition as returnedCondition,
                damage_serial_number as damageSerialNumber,
                damage_problem as damageProblem,
                damage_photo as damagePhoto
            FROM event_inventory
            WHERE event_id = ?
        `).all(id);

        const inventoryBooked = bookedItems.map((entry) => ({
            itemId: entry.itemId,
            quantity: entry.quantity,
            returnedCondition: entry.returnedCondition || '',
            damageDetails: entry.damageSerialNumber || entry.damageProblem || entry.damagePhoto
                ? {
                    serialNumber: entry.damageSerialNumber || '',
                    problem: entry.damageProblem || '',
                    photo: entry.damagePhoto || ''
                }
                : null
        }));

        return {
            ...event,
            inventoryBooked
        };
    },

    saveEvent(eventData) {
        const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(eventData.id);

        if (existing) {
            db.prepare(`
                UPDATE events SET
                    event_name = ?,
                    client_name = ?,
                    event_date = ?,
                    venue = ?,
                    start_time = ?,
                    end_time = ?,
                    setup_time = ?,
                    breakdown_time = ?,
                    equipment_booked = ?,
                    returned_equipment = ?,
                    notes = ?,
                    assigned_to = ?,
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                eventData.eventName,
                eventData.clientName,
                eventData.eventDate,
                eventData.venue,
                eventData.startTime,
                eventData.endTime,
                eventData.setupTime,
                eventData.breakdownTime,
                eventData.equipmentBooked || '',
                eventData.returnedEquipment || '',
                eventData.notes || '',
                eventData.assignedTo || 'dave',
                eventData.status || 'Planned',
                eventData.id
            );
        } else {
            db.prepare(`
                INSERT INTO events (
                    id, event_name, client_name, event_date, venue,
                    start_time, end_time, setup_time, breakdown_time,
                    equipment_booked, returned_equipment, notes, assigned_to, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                eventData.id,
                eventData.eventName,
                eventData.clientName,
                eventData.eventDate,
                eventData.venue,
                eventData.startTime,
                eventData.endTime,
                eventData.setupTime,
                eventData.breakdownTime,
                eventData.equipmentBooked || '',
                eventData.returnedEquipment || '',
                eventData.notes || '',
                eventData.assignedTo || 'dave',
                eventData.status || 'Planned'
            );
        }

        // Replace event_inventory entries
        db.prepare('DELETE FROM event_inventory WHERE event_id = ?').run(eventData.id);

        if (Array.isArray(eventData.inventoryBooked) && eventData.inventoryBooked.length > 0) {
            const insertInventory = db.prepare(`
                INSERT INTO event_inventory (
                    event_id, item_id, quantity, returned_condition,
                    damage_serial_number, damage_problem, damage_photo
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of eventData.inventoryBooked) {
                insertInventory.run(
                    eventData.id,
                    item.itemId,
                    Number(item.quantity) || 1,
                    item.returnedCondition || '',
                    item.damageDetails?.serialNumber || '',
                    item.damageDetails?.problem || '',
                    item.damageDetails?.photo || ''
                );
            }
        }

        return this.getEventById(eventData.id);
    },

    deleteEvent(id) {
        db.prepare('DELETE FROM event_inventory WHERE event_id = ?').run(id);
        const res = db.prepare('DELETE FROM events WHERE id = ?').run(id);
        return res.changes > 0;
    },

    // Messages
    getMessages(userId) {
        return db.prepare(`
            SELECT id, sender_id as senderId, recipient_id as recipientId, text, sent_at as sentAt
            FROM messages
            WHERE sender_id = ? OR recipient_id = ?
            ORDER BY sent_at DESC
        `).all(userId, userId);
    },

    sendMessage(senderId, recipientId, text) {
        const id = `msg-${Date.now()}`;
        db.prepare(`
            INSERT INTO messages (id, sender_id, recipient_id, text)
            VALUES (?, ?, ?, ?)
        `).run(id, senderId, recipientId, text);

        return db.prepare('SELECT id, sender_id as senderId, recipient_id as recipientId, text, sent_at as sentAt FROM messages WHERE id = ?').get(id);
    },

    getState() {
        return {
            accounts: this.getAccounts(),
            events: this.getEvents(),
            inventory: this.getInventory(),
            messages: db.prepare('SELECT id, sender_id as senderId, recipient_id as recipientId, text, sent_at as sentAt FROM messages ORDER BY sent_at DESC').all()
        };
    },

    saveFullState(state) {
        if (!state || typeof state !== 'object') return false;

        if (Array.isArray(state.accounts)) {
            for (const acc of state.accounts) {
                if (acc.id && acc.password) {
                    const existingAccount = this.getAccountById(acc.id);
                    const passwordToStore = existingAccount && existingAccount.password
                        ? (existingAccount.password.startsWith('$2a$') || existingAccount.password.startsWith('$2b$'))
                            ? existingAccount.password
                            : normalizeStoredPassword(acc.password)
                        : normalizeStoredPassword(acc.password);

                    db.prepare('UPDATE accounts SET password = ? WHERE id = ?').run(passwordToStore, acc.id);
                }
            }
        }

        if (Array.isArray(state.inventory)) {
            for (const cat of state.inventory) {
                if (Array.isArray(cat.items)) {
                    for (const item of cat.items) {
                        if (item.id) {
                            this.updateInventoryItem(item.id, item);
                        }
                    }
                }
            }
        }

        if (Array.isArray(state.events)) {
            for (const evt of state.events) {
                if (evt.id && evt.eventName) {
                    this.saveEvent(evt);
                }
            }
        }

        if (Array.isArray(state.messages)) {
            for (const msg of state.messages) {
                if (msg.id && msg.senderId && msg.recipientId && msg.text) {
                    const exists = db.prepare('SELECT id FROM messages WHERE id = ?').get(msg.id);
                    if (!exists) {
                        db.prepare('INSERT INTO messages (id, sender_id, recipient_id, text, sent_at) VALUES (?, ?, ?, ?, ?)').run(
                            msg.id,
                            msg.senderId,
                            msg.recipientId,
                            msg.text,
                            msg.sentAt || new Date().toISOString()
                        );
                    }
                }
            }
        }

        return true;
    }
};
