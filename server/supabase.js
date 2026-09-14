// ==============================================================================
// PHENMO EVENTS — SUPABASE DATA LAYER ADAPTER
// ==============================================================================
// Connects the Phenmo HTTP server to Supabase PostgreSQL when credentials
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY) are set in .env.
// If credentials are not set, the server continues using local SQLite gracefully.
// ==============================================================================

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const sqliteDb = require('./db');

let hasWarnedFallback = false;
function notifyFallbackOnce(reason) {
    if (!hasWarnedFallback) {
        hasWarnedFallback = true;
        console.warn(`[Supabase Notice] ${reason}. Serving from local SQLite so operations remain 100% available.`);
    }
}

function verifyStoredPassword(candidatePassword, storedPassword) {
    if (!candidatePassword || !storedPassword) {
        return false;
    }
    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
        return bcrypt.compareSync(candidatePassword, storedPassword);
    }
    return candidatePassword === storedPassword;
}

function normalizeStoredPassword(plainOrHashed) {
    if (!plainOrHashed) return plainOrHashed;
    if (plainOrHashed.startsWith('$2a$') || plainOrHashed.startsWith('$2b$')) {
        return plainOrHashed;
    }
    return bcrypt.hashSync(plainOrHashed, 10);
}

// Load .env if present
if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch (e) {
        // .env file is optional
    }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_ANON_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClient = null;

function isSupabaseConfigured() {
    return Boolean(supabaseUrl && supabaseKey && supabaseUrl.startsWith('http'));
}

function getSupabaseClient() {
    if (!isSupabaseConfigured()) {
        return null;
    }
    if (!supabaseClient) {
        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
    }
    return supabaseClient;
}

const supabaseApi = {
    isConfigured: isSupabaseConfigured,
    getClient: getSupabaseClient,

    // Accounts
    async getAccounts() {
        const client = getSupabaseClient();
        if (!client) return sqliteDb.getAccounts();
        try {
            const { data, error } = await client
                .from('accounts')
                .select('id, name, role, email, password, created_at')
                .order('name', { ascending: true });
            if (error) {
                notifyFallbackOnce('Accounts table not ready in Supabase');
                return sqliteDb.getAccounts();
            }
            return (data && data.length > 0) ? data : sqliteDb.getAccounts();
        } catch (e) {
            notifyFallbackOnce('Network or fetch error');
            return sqliteDb.getAccounts();
        }
    },

    async getAccountById(id) {
        const client = getSupabaseClient();
        if (!client || !id) return sqliteDb.getAccountById(id);
        try {
            const { data, error } = await client
                .from('accounts')
                .select('id, name, role, email, password, created_at')
                .eq('id', id)
                .maybeSingle();
            if (error || !data) {
                return sqliteDb.getAccountById(id);
            }
            return data;
        } catch (e) {
            return sqliteDb.getAccountById(id);
        }
    },

    async getAccountByEmail(email) {
        const client = getSupabaseClient();
        if (!client || !email) return sqliteDb.getAccountByEmail(email);
        try {
            const { data, error } = await client
                .from('accounts')
                .select('id, name, role, email, password, created_at')
                .ilike('email', email.trim())
                .maybeSingle();
            if (error || !data) {
                return sqliteDb.getAccountByEmail(email);
            }
            return data;
        } catch (e) {
            return sqliteDb.getAccountByEmail(email);
        }
    },

    async getAccountByIdOrEmail(identifier) {
        if (!identifier || typeof identifier !== 'string') return null;
        const client = getSupabaseClient();
        if (!client) return sqliteDb.getAccountByIdOrEmail(identifier);
        try {
            const clean = identifier.trim();
            const { data, error } = await client
                .from('accounts')
                .select('id, name, role, email, password, created_at')
                .or(`id.ilike.${clean},email.ilike.${clean}`)
                .limit(1);
            if (error || !data || data.length === 0) {
                return sqliteDb.getAccountByIdOrEmail(identifier);
            }
            return data[0];
        } catch (e) {
            return sqliteDb.getAccountByIdOrEmail(identifier);
        }
    },

    verifyPassword(candidatePassword, storedPassword) {
        return verifyStoredPassword(candidatePassword, storedPassword);
    },

    async updatePassword(id, newPassword) {
        const client = getSupabaseClient();
        sqliteDb.updatePassword(id, newPassword);
        if (!client || !id || !newPassword) return true;
        try {
            const hashedPassword = normalizeStoredPassword(newPassword.trim());
            await client
                .from('accounts')
                .update({ password: hashedPassword })
                .eq('id', id);
        } catch (e) {
            // Local SQLite already updated
        }
        return true;
    },

    async completeFirstTimeSetup(accountId, email, newPassword, deviceInfo = '') {
        const updatedLocal = sqliteDb.completeFirstTimeSetup(accountId, email, newPassword, deviceInfo);
        const client = getSupabaseClient();
        if (client) {
            try {
                const hashedPassword = normalizeStoredPassword(newPassword.trim());
                await client
                    .from('accounts')
                    .update({ email: (email || '').trim().toLowerCase(), password: hashedPassword })
                    .eq('id', accountId);

                if (accountId !== 'steve') {
                    const timestamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
                    const deviceNote = deviceInfo ? ` [${deviceInfo}]` : '';
                    await this.sendMessage(
                        'system',
                        'steve',
                        `Account Activated: ${updatedLocal.name} (${email}) completed first-time setup on ${timestamp}${deviceNote}.`
                    );
                }
            } catch (e) {
                // Local SQLite already updated
            }
        }
        return updatedLocal;
    },

    async updateAccountPassword(accountId, newHashedPassword, updatedEmail) {
        const client = getSupabaseClient();
        if (!client) return null;
        const updates = { password: newHashedPassword };
        if (updatedEmail) updates.email = updatedEmail;

        const { data, error } = await client
            .from('accounts')
            .update(updates)
            .eq('id', accountId)
            .select()
            .maybeSingle();
        if (error) {
            console.error('[Supabase] updateAccountPassword error:', error.message);
            return null;
        }
        return data || null;
    },

    // Inventory
    async getInventory() {
        const client = getSupabaseClient();
        if (!client) return sqliteDb.getInventory();

        try {
            const [catRes, itemRes] = await Promise.all([
                client.from('inventory_categories').select('id, name, sort_order').order('sort_order', { ascending: true }),
                client.from('inventory_items').select('*').order('name', { ascending: true })
            ]);

            if (catRes.error || itemRes.error) {
                notifyFallbackOnce('Inventory tables not ready in Supabase');
                return sqliteDb.getInventory();
            }

            const categories = catRes.data || [];
            const items = itemRes.data || [];

            if (categories.length === 0 || items.length === 0) {
                return sqliteDb.getInventory();
            }

            return categories.map((cat) => ({
                id: cat.id,
                name: cat.name,
                items: items
                    .filter((it) => it.category_id === cat.id)
                    .map((it) => ({
                        id: it.id,
                        categoryId: it.category_id,
                        name: it.name,
                        available: Number(it.available) || 0,
                        status: it.status || 'Available',
                        notes: it.notes || '',
                        model: it.model || '',
                        serialNumber: it.serial_number || '',
                        serials: Array.isArray(it.serials) ? it.serials : [],
                        subCategory: it.sub_category || '',
                        condition: it.condition || 'Good',
                        location: it.location || 'In Store'
                    }))
            }));
        } catch (err) {
            notifyFallbackOnce('Network or fetch error');
            return sqliteDb.getInventory();
        }
    },

    async findInventoryItemByIdOrSerial(identifier) {
        const client = getSupabaseClient();
        if (!client || !identifier) return sqliteDb.findInventoryItemByIdOrSerial(identifier);
        const clean = String(identifier).trim().toLowerCase();

        try {
            // 1. Direct ID, serial_number, or model match
            const { data, error } = await client
                .from('inventory_items')
                .select('*, inventory_categories(name)')
                .or(`id.ilike.${clean},serial_number.ilike.${clean},model.ilike.${clean}`)
                .limit(1);

            if (!error && data && data.length > 0) {
                const it = data[0];
                return {
                    id: it.id,
                    categoryId: it.category_id,
                    name: it.name,
                    available: Number(it.available) || 0,
                    status: it.status || 'Available',
                    notes: it.notes || '',
                    model: it.model || '',
                    serialNumber: it.serial_number || '',
                    serials: Array.isArray(it.serials) ? it.serials : [],
                    subCategory: it.sub_category || '',
                    condition: it.condition || 'Good',
                    location: it.location || 'In Store',
                    categoryName: it.inventory_categories?.name || 'Inventory'
                };
            }

            // 2. Check JSONB serials array
            const { data: jsonMatches, error: jsonErr } = await client
                .from('inventory_items')
                .select('*, inventory_categories(name)')
                .contains('serials', JSON.stringify([identifier.trim()]));

            if (!jsonErr && jsonMatches && jsonMatches.length > 0) {
                const it = jsonMatches[0];
                return {
                    id: it.id,
                    categoryId: it.category_id,
                    name: it.name,
                    available: Number(it.available) || 0,
                    status: it.status || 'Available',
                    notes: it.notes || '',
                    model: it.model || '',
                    serialNumber: it.serial_number || '',
                    serials: Array.isArray(it.serials) ? it.serials : [],
                    subCategory: it.sub_category || '',
                    condition: it.condition || 'Good',
                    location: it.location || 'In Store',
                    categoryName: it.inventory_categories?.name || 'Inventory'
                };
            }

            return sqliteDb.findInventoryItemByIdOrSerial(identifier);
        } catch (err) {
            return sqliteDb.findInventoryItemByIdOrSerial(identifier);
        }
    },

    async searchInventory(query) {
        const client = getSupabaseClient();
        if (!client || !query) return sqliteDb.searchInventory(query);
        const clean = String(query).trim();

        try {
            const { data, error } = await client
                .from('inventory_items')
                .select('*, inventory_categories(name, sort_order)')
                .or(`name.ilike.%${clean}%,model.ilike.%${clean}%,serial_number.ilike.%${clean}%,sub_category.ilike.%${clean}%`)
                .order('name', { ascending: true })
                .limit(50);

            if (error || !data || data.length === 0) {
                return sqliteDb.searchInventory(query);
            }

            return (data || []).map((it) => ({
                id: it.id,
                categoryId: it.category_id,
                name: it.name,
                available: Number(it.available) || 0,
                status: it.status || 'Available',
                notes: it.notes || '',
                model: it.model || '',
                serialNumber: it.serial_number || '',
                serials: Array.isArray(it.serials) ? it.serials : [],
                subCategory: it.sub_category || '',
                condition: it.condition || 'Good',
                location: it.location || 'In Store',
                categoryName: it.inventory_categories?.name || 'Inventory'
            }));
        } catch (err) {
            return sqliteDb.searchInventory(query);
        }
    },

    async updateInventoryItem(id, updates) {
        const localUpdated = sqliteDb.updateInventoryItem(id, updates);
        const client = getSupabaseClient();
        if (!client) return localUpdated;

        const payload = { updated_at: new Date().toISOString() };
        if (typeof updates.available === 'number') payload.available = updates.available;
        if (updates.status) payload.status = updates.status;
        if (updates.notes !== undefined) payload.notes = updates.notes;
        if (updates.condition) payload.condition = updates.condition;
        if (updates.location) payload.location = updates.location;
        if (Array.isArray(updates.serials)) payload.serials = updates.serials;

        try {
            await client
                .from('inventory_items')
                .update(payload)
                .eq('id', id);
        } catch (err) {
            // Local SQLite updated
        }

        return localUpdated;
    },

    // Events
    async getEvents() {
        const client = getSupabaseClient();
        if (!client) return sqliteDb.getEvents();

        try {
            const [eventRes, invRes] = await Promise.all([
                client.from('events').select('*').order('event_date', { ascending: true }),
                client.from('event_inventory').select('*')
            ]);

            if (eventRes.error) {
                notifyFallbackOnce('Events table not ready in Supabase');
                return sqliteDb.getEvents();
            }

            const events = eventRes.data || [];
            if (events.length === 0) {
                return sqliteDb.getEvents();
            }

            const eventInventory = invRes.data || [];

            return events.map((e) => ({
                id: e.id,
                eventName: e.event_name,
                clientName: e.client_name,
                eventDate: e.event_date,
                venue: e.venue,
                startTime: e.start_time,
                endTime: e.end_time,
                setupTime: e.setup_time,
                breakdownTime: e.breakdown_time,
                equipmentBooked: e.equipment_booked,
                returnedEquipment: e.returned_equipment,
                notes: e.notes,
                assignedTo: e.assigned_to,
                status: e.status,
                createdAt: e.created_at,
                updatedAt: e.updated_at,
                inventoryBooked: eventInventory
                    .filter((inv) => inv.event_id === e.id)
                    .map((inv) => ({
                        itemId: inv.item_id,
                        quantity: Number(inv.quantity) || 1,
                        returnedCondition: inv.returned_condition,
                        damageSerialNumber: inv.damage_serial_number,
                        damageProblem: inv.damage_problem,
                        damagePhoto: inv.damage_photo
                    }))
            }));
        } catch (err) {
            notifyFallbackOnce('Network or fetch error');
            return sqliteDb.getEvents();
        }
    },

    async getEventById(id) {
        const events = await this.getEvents();
        return events.find((e) => e.id === id) || sqliteDb.getEventById(id);
    },

    async saveEvent(eventData) {
        const localSaved = sqliteDb.saveEvent(eventData);
        const client = getSupabaseClient();
        if (!client) return localSaved;

        const payload = {
            id: eventData.id,
            event_name: eventData.eventName,
            client_name: eventData.clientName,
            event_date: eventData.eventDate,
            venue: eventData.venue,
            start_time: eventData.startTime || '00:00',
            end_time: eventData.endTime || '00:00',
            setup_time: eventData.setupTime || '00:00',
            breakdown_time: eventData.breakdownTime || '00:00',
            equipment_booked: eventData.equipmentBooked || '',
            returned_equipment: eventData.returnedEquipment || '',
            notes: eventData.notes || '',
            assigned_to: eventData.assignedTo || null,
            status: eventData.status || 'Planned',
            updated_at: new Date().toISOString()
        };

        try {
            await client
                .from('events')
                .upsert(payload, { onConflict: 'id' });

            if (Array.isArray(eventData.inventoryBooked)) {
                await client.from('event_inventory').delete().eq('event_id', eventData.id);
                const rows = eventData.inventoryBooked
                    .filter((b) => b && b.itemId)
                    .map((b) => ({
                        event_id: eventData.id,
                        item_id: b.itemId,
                        quantity: Number(b.quantity) || 1,
                        returned_condition: b.returnedCondition || null,
                        damage_serial_number: b.damageSerialNumber || b.damageDetails?.serialNumber || null,
                        damage_problem: b.damageProblem || b.damageDetails?.problem || null,
                        damage_photo: b.damagePhoto || b.damageDetails?.photo || null
                    }));

                if (rows.length > 0) {
                    await client.from('event_inventory').insert(rows);
                }
            }
        } catch (err) {
            // Local SQLite updated
        }

        return localSaved;
    },

    async deleteEvent(id) {
        const localDeleted = sqliteDb.deleteEvent(id);
        const client = getSupabaseClient();
        if (client) {
            try {
                await client.from('events').delete().eq('id', id);
            } catch (err) {}
        }
        return localDeleted;
    },

    // Messages
    async getMessages(userId) {
        const client = getSupabaseClient();
        if (!client) return sqliteDb.getMessages(userId);

        try {
            let query = client
                .from('messages')
                .select('*')
                .order('sent_at', { ascending: true });

            if (userId) {
                query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
            }

            const { data, error } = await query;
            if (error || !data) {
                return sqliteDb.getMessages(userId);
            }

            return data.map((m) => ({
                id: m.id,
                senderId: m.sender_id,
                recipientId: m.recipient_id,
                text: m.text,
                sentAt: m.sent_at
            }));
        } catch (err) {
            return sqliteDb.getMessages(userId);
        }
    },

    async sendMessage(senderId, recipientId, text) {
        const localSaved = sqliteDb.sendMessage(senderId, recipientId, text);
        const client = getSupabaseClient();
        if (!client) return localSaved;

        const payload = {
            id: localSaved.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender_id: senderId,
            recipient_id: recipientId,
            text: text,
            sent_at: localSaved.sentAt || new Date().toISOString()
        };

        try {
            await client.from('messages').insert([payload]);
        } catch (err) {}

        return localSaved;
    },

    // Stats
    async getStats() {
        return sqliteDb.getStats();
    },

    // Full State Sync
    async getState() {
        return sqliteDb.getState();
    },

    async saveFullState(state) {
        const localSaved = sqliteDb.saveFullState(state);
        const client = getSupabaseClient();
        if (!client || !state || typeof state !== 'object') return localSaved;

        try {
            if (Array.isArray(state.accounts)) {
                for (const acc of state.accounts) {
                    if (acc.id && acc.password) {
                        const existing = sqliteDb.getAccountById(acc.id);
                        const passwordToStore = existing && existing.password && (existing.password.startsWith('$2a$') || existing.password.startsWith('$2b$'))
                            ? existing.password
                            : normalizeStoredPassword(acc.password);
                        await client.from('accounts').update({ password: passwordToStore }).eq('id', acc.id);
                    }
                }
            }

            if (Array.isArray(state.inventory)) {
                for (const cat of state.inventory) {
                    if (Array.isArray(cat.items)) {
                        for (const item of cat.items) {
                            if (item.id) {
                                await this.updateInventoryItem(item.id, item);
                            }
                        }
                    }
                }
            }

            if (Array.isArray(state.events)) {
                for (const evt of state.events) {
                    if (evt.id && evt.eventName) {
                        await this.saveEvent(evt);
                    }
                }
            }

            if (Array.isArray(state.messages)) {
                for (const msg of state.messages) {
                    if (msg.id && msg.senderId && msg.recipientId && msg.text) {
                        await client.from('messages').upsert({
                            id: msg.id,
                            sender_id: msg.senderId,
                            recipient_id: msg.recipientId,
                            text: msg.text,
                            sent_at: msg.sentAt || new Date().toISOString()
                        }, { onConflict: 'id' });
                    }
                }
            }
        } catch (err) {}

        return localSaved;
    }
};

module.exports = supabaseApi;
