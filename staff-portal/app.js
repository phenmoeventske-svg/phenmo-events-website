const STORAGE_KEY = 'phenmo-staff-portal-v2';
const LEGACY_STORAGE_KEYS = ['phenmo-staff-portal-v1', 'phenmo_events_staff_state'];
const CURRENT_USER_KEY = 'phenmo-current-user';
const DEFAULT_PASSWORD = '0000';

const sampleState = {
    accounts: [
        { id: 'steve', name: 'Steve', role: 'Managing Director', email: 'steve@phenmoevents.co.ke', password: DEFAULT_PASSWORD },
        { id: 'mariah', name: 'Mariah', role: 'Admin', email: 'mariah@phenmoevents.co.ke', password: DEFAULT_PASSWORD },
        { id: 'dave', name: 'Dave', role: 'Technician', email: 'dave@phenmoevents.co.ke', password: DEFAULT_PASSWORD }
    ],
    events: [
        {
            id: 'evt-001',
            eventName: 'Wedding Reception',
            clientName: 'Amina & Daniel',
            eventDate: '2026-09-20',
            venue: 'Nairobi Garden Hotel',
            startTime: '15:00',
            endTime: '22:30',
            setupTime: '12:30',
            breakdownTime: '23:00',
            equipmentBooked: '2 line array speakers, 1 LED screen, 4 lighting trusses, 1 DJ setup',
            notes: 'Need an elegant lighting setup and strong sound coverage for the main hall.',
            assignedTo: 'dave',
            status: 'Planned',
            inventoryBooked: []
        },
        {
            id: 'evt-002',
            eventName: 'Corporate Launch',
            clientName: 'BluePeak Ltd',
            eventDate: '2026-09-25',
            venue: 'Kenyatta International Convention Centre',
            startTime: '09:00',
            endTime: '13:00',
            setupTime: '07:00',
            breakdownTime: '13:30',
            equipmentBooked: '1 LED screen, 1 projector, event lighting, sound system',
            notes: 'Company wants a formal stage look with crisp audio and presentation support.',
            assignedTo: 'mariah',
            status: 'Confirmed',
            inventoryBooked: []
        },
        {
            id: 'evt-003',
            eventName: 'Birthday Bash',
            clientName: 'Joyline Muthoni',
            eventDate: '2026-09-27',
            venue: 'Westlands Lounge',
            startTime: '18:00',
            endTime: '23:00',
            setupTime: '16:30',
            breakdownTime: '23:30',
            equipmentBooked: 'Sound system, LED dance floor, decorative lighting, DJ services',
            notes: 'House playlist and dance floor lighting are key priorities for this event.',
            assignedTo: 'dave',
            status: 'In Progress',
            inventoryBooked: []
        }
    ],
    inventory: (typeof window !== 'undefined' && Array.isArray(window.PHENMO_COMPANY_INVENTORY))
        ? window.PHENMO_COMPANY_INVENTORY
        : [
            { id: 'audio', name: 'Audio & Sound', items: [] },
            { id: 'visual', name: 'Visual & Lighting', items: [] },
            { id: 'stage', name: 'Stage & Staging', items: [] },
            { id: 'rigging', name: 'Rigging & Stands', items: [] },
            { id: 'cables', name: 'Cables & Interconnects', items: [] },
            { id: 'power', name: 'Power & Distribution', items: [] },
            { id: 'hardware', name: 'Cases & Hardware', items: [] }
        ],
    messages: []
};

function getDefaultState() {
    const base = structuredClone(sampleState);
    if (typeof window !== 'undefined' && Array.isArray(window.PHENMO_COMPANY_INVENTORY) && window.PHENMO_COMPANY_INVENTORY.length >= 7) {
        base.inventory = structuredClone(window.PHENMO_COMPANY_INVENTORY);
    }
    return base;
}

function normalizeStoredState(savedState) {
    const fallbackState = getDefaultState();

    if (!savedState || typeof savedState !== 'object') {
        return fallbackState;
    }

    const normalizedAccounts = fallbackState.accounts.map((defaultAccount) => {
        const savedAccount = Array.isArray(savedState.accounts)
            ? savedState.accounts.find((account) => account.id === defaultAccount.id)
            : null;

        const savedPassword = typeof savedAccount?.password === 'string'
            ? savedAccount.password.trim()
            : '';

        return {
            ...defaultAccount,
            ...(savedAccount || {}),
            role: defaultAccount.role,
            password: savedPassword || defaultAccount.password
        };
    });

    let inventory = Array.isArray(savedState.inventory) ? savedState.inventory : fallbackState.inventory;
    const hasRealCompanyInventory = typeof window !== 'undefined' && Array.isArray(window.PHENMO_COMPANY_INVENTORY) && window.PHENMO_COMPANY_INVENTORY.length >= 7;
    const savedInventoryIsPlaceholder = !Array.isArray(savedState.inventory)
        || savedState.inventory.length === 0
        || savedState.inventory.every((cat) => !Array.isArray(cat.items) || cat.items.length === 0);

    const hasReservedOrObsolete = Array.isArray(inventory) && inventory.some((cat) =>
        Array.isArray(cat.items) && cat.items.some((it) =>
            it && (it.status === 'Reserved' || (it.location && it.location.toLowerCase().includes('coast')) || (it.notes && it.notes.toLowerCase().includes('reserved')))
        )
    );

    if (hasRealCompanyInventory && (savedInventoryIsPlaceholder || hasReservedOrObsolete)) {
        inventory = structuredClone(window.PHENMO_COMPANY_INVENTORY);
    }

    const isObsoleteInventory = inventory.some((cat) => cat.id === 'lighting' || cat.id === 'decor' || cat.id === 'trussing') || inventory.length < 7;
    if (isObsoleteInventory && fallbackState.inventory && fallbackState.inventory.length >= 7) {
        inventory = fallbackState.inventory;
    }

    // Ensure 2m by 1m stage platforms are consolidated to 1 item with available: 20
    if (Array.isArray(inventory)) {
        const stageCat = inventory.find((cat) => cat.id === 'stage');
        if (stageCat && Array.isArray(stageCat.items)) {
            const hasMultiplePanels = stageCat.items.filter((it) => it && (/stage\s*platf/i.test(it.name) || /2m\s*(by|x)\s*1m/i.test(it.name)) && it.id !== 'eq-0502');
            if (hasMultiplePanels.length > 1) {
                const totalAvail = hasMultiplePanels.reduce((sum, p) => sum + (Number(p.available) || 1), 0);
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0483' && it.id <= 'eq-0501'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0482');
                if (primary) {
                    primary.name = '2m by 1m Stage Panel';
                    primary.model = '2m by 1m';
                    primary.subCategory = '2m by 1m Stage Platform';
                    primary.available = totalAvail || 20;
                    primary.status = 'Available';
                    primary.condition = 'Excellent';
                    primary.notes = '20 panels consolidated. Location: In Store';
                }
            } else if (hasMultiplePanels.length === 1) {
                const primary = hasMultiplePanels[0];
                primary.name = '2m by 1m Stage Panel';
                primary.model = '2m by 1m';
                primary.subCategory = '2m by 1m Stage Platform';
                if (!primary.available || primary.available === 1) primary.available = 20;
            }

            // Ensure 1m by 1m stage platform is standalone by itself
            const panel1x1 = stageCat.items.find((it) => it && (it.id === 'eq-0502' || /1\s*x\s*1/i.test(it.subCategory || '')));
            if (panel1x1) {
                panel1x1.name = '1m by 1m Stage Panel';
                panel1x1.model = '1m x 1m';
                panel1x1.subCategory = '1m by 1m Stage Platform';
                panel1x1.available = 1;
                panel1x1.status = 'Available';
                panel1x1.condition = 'Excellent';
            }

            // Ensure stage legs are consolidated to 1 item named "Adjustable Stage Legs" with available: 78
            const hasMultipleLegs = stageCat.items.filter((it) => it && (/stage\s*leg/i.test(it.name) || /adjustable\s*stage\s*leg/i.test(it.name) || (it.id >= 'eq-0503' && it.id <= 'eq-0582')));
            if (hasMultipleLegs.length > 1) {
                const totalAvail = hasMultipleLegs.reduce((sum, l) => sum + (Number(l.available) || 0), 0);
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0504' && it.id <= 'eq-0582'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0503');
                if (primary) {
                    primary.name = 'Adjustable Stage Legs';
                    primary.model = '60cm-93cm';
                    primary.subCategory = 'Adjustable Stage Legs';
                    primary.available = totalAvail || 78;
                    primary.quantity = 80;
                    primary.status = 'Available';
                    primary.condition = 'Good';
                    primary.notes = '80 units consolidated (78 available, 2 faulty). Location: In Store';
                }
            } else if (hasMultipleLegs.length === 1) {
                const primary = hasMultipleLegs[0];
                primary.name = 'Adjustable Stage Legs';
                primary.model = '60cm-93cm';
                primary.subCategory = 'Adjustable Stage Legs';
                if (!primary.available || primary.available === 1) primary.available = 78;
                primary.quantity = 80;
                primary.notes = '80 units consolidated (78 available, 2 faulty). Location: In Store';
            }

            // Ensure stage steps are consolidated to 1 item named "Stage Steps" with available: 2
            const hasMultipleSteps = stageCat.items.filter((it) => it && (/stage\s*step/i.test(it.name) || (it.id >= 'eq-0583' && it.id <= 'eq-0584')));
            if (hasMultipleSteps.length > 1) {
                const totalAvail = hasMultipleSteps.reduce((sum, s) => sum + (Number(s.available) || 0), 0);
                stageCat.items = stageCat.items.filter((it) => it.id !== 'eq-0584');
                const primary = stageCat.items.find((it) => it.id === 'eq-0583');
                if (primary) {
                    primary.name = 'Stage Steps';
                    primary.model = 'Standard';
                    primary.subCategory = 'Stage Steps';
                    primary.available = totalAvail || 2;
                    primary.quantity = 2;
                    primary.status = 'Available';
                    primary.condition = 'Excellent';
                    primary.notes = '2 units consolidated. Location: In Store';
                }
            } else if (hasMultipleSteps.length === 1) {
                const primary = hasMultipleSteps[0];
                primary.name = 'Stage Steps';
                primary.model = 'Standard';
                primary.subCategory = 'Stage Steps';
                if (!primary.available || primary.available === 1) primary.available = 2;
                primary.quantity = 2;
                primary.notes = '2 units consolidated. Location: In Store';
            }

            // Ensure stage C-clamps are consolidated to 1 item named "Stage C-Clamps" with available: 41
            const hasMultipleCClamps = stageCat.items.filter((it) => it && (/stage\s*c[-\s]?clamp/i.test(it.name) || /c[-\s]?clamp/i.test(it.subCategory || '') || (it.id >= 'eq-0585' && it.id <= 'eq-0625')));
            if (hasMultipleCClamps.length > 1) {
                const totalAvail = hasMultipleCClamps.reduce((sum, c) => sum + (Number(c.available) || 0), 0);
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0586' && it.id <= 'eq-0625'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0585');
                if (primary) {
                    primary.name = 'Stage C-Clamps';
                    primary.model = 'Standard';
                    primary.subCategory = 'Stage C-Clamps';
                    primary.available = totalAvail || 41;
                    primary.quantity = 41;
                    primary.status = 'Available';
                    primary.condition = 'Excellent';
                    primary.notes = '41 units consolidated. Location: In Store';
                }
            } else if (hasMultipleCClamps.length === 1) {
                const primary = hasMultipleCClamps[0];
                primary.name = 'Stage C-Clamps';
                primary.model = 'Standard';
                primary.subCategory = 'Stage C-Clamps';
                if (!primary.available || primary.available === 1) primary.available = 41;
                primary.quantity = 41;
                primary.notes = '41 units consolidated. Location: In Store';
            }

            // Ensure stage single clamps are consolidated to 1 item named "Stage Single Clamps" with available: 18 and showing those that need repair
            const hasMultipleSingleClamps = stageCat.items.filter((it) => it && (/single\s*clamp/i.test(it.name) || /single\s*clamp/i.test(it.subCategory || '') || (it.id >= 'eq-0626' && it.id <= 'eq-0650')));
            if (hasMultipleSingleClamps.length > 1) {
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0627' && it.id <= 'eq-0650'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0626');
                if (primary) {
                    primary.name = 'Stage Single Clamps';
                    primary.model = 'Standard';
                    primary.subCategory = 'Stage Single Clamps';
                    primary.available = 18;
                    primary.quantity = 25;
                    primary.status = 'Available';
                    primary.condition = 'Good';
                    primary.notes = '25 units total: 18 Available (Clamps 1-17, 19), 4 Need Repair (Clamps 20-23), 1 Faulty (Clamp 18), 2 Missing (Clamps 24-25). Location: In Store';
                }
            } else if (hasMultipleSingleClamps.length === 1) {
                const primary = hasMultipleSingleClamps[0];
                primary.name = 'Stage Single Clamps';
                primary.model = 'Standard';
                primary.subCategory = 'Stage Single Clamps';
                if (!primary.available || primary.available === 1) primary.available = 18;
                primary.quantity = 25;
                primary.notes = '25 units total: 18 Available (Clamps 1-17, 19), 4 Need Repair (Clamps 20-23), 1 Faulty (Clamp 18), 2 Missing (Clamps 24-25). Location: In Store';
            }

            // Ensure stage double clamps are consolidated to 1 item named "Stage Double Clamps" with available: 12
            const hasMultipleDoubleClamps = stageCat.items.filter((it) => it && (/double\s*clamp/i.test(it.name) || /double\s*clamp/i.test(it.subCategory || '') || (it.id >= 'eq-0651' && it.id <= 'eq-0662')));
            if (hasMultipleDoubleClamps.length > 1) {
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0652' && it.id <= 'eq-0662'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0651');
                if (primary) {
                    primary.name = 'Stage Double Clamps';
                    primary.model = 'Standard';
                    primary.subCategory = 'Stage Double Clamps';
                    primary.available = 12;
                    primary.quantity = 12;
                    primary.status = 'Available';
                    primary.condition = 'Excellent';
                    primary.notes = '12 units consolidated. Location: In Store';
                }
            } else if (hasMultipleDoubleClamps.length === 1) {
                const primary = hasMultipleDoubleClamps[0];
                primary.name = 'Stage Double Clamps';
                primary.model = 'Standard';
                primary.subCategory = 'Stage Double Clamps';
                if (!primary.available || primary.available === 1) primary.available = 12;
                primary.quantity = 12;
                primary.notes = '12 units consolidated. Location: In Store';
            }

            // Ensure stage velcro plates are consolidated to 1 item named "Stage Velcro Plates" with available: 29
            const hasMultipleVelcroPlates = stageCat.items.filter((it) => it && (/velcro\s*plate/i.test(it.name) || /velcro\s*plate/i.test(it.subCategory || '') || (it.id >= 'eq-0663' && it.id <= 'eq-0691')));
            if (hasMultipleVelcroPlates.length > 1) {
                stageCat.items = stageCat.items.filter((it) => !(it.id >= 'eq-0664' && it.id <= 'eq-0691'));
                const primary = stageCat.items.find((it) => it.id === 'eq-0663');
                if (primary) {
                    primary.name = 'Stage Velcro Plates';
                    primary.model = 'Standard';
                    primary.subCategory = 'Stage Velcro Plates';
                    primary.available = 29;
                    primary.quantity = 29;
                    primary.status = 'Available';
                    primary.condition = 'Excellent';
                    primary.notes = '29 units consolidated. Location: In Store';
                }
            } else if (hasMultipleVelcroPlates.length === 1) {
                const primary = hasMultipleVelcroPlates[0];
                primary.name = 'Stage Velcro Plates';
                primary.model = 'Standard';
                primary.subCategory = 'Stage Velcro Plates';
                if (!primary.available || primary.available === 1) primary.available = 29;
                primary.quantity = 29;
                primary.notes = '29 units consolidated. Location: In Store';
            }
        }

        // Ensure audio equipment sharing the same model numbers are consolidated
        const audioCat = inventory.find((cat) => cat.id === 'audio');
        if (audioCat && Array.isArray(audioCat.items)) {
            const audioDefs = [
                {
                    primaryId: 'eq-0004',
                    deleteIds: ['eq-0005'],
                    name: 'JBL PRX 618S-XLF Subwoofer',
                    model: 'PRX 618 S-XLF',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Good',
                    location: 'In Store',
                    serialNumber: 'P1090-02633',
                    serials: ['P1090-02633', 'P1090-04305'],
                    notes: '2 units consolidated (FIXED). Location: In Store'
                },
                {
                    primaryId: 'eq-0006',
                    deleteIds: ['eq-0007'],
                    name: 'JBL PRX 635 1500W 15" Loudspeaker',
                    model: 'PRX 635',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Excellent',
                    location: 'In Store',
                    serialNumber: 'P109012238',
                    serials: ['P109012238', 'P1090-12241'],
                    notes: '2 units consolidated. Location: In Store'
                },
                {
                    primaryId: 'eq-0008',
                    deleteIds: ['eq-0009'],
                    name: 'JBL SRX835P 2000W 15" Loudspeaker',
                    model: 'SRX835P',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Excellent',
                    location: 'In Store',
                    serialNumber: 'P1649-11634',
                    serials: ['P1649-11634', 'P1649-11648'],
                    notes: '2 units consolidated. Location: In Store'
                },
                {
                    primaryId: 'eq-0010',
                    deleteIds: ['eq-0011'],
                    name: 'QSC KW 153 1000W 15" Loudspeaker',
                    model: 'KW153',
                    subCategory: 'SPEAKERS',
                    available: 1,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Good',
                    location: 'In Store',
                    serialNumber: 'GCC650294',
                    serials: ['GCC650294', 'GCC650293'],
                    notes: '2 units consolidated: 1 Available (SN: GCC650293 - knob missing), 1 Faulty (SN: GCC650294). Location: In Store'
                },
                {
                    primaryId: 'eq-0014',
                    deleteIds: ['eq-0015'],
                    name: 'HK PR:O 10 XA 600W 10" Monitor',
                    model: 'HK PR:O 10 XA',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Good',
                    location: 'In Store',
                    serialNumber: 'A01-1435-20347977',
                    serials: ['A01-1435-20347977', 'A01-1426-20345290'],
                    notes: '2 units consolidated (FIXED). Location: In Store'
                },
                {
                    primaryId: 'eq-0018',
                    deleteIds: ['eq-0019'],
                    name: 'FBT X-LITE 1000W 12" Loudspeaker',
                    model: '38283 X-Lite 12A',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Excellent',
                    location: 'In Store',
                    serialNumber: 'C03295P446',
                    serials: ['C03295P446', 'C03295P371'],
                    notes: '2 units consolidated (FIXED). Location: In Store'
                },
                {
                    primaryId: 'eq-0026',
                    deleteIds: ['eq-0027'],
                    name: 'HK 12" Stage Monitor',
                    model: 'HK 12" Stage Monitor',
                    subCategory: 'SPEAKERS',
                    available: 2,
                    quantity: 2,
                    status: 'Available',
                    condition: 'Excellent',
                    location: 'In Store',
                    serialNumber: 'A01-1047-20271701',
                    serials: ['A01-1047-20271701', 'A01-1047-20271702'],
                    notes: '2 units consolidated. Location: In Store'
                },
                {
                    primaryId: 'eq-0036',
                    deleteIds: ['eq-0037', 'eq-0038'],
                    name: 'BEHRINGER QX1202 USB 4-CH Mixer',
                    model: 'QX1202 USB',
                    subCategory: 'MIXERS',
                    available: 2,
                    quantity: 3,
                    status: 'Available',
                    condition: 'Good',
                    location: 'In Store',
                    serialNumber: 'S170502531ALR',
                    serials: ['S170502531ALR', 'S170503532ALR', 'S170502533ALR'],
                    notes: '3 units consolidated: 2 Available, 1 Broken/Faulty (Needs Repair). Location: In Store'
                },
                {
                    primaryId: 'eq-0041',
                    deleteIds: ['eq-0042', 'eq-0043', 'eq-0044', 'eq-0045', 'eq-0046', 'eq-0047', 'eq-0048'],
                    name: 'SHURE PG58 BLX4-K14 Wireless Microphone',
                    model: 'PG58 BLX4-K14',
                    subCategory: 'MICS',
                    available: 7,
                    quantity: 8,
                    status: 'Available',
                    condition: 'Good',
                    location: 'In Store',
                    serialNumber: '3MF1319349-03',
                    serials: ['3MF1319349-03', '30G1775072-01', '30H1183527-01', '3PF0856308', '3QH0626899', '3PF0856391', '3QH0626895', '3PK1707915'],
                    notes: '8 units consolidated: 7 Available (SN: 3MF1319349-03 [btn repair], 30G1775072-01, 30H1183527-01, 3PF0856308, 3QH0626899, 3PF0856391 [btn/receiver repair], 3QH0626895), 1 Faulty (SN: 3PK1707915 [missing mic]). Location: In Store'
                },
                {
                    primaryId: 'eq-0051',
                    deleteIds: ['eq-0052', 'eq-0053'],
                    name: 'SHURE SM57 Dynamic Drum Mic Kit',
                    model: 'SM57',
                    subCategory: 'MICS',
                    available: 3,
                    quantity: 3,
                    status: 'Available',
                    condition: 'Excellent',
                    location: 'In Store',
                    serialNumber: 'N\\A',
                    serials: [],
                    notes: '3 units consolidated. Location: In Store'
                }
            ];

            const toRemove = new Set();
            for (const def of audioDefs) {
                for (const delId of def.deleteIds) {
                    toRemove.add(delId);
                }
            }

            if (audioCat.items.some((it) => it && toRemove.has(it.id))) {
                audioCat.items = audioCat.items.filter((it) => !it || !toRemove.has(it.id));
            }

            for (const def of audioDefs) {
                const primary = audioCat.items.find((it) => it && it.id === def.primaryId);
                if (primary) {
                    primary.name = def.name;
                    primary.model = def.model;
                    primary.subCategory = def.subCategory;
                    primary.available = def.available;
                    primary.quantity = def.quantity;
                    primary.status = def.status;
                    primary.condition = def.condition;
                    primary.location = def.location;
                    primary.serialNumber = def.serialNumber;
                    primary.serials = def.serials;
                    primary.notes = def.notes;
                }
            }
        }
    }

    // Strip any reserved and lost-in-coast equipment items from all departments
    if (Array.isArray(inventory)) {
        inventory.forEach((cat) => {
            if (Array.isArray(cat.items)) {
                cat.items = cat.items.filter((it) => {
                    if (!it) return false;
                    const isCoast = (it.location && it.location.toLowerCase().includes('coast')) ||
                                    (it.notes && it.notes.toLowerCase().includes('coast'));
                    const isReserved = it.status === 'Reserved' ||
                                       (it.notes && it.notes.toLowerCase().includes('reserved'));
                    return !isCoast && !isReserved;
                });
            }
        });
    }

    return {
        ...fallbackState,
        ...savedState,
        accounts: normalizedAccounts,
        inventory,
        events: Array.isArray(savedState.events) ? savedState.events : fallbackState.events,
        messages: Array.isArray(savedState.messages) ? savedState.messages : fallbackState.messages
    };
}

function getStoredState() {
    let saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
        // Migrate from legacy browser caches (phenmo-staff-portal-v1)
        if (Array.isArray(LEGACY_STORAGE_KEYS)) {
            for (const oldKey of LEGACY_STORAGE_KEYS) {
                const oldData = localStorage.getItem(oldKey);
                if (oldData) {
                    try {
                        const parsed = JSON.parse(oldData);
                        const normalized = normalizeStoredState(parsed);
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
                        localStorage.removeItem(oldKey);
                        return normalized;
                    } catch (e) {}
                }
            }
        }

        const defaultState = getDefaultState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
        return defaultState;
    }

    try {
        const parsedState = JSON.parse(saved);
        const normalizedState = normalizeStoredState(parsedState);

        if (JSON.stringify(normalizedState) !== saved) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
        }

        return normalizedState;
    } catch (error) {
        const defaultState = getDefaultState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
        return defaultState;
    }
}

async function hydrateStateFromServer() {
    if (typeof fetch !== 'function') {
        return;
    }

    try {
        const response = await fetch('/api/state');

        if (!response.ok) {
            return;
        }

        const remoteState = await response.json();
        const normalizedState = normalizeStoredState(remoteState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
    } catch (error) {
        // Ignore server hydration failures and keep using local browser storage.
    }
}

function saveState(state) {
    const normalizedState = normalizeStoredState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));

    if (typeof fetch === 'function') {
        fetch('/api/state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(normalizedState)
        }).catch(() => {
            // Ignore API save failures and keep local storage in sync.
        });
    }
}

function getCurrentUser() {
    const savedUser = localStorage.getItem(CURRENT_USER_KEY);

    if (!savedUser) {
        return null;
    }

    try {
        return JSON.parse(savedUser);
    } catch (error) {
        localStorage.removeItem(CURRENT_USER_KEY);
        return null;
    }
}

function setCurrentUser(account) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
}

function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
}

function goToLoginIfNeeded() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
    }
}

function getAccountById(accountId) {
    const state = getStoredState();
    return state.accounts.find((account) => account.id === accountId);
}

// Consolidated inventory rows (e.g. CYCLOPS MOVING HEAD) keep every physical
// unit's serial in `serials`. Scanning any one of those units must still resolve
// to the consolidated row, so serial checks go through these helpers.
function getItemSerials(item) {
    if (!item || typeof item !== 'object') return [];
    const seen = new Set();
    const list = [];
    if (item.serialNumber && item.serialNumber !== 'N/A' && item.serialNumber !== 'N\\A') {
        const s = String(item.serialNumber).trim();
        if (s && !seen.has(s.toLowerCase())) {
            seen.add(s.toLowerCase());
            list.push(s);
        }
    }
    if (Array.isArray(item.serials)) {
        for (const raw of item.serials) {
            if (raw && raw !== 'N/A' && raw !== 'N\\A') {
                const s = String(raw).trim();
                if (s && !seen.has(s.toLowerCase())) {
                    seen.add(s.toLowerCase());
                    list.push(s);
                }
            }
        }
    }
    return list;
}

function matchesItemSerial(item, query) {
    if (!query) return false;
    const q = String(query).toLowerCase().trim();
    return getItemSerials(item).some((s) => s.toLowerCase().includes(q));
}

// Group items sharing the same model number into one unified model section
function groupInventoryByModel(items) {
    const groups = new Map();

    items.forEach((item) => {
        const rawModel = (item.model || '').trim();
        const rawName = (item.name || '').trim();
        const rawSub = (item.subCategory || '').trim();
        const isGenericModel = !rawModel || /^n[\\\/]a$/i.test(rawModel) || /^none$/i.test(rawModel);

        let groupKey = '';
        let displayModel = '';
        let cleanTitle = '';

        // Specifically consolidate stage panels into 2m by 1m and 1m by 1m sections, stage legs, stage steps, and stage c-clamps
        const is2x1StagePanel = /2\s*x\s*1|2m\s*(by|x)\s*1m/i.test(rawSub) || /2\s*x\s*1|2m\s*(by|x)\s*1m/i.test(rawModel) || /2m\s*(by|x)\s*1m\s*stage\s*panel/i.test(rawName) || (/stage\s*platf/i.test(rawName) && item.id !== 'eq-0502');
        const is1x1StagePanel = !is2x1StagePanel && (/1\s*x\s*1|1m\s*(by|x)\s*1m/i.test(rawSub) || /1\s*x\s*1|1m\s*(by|x)\s*1m/i.test(rawModel) || /1m\s*(by|x)\s*1m\s*stage\s*panel/i.test(rawName) || item.id === 'eq-0502');
        const isAdjustableLegs = /stage\s*leg|adjustable\s*stage\s*leg/i.test(rawName) || /60cm-93cm/i.test(rawSub) || /60cm-93cm/i.test(rawModel) || /adjustable\s*stage\s*leg/i.test(rawSub);
        const isStageSteps = /stage\s*step/i.test(rawName) || /stage\s*step/i.test(rawSub);
        const isStageCClamps = /stage\s*c[-\s]?clamp/i.test(rawName) || /stage\s*c[-\s]?clamp/i.test(rawSub) || /c[-\s]?clamp/i.test(rawName) || /c[-\s]?clamp/i.test(rawSub);
        const isStageSingleClamps = /single\s*clamp/i.test(rawName) || /single\s*clamp/i.test(rawSub);
        const isStageDoubleClamps = /double\s*clamp/i.test(rawName) || /double\s*clamp/i.test(rawSub);
        const isStageVelcroPlates = /velcro\s*plate/i.test(rawName) || /velcro\s*plate/i.test(rawSub);

        if (is2x1StagePanel) {
            const groupKey = 'MODEL:STAGE-PANEL-2X1';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: '2m by 1m',
                    displayModel: '2m by 1m',
                    title: '2m by 1m Stage Panel',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: '2m by 1m Stage Platform',
                    units: [{
                        ...item,
                        name: '2m by 1m Stage Panel',
                        model: '2m by 1m',
                        subCategory: '2m by 1m Stage Platform',
                        available: Number(item.available) || 20
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (isAdjustableLegs) {
            const groupKey = 'MODEL:ADJUSTABLE-STAGE-LEGS';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: '60cm-93cm',
                    displayModel: '60cm-93cm',
                    title: 'Adjustable Stage Legs',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Adjustable Stage Legs',
                    units: [{
                        ...item,
                        name: 'Adjustable Stage Legs',
                        model: '60cm-93cm',
                        subCategory: 'Adjustable Stage Legs',
                        available: Number(item.available) || 78
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (isStageSteps) {
            const groupKey = 'MODEL:STAGE-STEPS';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: 'Standard',
                    displayModel: 'Standard',
                    title: 'Stage Steps',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Stage Steps',
                    units: [{
                        ...item,
                        name: 'Stage Steps',
                        model: 'Standard',
                        subCategory: 'Stage Steps',
                        available: Number(item.available) || 2
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (isStageCClamps) {
            const groupKey = 'MODEL:STAGE-C-CLAMPS';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: 'Standard',
                    displayModel: 'Standard',
                    title: 'Stage C-Clamps',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Stage C-Clamps',
                    units: [{
                        ...item,
                        name: 'Stage C-Clamps',
                        model: 'Standard',
                        subCategory: 'Stage C-Clamps',
                        available: Number(item.available) || 41
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (isStageSingleClamps) {
            const groupKey = 'MODEL:STAGE-SINGLE-CLAMPS';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: 'Standard',
                    displayModel: 'Standard',
                    title: 'Stage Single Clamps',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Stage Single Clamps',
                    units: [{
                        ...item,
                        name: 'Stage Single Clamps',
                        model: 'Standard',
                        subCategory: 'Stage Single Clamps',
                        available: Number(item.available) || 18,
                        needsRepair: true
                    }]
                });
            } else {
                existing.units[0].available = 18;
            }
            return;
        } else if (isStageDoubleClamps) {
            const groupKey = 'MODEL:STAGE-DOUBLE-CLAMPS';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: 'Standard',
                    displayModel: 'Standard',
                    title: 'Stage Double Clamps',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Stage Double Clamps',
                    units: [{
                        ...item,
                        name: 'Stage Double Clamps',
                        model: 'Standard',
                        subCategory: 'Stage Double Clamps',
                        available: Number(item.available) || 12
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (isStageVelcroPlates) {
            const groupKey = 'MODEL:STAGE-VELCRO-PLATES';
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, {
                    key: groupKey,
                    modelNumber: 'Standard',
                    displayModel: 'Standard',
                    title: 'Stage Velcro Plates',
                    categoryName: item.categoryName || 'Stage & Staging',
                    subCategory: 'Stage Velcro Plates',
                    units: [{
                        ...item,
                        name: 'Stage Velcro Plates',
                        model: 'Standard',
                        subCategory: 'Stage Velcro Plates',
                        available: Number(item.available) || 29
                    }]
                });
            } else {
                existing.units[0].available += (Number(item.available) || 1);
            }
            return;
        } else if (is1x1StagePanel) {
            groupKey = 'MODEL:STAGE-PANEL-1X1';
            displayModel = '1m x 1m';
            cleanTitle = '1m by 1m Stage Panel';
        } else if (!isGenericModel) {
            groupKey = 'MODEL:' + rawModel.toUpperCase();
            displayModel = rawModel;
            cleanTitle = (item.name || '').replace(/\s+#?\d+$/i, '').trim() || item.name;
        } else {
            const baseName = (item.name || '').replace(/\s+#?\d+$/i, '').trim() || item.name;
            groupKey = 'NAME:' + baseName.toUpperCase();
            displayModel = item.subCategory || 'Standard';
            cleanTitle = baseName;
        }

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                key: groupKey,
                modelNumber: (isGenericModel && !is2x1StagePanel && !is1x1StagePanel) ? '' : displayModel,
                displayModel: displayModel,
                title: cleanTitle,
                categoryName: item.categoryName || '',
                subCategory: is2x1StagePanel ? '2m by 1m Stage Platform' : is1x1StagePanel ? '1m by 1m Stage Platform' : (item.subCategory || ''),
                units: []
            });
        }

        groups.get(groupKey).units.push(item);
    });

    return Array.from(groups.values());
}

function formatDate(dateString) {
    if (!dateString) return '—';

    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatStatus(status) {
    const normalized = (status || 'Planned').toLowerCase().replace(/\s+/g, '-');
    return `status-${normalized}`;
}

function detectDeviceDetails() {
    const ua = navigator.userAgent || '';
    let platform = 'Browser';
    if (/android/i.test(ua)) platform = 'Android Phone';
    else if (/iphone/i.test(ua)) platform = 'iPhone';
    else if (/ipad/i.test(ua)) platform = 'iPad';
    else if (/windows/i.test(ua)) platform = 'Windows PC';
    else if (/macintosh|mac os x/i.test(ua)) platform = 'Mac';
    else if (/linux/i.test(ua)) platform = 'Linux Device';

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return isStandalone ? `${platform} (Installed App)` : `${platform} (Web)`;
}

function initLoginPage() {
    const GATE_STORAGE_KEY = 'phenmo_portal_gate_unlocked';

    const portalGatePanel = document.getElementById('portal-gate-panel');
    const portalGateForm = document.getElementById('portal-gate-form');
    const gatePasswordInput = document.getElementById('gate-password-input');
    const gateErrorMsg = document.getElementById('gate-error-msg');

    const portalAuthPanel = document.getElementById('portal-auth-panel');
    const accountSelectGrid = document.getElementById('account-select-grid');
    const accountLoginForm = document.getElementById('account-login-form');
    const accountPasswordLabel = document.getElementById('account-password-label');
    const accountPasswordInput = document.getElementById('account-password-input');
    const accountLoginErrorMsg = document.getElementById('account-login-error-msg');
    const accountLoginSubmitBtn = document.getElementById('account-login-submit-btn');
    const lockGateBtn = document.getElementById('lock-gate-btn');

    const firstTimeSetupPanel = document.getElementById('first-time-setup-panel');
    const setupStaffName = document.getElementById('setup-staff-name');
    const setupForm = document.getElementById('setup-form');
    const setupEmailInput = document.getElementById('setup-email-input');
    const setupPasswordInput = document.getElementById('setup-password-input');
    const setupConfirmInput = document.getElementById('setup-confirm-input');
    const setupErrorMsg = document.getElementById('setup-error-msg');
    const setupCancelBtn = document.getElementById('setup-cancel-btn');

    const state = getStoredState();
    let activeSetupAccount = null;
    let selectedAccountId = 'steve'; // Default selected account

    // Helper: Lock Gate UI
    function lockGateUI() {
        if (portalGatePanel) portalGatePanel.classList.remove('hidden');
        if (portalAuthPanel) portalAuthPanel.classList.add('hidden');
        if (firstTimeSetupPanel) firstTimeSetupPanel.classList.add('hidden');
        if (gatePasswordInput) {
            gatePasswordInput.value = '';
            gatePasswordInput.focus();
        }
        if (gateErrorMsg) gateErrorMsg.classList.add('hidden');
    }

    // Helper: Unlock Gate UI
    function unlockGateUI() {
        if (portalGatePanel) portalGatePanel.classList.add('hidden');
        if (portalAuthPanel) portalAuthPanel.classList.remove('hidden');
        if (firstTimeSetupPanel) firstTimeSetupPanel.classList.add('hidden');
        updateSelectedAccountUI();
    }

    // Check initial gate state from sessionStorage
    const isGateUnlocked = sessionStorage.getItem(GATE_STORAGE_KEY) === '1';
    if (isGateUnlocked) {
        unlockGateUI();
    } else {
        lockGateUI();
    }

    // Master Security Gate Form Submission
    if (portalGateForm) {
        portalGateForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (gateErrorMsg) gateErrorMsg.classList.add('hidden');

            const enteredCode = (gatePasswordInput?.value || '').trim();
            if (!enteredCode) {
                if (gateErrorMsg) {
                    gateErrorMsg.textContent = 'Please enter the master portal access code.';
                    gateErrorMsg.classList.remove('hidden');
                }
                return;
            }

            let authorized = false;
            try {
                const response = await fetch('/api/auth/gate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ masterPassword: enteredCode })
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    authorized = true;
                } else {
                    if (gateErrorMsg) {
                        gateErrorMsg.textContent = result.error || 'Incorrect master portal access code.';
                        gateErrorMsg.classList.remove('hidden');
                    }
                    return;
                }
            } catch (networkError) {
                // Offline fallback check: accept default master code
                if (enteredCode === 'phenmo2026' || enteredCode === '0000') {
                    authorized = true;
                } else {
                    if (gateErrorMsg) {
                        gateErrorMsg.textContent = 'Incorrect master portal access code. (Default code: phenmo2026)';
                        gateErrorMsg.classList.remove('hidden');
                    }
                    return;
                }
            }

            if (authorized) {
                sessionStorage.setItem(GATE_STORAGE_KEY, '1');
                unlockGateUI();
            }
        });
    }

    // Lock Gate Button Handler
    if (lockGateBtn) {
        lockGateBtn.addEventListener('click', () => {
            sessionStorage.removeItem(GATE_STORAGE_KEY);
            lockGateUI();
        });
    }

    // Helper: Update UI for selected staff account
    function updateSelectedAccountUI() {
        const selectedAccount = (state.accounts || []).find((acc) => acc.id === selectedAccountId) || {
            id: 'steve',
            name: 'Steve',
            role: 'Managing Director'
        };

        // Update cards highlight
        if (accountSelectGrid) {
            accountSelectGrid.querySelectorAll('.account-select-card').forEach((card) => {
                const isMatch = card.dataset.accountId === selectedAccount.id;
                card.classList.toggle('is-selected', isMatch);
                card.setAttribute('aria-checked', isMatch ? 'true' : 'false');
            });
        }

        // Update password label and submit button
        if (accountPasswordLabel) {
            accountPasswordLabel.textContent = `Password for ${selectedAccount.role} (${selectedAccount.name})`;
        }
        if (accountLoginSubmitBtn) {
            accountLoginSubmitBtn.textContent = `Sign In as ${selectedAccount.name} (${selectedAccount.role}) 🚀`;
        }
        if (accountPasswordInput) {
            accountPasswordInput.value = '';
            accountPasswordInput.placeholder = selectedAccount.password === DEFAULT_PASSWORD
                ? 'Enter default code 0000'
                : `Enter ${selectedAccount.role.toLowerCase()} password`;
            accountPasswordInput.focus();
        }
        if (accountLoginErrorMsg) {
            accountLoginErrorMsg.classList.add('hidden');
        }
    }

    // Account Card Selection Click Listener
    if (accountSelectGrid) {
        accountSelectGrid.addEventListener('click', (event) => {
            const card = event.target.closest('.account-select-card');
            if (!card) return;

            const accountId = card.dataset.accountId;
            if (accountId) {
                selectedAccountId = accountId;
                updateSelectedAccountUI();
            }
        });
    }

    function showSetupWizard(account) {
        activeSetupAccount = account;
        if (portalAuthPanel) portalAuthPanel.classList.add('hidden');
        if (portalGatePanel) portalGatePanel.classList.add('hidden');
        if (firstTimeSetupPanel) firstTimeSetupPanel.classList.remove('hidden');

        if (setupStaffName) {
            setupStaffName.textContent = `${account.name} (${account.role})`;
        }
        if (setupEmailInput) {
            setupEmailInput.value = account.email || '';
            setupEmailInput.focus();
        }
        if (setupPasswordInput) setupPasswordInput.value = '';
        if (setupConfirmInput) setupConfirmInput.value = '';
        if (setupErrorMsg) setupErrorMsg.classList.add('hidden');
    }

    function hideSetupWizard() {
        activeSetupAccount = null;
        if (firstTimeSetupPanel) firstTimeSetupPanel.classList.add('hidden');
        if (portalAuthPanel) portalAuthPanel.classList.remove('hidden');
        if (accountLoginErrorMsg) accountLoginErrorMsg.classList.add('hidden');
    }

    if (setupCancelBtn) {
        setupCancelBtn.addEventListener('click', hideSetupWizard);
    }

    // Personal Password Form Submission for Selected Account
    if (accountLoginForm) {
        accountLoginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (accountLoginErrorMsg) accountLoginErrorMsg.classList.add('hidden');

            const password = (accountPasswordInput?.value || '').trim();
            const selectedAccount = (state.accounts || []).find((acc) => acc.id === selectedAccountId);

            if (!selectedAccount || !password) {
                if (accountLoginErrorMsg) {
                    accountLoginErrorMsg.textContent = selectedAccount
                        ? 'Please enter your account password.'
                        : 'Please select an account first.';
                    accountLoginErrorMsg.classList.remove('hidden');
                }
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: selectedAccount.id, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    if (result.requiresSetup) {
                        showSetupWizard(result.account);
                        return;
                    }

                    setCurrentUser(result.account);
                    window.location.href = 'dashboard.html';
                    return;
                }

                if (accountLoginErrorMsg) {
                    accountLoginErrorMsg.textContent = result.error || 'Invalid password. Use 0000 for first-time login.';
                    accountLoginErrorMsg.classList.remove('hidden');
                }
            } catch (networkError) {
                if (selectedAccount && (selectedAccount.password || DEFAULT_PASSWORD) === password) {
                    if (password === DEFAULT_PASSWORD) {
                        showSetupWizard(selectedAccount);
                        return;
                    }

                    setCurrentUser(selectedAccount);
                    window.location.href = 'dashboard.html';
                    return;
                }

                if (accountLoginErrorMsg) {
                    accountLoginErrorMsg.textContent = 'Invalid password. Default code is 0000 on first login.';
                    accountLoginErrorMsg.classList.remove('hidden');
                }
            }
        });
    }


    // First-Time Setup Form Submission
    if (setupForm) {
        setupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!activeSetupAccount) return;

            const email = (setupEmailInput?.value || '').trim().toLowerCase();
            const newPassword = (setupPasswordInput?.value || '').trim();
            const confirmPassword = (setupConfirmInput?.value || '').trim();

            if (setupErrorMsg) setupErrorMsg.classList.add('hidden');

            if (!email || !email.includes('@') || !email.includes('.')) {
                if (setupErrorMsg) {
                    setupErrorMsg.textContent = 'Please enter a valid work email address.';
                    setupErrorMsg.classList.remove('hidden');
                }
                return;
            }

            if (!newPassword || newPassword.length < 4) {
                if (setupErrorMsg) {
                    setupErrorMsg.textContent = 'New password must be at least 4 characters long.';
                    setupErrorMsg.classList.remove('hidden');
                }
                return;
            }

            if (newPassword === DEFAULT_PASSWORD) {
                if (setupErrorMsg) {
                    setupErrorMsg.textContent = 'New password cannot be the default code 0000.';
                    setupErrorMsg.classList.remove('hidden');
                }
                return;
            }

            if (newPassword !== confirmPassword) {
                if (setupErrorMsg) {
                    setupErrorMsg.textContent = 'Passwords do not match. Please verify both password fields.';
                    setupErrorMsg.classList.remove('hidden');
                }
                return;
            }

            const deviceInfo = detectDeviceDetails();

            try {
                const response = await fetch('/api/auth/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: activeSetupAccount.id,
                        email,
                        newPassword,
                        deviceInfo
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Update client-side local cache
                    const currentStored = getStoredState();
                    const targetAcc = currentStored.accounts.find((a) => a.id === activeSetupAccount.id);
                    if (targetAcc) {
                        targetAcc.email = email;
                        targetAcc.password = newPassword;
                        saveState(currentStored);
                    }

                    setCurrentUser(result.account);
                    window.location.href = 'dashboard.html';
                    return;
                }

                if (setupErrorMsg) {
                    setupErrorMsg.textContent = result.error || 'Failed to complete setup. Please try again.';
                    setupErrorMsg.classList.remove('hidden');
                }
            } catch (networkErr) {
                // Offline fallback setup
                const currentStored = getStoredState();
                const targetAcc = currentStored.accounts.find((a) => a.id === activeSetupAccount.id);
                if (targetAcc) {
                    targetAcc.email = email;
                    targetAcc.password = newPassword;

                    // Send local alert message to Steve
                    const now = new Date();
                    const timeFormatted = now.toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    currentStored.messages.unshift({
                        id: `msg-${Date.now()}`,
                        senderId: targetAcc.id,
                        recipientId: 'steve',
                        text: `🔔 First Staff Login Alert: ${targetAcc.name} (${targetAcc.role}) completed first-time setup on ${timeFormatted}. Device: ${deviceInfo}. Permanent email: ${email}.`,
                        sentAt: now.toISOString()
                    });

                    saveState(currentStored);
                    setCurrentUser(targetAcc);
                    window.location.href = 'dashboard.html';
                    return;
                }

                if (setupErrorMsg) {
                    setupErrorMsg.textContent = 'Network error during setup. Please check connection and retry.';
                    setupErrorMsg.classList.remove('hidden');
                }
            }
        });
    }
}

function renderCurrentUser() {
    const currentUser = getCurrentUser();
    const badge = document.getElementById('current-user-badge');

    if (!badge || !currentUser) {
        return;
    }

    badge.textContent = currentUser.role;
}

let currentInventoryCategoryId = 'audio';
let currentInventorySearchQuery = '';
let currentInventoryFilter = 'all';

function renderInventoryManager() {
    const currentUser = getCurrentUser();
    const state = getStoredState();
    const categoriesWrap = document.getElementById('inventory-manager-categories');
    const listWrap = document.getElementById('inventory-manager-list');
    const searchInput = document.getElementById('inventory-search-input');
    const searchClearBtn = document.getElementById('inventory-search-clear');
    const filterButtons = document.querySelectorAll('.inv-filter-btn');

    if (!categoriesWrap || !listWrap || !currentUser || !['steve', 'mariah', 'dave'].includes(currentUser.id)) {
        return;
    }

    const inventory = Array.isArray(state.inventory) ? state.inventory : [];

    // Header counts real units, so consolidated rows still contribute every unit.
    const totalUnits = inventory.reduce(
        (sum, cat) => sum + (cat.items || []).reduce((s, itm) => s + (Number(itm.available) || 0), 0),
        0
    );
    const totalAssetsLabel = document.getElementById('inventory-total-assets');
    if (totalAssetsLabel && totalUnits) {
        totalAssetsLabel.textContent = String(totalUnits);
    }

    if (!inventory.length) {
        categoriesWrap.innerHTML = '<p class="inventory-empty">No categories loaded.</p>';
        listWrap.innerHTML = '<p class="inventory-empty">No inventory available yet.</p>';
        return;
    }

    if (!inventory.some((cat) => cat.id === currentInventoryCategoryId)) {
        currentInventoryCategoryId = inventory[0].id;
    }

    // 1. Render Categories sidebar
    categoriesWrap.innerHTML = inventory
        .map((category) => {
            const isActive = !currentInventorySearchQuery && category.id === currentInventoryCategoryId;
            return `
                <button
                    type="button"
                    class="inventory-category ${isActive ? 'is-active' : ''}"
                    data-inventory-manager-category="${category.id}"
                >
                    <span>${category.name}</span>
                    <small>${category.items.length} items</small>
                </button>
            `;
        })
        .join('');

    // 2. Wire category clicks
    categoriesWrap.onclick = (event) => {
        const button = event.target.closest('[data-inventory-manager-category]');
        if (!button) return;
        currentInventoryCategoryId = button.dataset.inventoryManagerCategory;
        if (currentInventorySearchQuery) {
            currentInventorySearchQuery = '';
            if (searchInput) searchInput.value = '';
            if (searchClearBtn) searchClearBtn.classList.add('hidden');
        }
        renderItemsList();
    };

    // 3. Search and Quick Filter listeners
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', (e) => {
            currentInventorySearchQuery = e.target.value.trim().toLowerCase();
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('hidden', !currentInventorySearchQuery);
            }
            renderItemsList();
        });
    }

    if (searchClearBtn && !searchClearBtn.dataset.bound) {
        searchClearBtn.dataset.bound = 'true';
        searchClearBtn.addEventListener('click', () => {
            currentInventorySearchQuery = '';
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            searchClearBtn.classList.add('hidden');
            renderItemsList();
        });
    }

    if (filterButtons.length) {
        filterButtons.forEach((btn) => {
            if (!btn.dataset.bound) {
                btn.dataset.bound = 'true';
                btn.addEventListener('click', () => {
                    filterButtons.forEach((b) => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    currentInventoryFilter = btn.dataset.invFilter || 'all';
                    renderItemsList();
                });
            }
        });
    }

    // 4. Render items function
    function renderItemsList() {
        const freshState = getStoredState();
        const freshInventory = Array.isArray(freshState.inventory) ? freshState.inventory : [];

        categoriesWrap.querySelectorAll('[data-inventory-manager-category]').forEach((button) => {
            const isCatActive = !currentInventorySearchQuery && button.dataset.inventoryManagerCategory === currentInventoryCategoryId;
            button.classList.toggle('is-active', isCatActive);
        });

        let itemsToDisplay = [];
        let headerNote = '';

        if (currentInventorySearchQuery) {
            // Search across all company assets
            for (const cat of freshInventory) {
                for (const itm of cat.items || []) {
                    const match =
                        (itm.name && itm.name.toLowerCase().includes(currentInventorySearchQuery)) ||
                        (itm.model && itm.model.toLowerCase().includes(currentInventorySearchQuery)) ||
                        (itm.serialNumber && itm.serialNumber.toLowerCase().includes(currentInventorySearchQuery)) ||
                        matchesItemSerial(itm, currentInventorySearchQuery) ||
                        (itm.subCategory && itm.subCategory.toLowerCase().includes(currentInventorySearchQuery)) ||
                        (itm.notes && itm.notes.toLowerCase().includes(currentInventorySearchQuery)) ||
                        (itm.location && itm.location.toLowerCase().includes(currentInventorySearchQuery)) ||
                        (itm.id && itm.id.toLowerCase().includes(currentInventorySearchQuery));

                    if (match) {
                        itemsToDisplay.push({ ...itm, categoryName: cat.name });
                    }
                }
            }
            headerNote = `<div class="gear-search-header"><span>Found <strong>${itemsToDisplay.length}</strong> matching assets for "<strong>${currentInventorySearchQuery}</strong>"</span> <small>Searching all 7 departments</small></div>`;
        } else {
            const activeCategory = freshInventory.find((cat) => cat.id === currentInventoryCategoryId) || freshInventory[0];
            itemsToDisplay = (activeCategory ? activeCategory.items : []).map((itm) => ({ ...itm, categoryName: activeCategory?.name || '' }));
            headerNote = `<div class="gear-search-header"><span><strong>${activeCategory?.name || 'Department'}</strong> (${itemsToDisplay.length} total assets)</span> <small>Use search above to find any model or serial #</small></div>`;
        }

        // Apply quick filter
        if (currentInventoryFilter === 'available') {
            itemsToDisplay = itemsToDisplay.filter((itm) => itm.available > 0 && itm.status === 'Available');
        } else if (currentInventoryFilter === 'excellent') {
            itemsToDisplay = itemsToDisplay.filter((itm) => (itm.condition || '').toLowerCase() === 'excellent');
        } else if (currentInventoryFilter === 'faulty') {
            itemsToDisplay = itemsToDisplay.filter((itm) =>
                itm.status === 'Broken' ||
                ['faulty', 'broken', 'damaged', 'fair', 'needs repair'].includes((itm.condition || '').toLowerCase()) ||
                (itm.notes && /need\s*repair|faulty/i.test(itm.notes))
            );
        }

        const groupedModels = groupInventoryByModel(itemsToDisplay);

        if (!groupedModels.length) {
            listWrap.innerHTML = `
                ${headerNote}
                <div class="inventory-empty" style="text-align: center; padding: 32px 16px;">
                    <p style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">No equipment matches your current search or filter.</p>
                    <p style="font-size: 13px; color: var(--muted);">Try clearing your search or switching filter tabs.</p>
                </div>
            `;
            return;
        }

        listWrap.innerHTML = `
            ${headerNote}
            ${groupedModels.map((group) => {
                const totalUnits = group.units.length;
                const availableUnits = group.units.filter((u) => u.available > 0 && u.status === 'Available').length;
                const brokenUnits = group.units.filter((u) =>
                    u.status === 'Broken' ||
                    ['faulty', 'broken', 'damaged', 'fair', 'needs repair'].includes((u.condition || '').toLowerCase())
                ).length;
                const reservedUnits = group.units.filter((u) => u.status === 'Reserved').length;

                let summaryBadgeClass = 'all-available';
                let summaryBadgeText = `🟢 ${availableUnits} / ${totalUnits} Available`;

                if (availableUnits === totalUnits && totalUnits > 0) {
                    summaryBadgeClass = 'all-available';
                    summaryBadgeText = `🟢 ${availableUnits} / ${totalUnits} Available`;
                } else if (availableUnits > 0) {
                    summaryBadgeClass = 'partial-available';
                    const detail = brokenUnits ? ` (${brokenUnits} faulty)` : reservedUnits ? ` (${reservedUnits} reserved)` : '';
                    summaryBadgeText = `🟡 ${availableUnits} / ${totalUnits} Available${detail}`;
                } else {
                    summaryBadgeClass = 'none-available';
                    const detail = brokenUnits ? ` (${brokenUnits} faulty)` : '';
                    summaryBadgeText = `🔴 0 / ${totalUnits} Available${detail}`;
                }

                // Keep group expanded if any unit matches active search query
                const hasSearchMatch = Boolean(currentInventorySearchQuery && group.units.some((u) =>
                    (u.name && u.name.toLowerCase().includes(currentInventorySearchQuery)) ||
                    (u.serialNumber && u.serialNumber.toLowerCase().includes(currentInventorySearchQuery)) ||
                    matchesItemSerial(u, currentInventorySearchQuery)
                ));

                const isCollapsed = totalUnits > 4 && !hasSearchMatch;
                const toggleBtn = totalUnits > 4
                    ? `<button type="button" class="model-toggle-btn" data-model-toggle="${encodeURIComponent(group.key)}">${isCollapsed ? `Show all ${totalUnits} units ▾` : `Show less ▴`}</button>`
                    : '';

                const deptBadge = currentInventorySearchQuery && group.categoryName
                    ? `<span class="gear-subcat-tag" style="background: rgba(56,169,255,0.1); color: #7ad1ff;">${group.categoryName}</span>`
                    : '';
                const subcatBadge = group.subCategory ? `<span class="gear-subcat-tag">${group.subCategory}</span>` : '';
                const modelBadge = group.modelNumber
                    ? `<span class="gear-model-badge" title="Equipment Model">📦 Model: ${group.modelNumber}</span>`
                    : '';
                const countBadge = `<span class="gear-subcat-tag" title="Total Equipment Units">${totalUnits} unit${totalUnits > 1 ? 's' : ''}</span>`;

                if (totalUnits === 1) {
                    const unit = group.units[0];
                    const unitStatusClass = (unit.status || 'Available').toLowerCase().replace(/\s+/g, '-');
                    const unitConditionClass = (unit.condition || 'Good').toLowerCase().replace(/\s+/g, '-');
                    const unitSerials = getItemSerials(unit);
                    const serialChip = unitSerials.length > 1
                        ? `<span class="gear-serial-chip" title="Unit Serial Numbers">🏷️ SNs (${unitSerials.length}): ${unitSerials.join(', ')}</span>`
                        : (unitSerials.length === 1)
                            ? `<span class="gear-serial-chip" title="Serial Number">🏷️ SN: ${unitSerials[0]}</span>`
                            : (unit.serialNumber && unit.serialNumber !== 'N/A' && unit.serialNumber !== 'N\\A')
                                ? `<span class="gear-serial-chip" title="Serial Number">🏷️ SN: ${unit.serialNumber}</span>`
                                : '';
                    const locBadge = unit.location ? `<span class="location-tag" title="Location">📍 ${unit.location}</span>` : '';
                    const condBadge = `<span class="condition-badge condition-${unitConditionClass}">${unit.condition || 'Good'}</span>`;
                    const repairNoticeTag = (unit.id === 'eq-0626' || /single\s*clamp/i.test(unit.name) || (unit.notes && /need\s*repair/i.test(unit.notes)))
                        ? `<span class="condition-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-weight: 600;">⚠️ 4 Need Repair (Clamps 20–23)</span>`
                        : '';
                    const repairNoticeBanner = (unit.id === 'eq-0626' || /single\s*clamp/i.test(unit.name))
                        ? `<div class="repair-notice-banner" style="margin: 8px 0 6px; padding: 8px 12px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 12.5px; line-height: 1.5;">
                            <strong style="color: #fbbf24;">Maintenance Breakdown:</strong>
                            <span style="color: #ddd;"> <strong>18</strong> Available &bull; <strong style="color: #fbbf24;">4 Need Repair</strong> (Clamps 20, 21, 22, 23) &bull; <span style="color: #f87171; font-weight: 600;">1 Faulty</span> (Clamp 18) &bull; <span style="color: #9ca3af;">2 Missing</span> (Clamps 24, 25)</span>
                           </div>`
                        : '';

                    return `
                        <article class="inventory-item-card inventory-manager-card" data-inventory-manager-item="${unit.id}">
                            <div class="inventory-item-details">
                                <div class="inventory-item-header">
                                    <h4>${group.title}</h4>
                                    <span class="inventory-status ${unitStatusClass}">${unit.status}</span>
                                </div>

                                <div class="gear-meta-row">
                                    ${deptBadge}
                                    ${subcatBadge}
                                    ${modelBadge}
                                    ${serialChip}
                                    ${condBadge}
                                    ${repairNoticeTag}
                                    ${locBadge}
                                </div>

                                ${repairNoticeBanner}

                                <p style="font-size: 13px; margin-top: 4px; color: var(--muted);">${unit.notes || 'Location: In Store'}</p>
                            </div>

                            <div class="inventory-item-actions inventory-manager-actions">
                                <label class="inventory-input-row">
                                    <span>Available</span>
                                    <input type="number" min="0" value="${unit.available}" data-inventory-field="available" data-inventory-item-id="${unit.id}">
                                </label>
                                <label class="inventory-input-row">
                                    <span>Status</span>
                                    <select data-inventory-field="status" data-inventory-item-id="${unit.id}">
                                        <option value="Available" ${unit.status === 'Available' ? 'selected' : ''}>Available</option>
                                        <option value="Reserved" ${unit.status === 'Reserved' ? 'selected' : ''}>Reserved</option>
                                        <option value="Broken" ${unit.status === 'Broken' ? 'selected' : ''}>Broken</option>
                                    </select>
                                </label>
                                <label class="inventory-input-row">
                                    <span>Condition</span>
                                    <select data-inventory-field="condition" data-inventory-item-id="${unit.id}">
                                        <option value="Excellent" ${unit.condition === 'Excellent' ? 'selected' : ''}>Excellent</option>
                                        <option value="Good" ${unit.condition === 'Good' || !unit.condition ? 'selected' : ''}>Good</option>
                                        <option value="Fair" ${unit.condition === 'Fair' ? 'selected' : ''}>Fair</option>
                                        <option value="Faulty" ${unit.condition === 'Faulty' || unit.condition === 'Damaged' ? 'selected' : ''}>Faulty / Damaged</option>
                                    </select>
                                </label>
                                <label class="inventory-input-row wide">
                                    <span>Notes / Location</span>
                                    <input type="text" value="${unit.notes || ''}" data-inventory-field="notes" data-inventory-item-id="${unit.id}">
                                </label>
                            </div>
                        </article>
                    `;
                }

                return `
                    <section class="inventory-model-section" data-model-group="${encodeURIComponent(group.key)}">
                        <header class="model-section-header">
                            <div class="model-section-title-wrap">
                                <div class="model-title-row">
                                    <h4>${group.title}</h4>
                                    ${modelBadge}
                                </div>
                                <div class="model-header-badges">
                                    ${deptBadge}
                                    ${subcatBadge}
                                    ${countBadge}
                                </div>
                            </div>
                            <div class="model-header-right">
                                <span class="model-summary-badge ${summaryBadgeClass}">${summaryBadgeText}</span>
                                ${toggleBtn}
                            </div>
                        </header>

                        <div class="model-units-container">
                            <div class="model-units-header-kicker">
                                <span>Individual Equipment Units &amp; Serial Numbers</span>
                                <span>Availability &amp; Condition</span>
                            </div>
                            <div class="model-units-list ${isCollapsed ? 'is-collapsed' : ''}">
                                ${group.units.map((unit) => {
                                    const unitStatusClass = (unit.status || 'Available').toLowerCase().replace(/\s+/g, '-');
                                    const unitConditionClass = (unit.condition || 'Good').toLowerCase().replace(/\s+/g, '-');
                                    const unitSerials = getItemSerials(unit);
                                    const serialChip = (unit.serialNumber || unitSerials.length)
                                        ? `<span class="gear-serial-chip" title="Serial Number">🏷️ SN: ${unit.serialNumber || unitSerials.join(', ')}</span>`
                                        : '';
                                    const locBadge = unit.location ? `<span class="location-tag" title="Location">📍 ${unit.location}</span>` : '';
                                    const condBadge = `<span class="condition-badge condition-${unitConditionClass}">${unit.condition || 'Good'}</span>`;

                                    const isUnitMatch = Boolean(currentInventorySearchQuery && (
                                        (unit.name && unit.name.toLowerCase().includes(currentInventorySearchQuery)) ||
                                        (unit.serialNumber && unit.serialNumber.toLowerCase().includes(currentInventorySearchQuery)) ||
                                        matchesItemSerial(unit, currentInventorySearchQuery)
                                    ));

                                    return `
                                        <div class="model-unit-row ${isUnitMatch ? 'is-search-match' : ''}" data-inventory-manager-item="${unit.id}">
                                            <div class="model-unit-info">
                                                <div class="model-unit-title-line">
                                                    <span class="model-unit-name">${unit.name}</span>
                                                    <span class="inventory-status ${unitStatusClass}">${unit.status}</span>
                                                </div>
                                                <div class="model-unit-meta-line">
                                                    ${serialChip}
                                                    ${condBadge}
                                                    ${locBadge}
                                                </div>
                                                ${unit.notes ? `<p class="model-unit-notes">${unit.notes}</p>` : ''}
                                            </div>

                                            <div class="model-unit-controls inventory-manager-actions">
                                                <label class="inventory-input-row">
                                                    <span>Available</span>
                                                    <input type="number" min="0" value="${unit.available}" data-inventory-field="available" data-inventory-item-id="${unit.id}">
                                                </label>
                                                <label class="inventory-input-row">
                                                    <span>Status</span>
                                                    <select data-inventory-field="status" data-inventory-item-id="${unit.id}">
                                                        <option value="Available" ${unit.status === 'Available' ? 'selected' : ''}>Available</option>
                                                        <option value="Reserved" ${unit.status === 'Reserved' ? 'selected' : ''}>Reserved</option>
                                                        <option value="Broken" ${unit.status === 'Broken' ? 'selected' : ''}>Broken</option>
                                                    </select>
                                                </label>
                                                <label class="inventory-input-row">
                                                    <span>Condition</span>
                                                    <select data-inventory-field="condition" data-inventory-item-id="${unit.id}">
                                                        <option value="Excellent" ${unit.condition === 'Excellent' ? 'selected' : ''}>Excellent</option>
                                                        <option value="Good" ${unit.condition === 'Good' || !unit.condition ? 'selected' : ''}>Good</option>
                                                        <option value="Fair" ${unit.condition === 'Fair' ? 'selected' : ''}>Fair</option>
                                                        <option value="Faulty" ${unit.condition === 'Faulty' || unit.condition === 'Damaged' ? 'selected' : ''}>Faulty / Damaged</option>
                                                    </select>
                                                </label>
                                                <label class="inventory-input-row wide">
                                                    <span>Notes / Location</span>
                                                    <input type="text" value="${unit.notes || ''}" data-inventory-field="notes" data-inventory-item-id="${unit.id}">
                                                </label>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </section>
                `;
            }).join('')}
        `;
    }

    // 5. Expand / Collapse toggle handler for model groups
    listWrap.onclick = (event) => {
        const toggleBtn = event.target.closest('.model-toggle-btn');
        if (!toggleBtn) return;
        const section = toggleBtn.closest('.inventory-model-section');
        const list = section?.querySelector('.model-units-list');
        if (!list) return;
        const isCollapsed = list.classList.toggle('is-collapsed');
        const count = list.querySelectorAll('.model-unit-row').length;
        toggleBtn.textContent = isCollapsed ? `Show all ${count} units ▾` : `Show less ▴`;
    };

    // 6. Input change handler with live parent summary badge and backend sync
    listWrap.onchange = listWrap.oninput = (event) => {
        const target = event.target;
        const field = target.dataset.inventoryField;
        const itemId = target.dataset.inventoryItemId;

        if (!field || !itemId) return;

        const stateToUpdate = getStoredState();
        let updatedItem = null;

        for (const cat of stateToUpdate.inventory || []) {
            const itm = (cat.items || []).find((entry) => entry.id === itemId);
            if (itm) {
                updatedItem = itm;
                break;
            }
        }

        if (!updatedItem) return;

        if (field === 'available') {
            updatedItem.available = Math.max(0, Number(target.value) || 0);
        } else if (field === 'status') {
            updatedItem.status = target.value;
            const row = target.closest('.model-unit-row') || target.closest('.inventory-manager-card');
            const pill = row?.querySelector('.inventory-status');
            if (pill) {
                pill.className = `inventory-status ${target.value.toLowerCase().replace(/\s+/g, '-')}`;
                pill.textContent = target.value;
            }
        } else if (field === 'condition') {
            updatedItem.condition = target.value;
            const row = target.closest('.model-unit-row') || target.closest('.inventory-manager-card');
            const condBadge = row?.querySelector('.condition-badge');
            if (condBadge) {
                condBadge.className = `condition-badge condition-${target.value.toLowerCase().replace(/\s+/g, '-')}`;
                condBadge.textContent = target.value;
            }
        } else if (field === 'notes') {
            updatedItem.notes = target.value;
        }

        // Live recalculate parent model section summary badge
        const parentSection = target.closest('.inventory-model-section');
        if (parentSection) {
            const unitRows = parentSection.querySelectorAll('.model-unit-row');
            const total = unitRows.length;
            let availCount = 0;
            let brokenCount = 0;
            let reservedCount = 0;
            unitRows.forEach((r) => {
                const st = r.querySelector('[data-inventory-field="status"]')?.value || 'Available';
                const av = Number(r.querySelector('[data-inventory-field="available"]')?.value) || 0;
                const cd = (r.querySelector('[data-inventory-field="condition"]')?.value || '').toLowerCase();
                if (av > 0 && st === 'Available') availCount++;
                if (st === 'Broken' || ['faulty', 'broken', 'damaged', 'fair', 'needs repair'].includes(cd)) brokenCount++;
                if (st === 'Reserved') reservedCount++;
            });

            const summaryBadge = parentSection.querySelector('.model-summary-badge');
            if (summaryBadge) {
                if (availCount === total && total > 0) {
                    summaryBadge.className = 'model-summary-badge all-available';
                    summaryBadge.textContent = `🟢 ${availCount} / ${total} Available`;
                } else if (availCount > 0) {
                    summaryBadge.className = 'model-summary-badge partial-available';
                    const detail = brokenCount ? ` (${brokenCount} faulty)` : reservedCount ? ` (${reservedCount} reserved)` : '';
                    summaryBadge.textContent = `🟡 ${availCount} / ${total} Available${detail}`;
                } else {
                    summaryBadge.className = 'model-summary-badge none-available';
                    const detail = brokenCount ? ` (${brokenCount} faulty)` : '';
                    summaryBadge.textContent = `🔴 0 / ${total} Available${detail}`;
                }
            }
        }

        saveState(stateToUpdate);

        if (typeof fetch === 'function' && event.type === 'change') {
            fetch(`/api/inventory/${encodeURIComponent(itemId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    available: updatedItem.available,
                    status: updatedItem.status,
                    condition: updatedItem.condition,
                    notes: updatedItem.notes
                })
            }).catch(() => {});
        }
    };

    renderItemsList();
}

function updateInventoryStateFromManager() {
    renderInventoryManager();
}

function renderInventoryAlerts(state) {
    const alertsWrap = document.getElementById('inventory-alerts');

    if (!alertsWrap) {
        return;
    }

    const inventoryItems = Array.isArray(state.inventory)
        ? state.inventory.flatMap((category) => category.items)
        : [];

    const lowStockItems = inventoryItems.filter((item) => item.available <= 2 || item.status !== 'Available');

    if (!lowStockItems.length) {
        alertsWrap.innerHTML = `
            <div class="inventory-alert inventory-alert-success">
                All inventory items are currently in good stock and ready for booking.
            </div>
        `;
        return;
    }

    if (lowStockItems.length > 5) {
        alertsWrap.innerHTML = `
            <div class="inventory-alert inventory-alert-warning">
                <strong>Warehouse Notice:</strong> ${lowStockItems.length} assets require attention (low stock or faulty).
                <a href="inventory.html" style="color: inherit; text-decoration: underline; margin-left: 8px;">View in Inventory Manager →</a>
            </div>
        `;
        return;
    }

    alertsWrap.innerHTML = `
        <div class="inventory-alert inventory-alert-warning">
            <strong>Low stock alert:</strong>
            ${lowStockItems
                .map(
                    (item) => `${item.name} (${item.available} available${item.status !== 'Available' ? `, ${item.status}` : ''})`
                )
                .join(', ')}
        </div>
    `;
}

function renderStats(events, currentUser, state = getStoredState()) {
    const statsGrid = document.getElementById('stats-grid');

    if (!statsGrid) {
        return;
    }

    const inventoryItems = Array.isArray(state.inventory)
        ? state.inventory.flatMap((category) => category.items)
        : [];

    const totalEvents = events.length;
    const assignedToMe = events.filter((event) => event.assignedTo === currentUser.id).length;
    const upcoming = events.filter((event) => new Date(event.eventDate) >= new Date()).length;
    const planned = events.filter((event) => event.status === 'Planned').length;
    const totalInventoryItems = inventoryItems.length;
    const lowStockItems = inventoryItems.filter((item) => item.available <= 2 || item.status !== 'Available').length;
    const totalAvailableUnits = inventoryItems.reduce((sum, item) => sum + Number(item.available || 0), 0);

    const cards = [
        { label: 'Total events', value: totalEvents, note: 'Across all plans' },
        { label: 'Assigned to you', value: assignedToMe, note: 'Your current workload' },
        { label: 'Upcoming', value: upcoming, note: 'Next scheduled events' },
        { label: 'Planned', value: planned, note: 'Still pending setup' },
        { label: 'Inventory items', value: totalInventoryItems, note: 'Across all categories' },
        { label: 'Low stock', value: lowStockItems, note: 'Items needing attention' },
        { label: 'Available units', value: totalAvailableUnits, note: 'Current stock count' }
    ];

    statsGrid.innerHTML = cards
        .map(
            (card) => `
                <article class="stat-card">
                    <span class="label">${card.label}</span>
                    <strong>${card.value}</strong>
                    <small>${card.note}</small>
                </article>
            `
        )
        .join('');
}

function renderEventsTable() {
    const currentUser = getCurrentUser();
    const state = getStoredState();
    const tableBody = document.getElementById('event-table-body');

    if (!tableBody || !currentUser) {
        return;
    }

    const canManage = ['steve', 'mariah', 'dave'].includes(currentUser.id);
    const events = [...state.events].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

    if (!events.length) {
        tableBody.innerHTML = `
            <tr>
                <td class="empty-state" colspan="5">No event plans yet. Create one to get started.</td>
            </tr>
        `;

        const newPlanButton = document.getElementById('new-plan-button');
        if (newPlanButton) {
            newPlanButton.classList.toggle('hidden', !canManage);
        }

        return;
    }

    tableBody.innerHTML = events
        .map((event) => {
            const assignedAccount = getAccountById(event.assignedTo) || { name: 'Unassigned' };
            const returnLink = canManage
                ? `<br><a class="action-link" href="plan.html?id=${event.id}">Equipment check & returns</a>`
                : '';

            const venueNavHtml = event.venue
                ? `<br><a class="venue-nav-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}" target="_blank" rel="noopener noreferrer">📍 Navigate</a>`
                : '';

            const clientPhone = (event.clientPhone || '').trim();
            const clientContactHtml = clientPhone
                ? `
                    <div class="client-contact-row">
                        <a class="contact-action-badge contact-call" href="tel:${clientPhone.replace(/\s+/g, '')}" title="Call Client">📞 Call</a>
                        <a class="contact-action-badge contact-wa" href="https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" title="WhatsApp Client">💬 WA</a>
                    </div>
                `
                : '';

            return `
                <tr>
                    <td>
                        <a class="action-link" href="plan.html?id=${event.id}">
                            <strong>${event.eventName}</strong>
                        </a><br>
                        <small>${event.venue}</small>
                        ${venueNavHtml}
                        ${returnLink}
                    </td>
                    <td>
                        ${event.clientName}
                        ${clientContactHtml}
                    </td>
                    <td>${formatDate(event.eventDate)}</td>
                    <td>${assignedAccount.name}</td>
                    <td>
                        <span class="status-pill ${formatStatus(event.status)}">
                            ${event.status}
                        </span>
                    </td>
                </tr>
            `;
        })
        .join('');

    const newPlanButton = document.getElementById('new-plan-button');
    if (newPlanButton) {
        newPlanButton.classList.toggle('hidden', !canManage);
    }
}

function renderReturnedItemsPanel() {
    const currentUser = getCurrentUser();
    const state = getStoredState();
    const panelWrap = document.getElementById('returned-items-panel');

    if (!panelWrap || !currentUser || !['steve', 'mariah', 'dave'].includes(currentUser.id)) {
        if (panelWrap) {
            panelWrap.innerHTML = '';
        }
        return;
    }

    const returnedEvents = (Array.isArray(state.events) ? state.events : [])
        .map((event) => {
            const returnedInventory = Array.isArray(event.inventoryBooked)
                ? event.inventoryBooked
                      .filter((entry) => entry.returnedCondition && entry.returnedCondition.trim())
                      .map((entry) => {
                          const item = findInventoryItemById(state, entry.itemId);

                          return {
                              ...entry,
                              itemName: item?.name || 'Equipment',
                              itemCategory: item?.categoryName || 'Inventory'
                          };
                      })
                : [];

            return {
                ...event,
                returnedInventory,
                hasLegacySummary: Boolean(event.returnedEquipment && event.returnedEquipment.trim())
            };
        })
        .filter((event) => event.returnedInventory.length || event.hasLegacySummary)
        .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

    if (!returnedEvents.length) {
        panelWrap.innerHTML = `
            <section class="panel returned-items-panel">
                <div class="panel-header tight">
                    <div>
                        <p class="panel-kicker">RETURNED ITEMS</p>
                        <h3>Returned equipment</h3>
                    </div>
                </div>
                <p class="inventory-empty">No returned equipment has been recorded yet.</p>
            </section>
        `;
        return;
    }

    panelWrap.innerHTML = `
        <section class="panel returned-items-panel">
            <div class="panel-header tight">
                <div>
                    <p class="panel-kicker">RETURNED ITEMS</p>
                    <h3>Returned equipment</h3>
                </div>
            </div>

            <div class="returned-items-list">
                ${returnedEvents
                    .map((event) => {
                        const itemsHtml = event.returnedInventory.length
                            ? event.returnedInventory
                                  .map((entry) => {
                                      const damageDetailsHtml = entry.damageDetails?.serialNumber || entry.damageDetails?.problem
                                          ? `
                                              <small class="returned-item-meta">
                                                  ${entry.damageDetails?.serialNumber ? `Serial: ${entry.damageDetails.serialNumber}` : ''}
                                                  ${entry.damageDetails?.serialNumber && entry.damageDetails?.problem ? ' • ' : ''}
                                                  ${entry.damageDetails?.problem ? `Problem: ${entry.damageDetails.problem}` : ''}
                                              </small>
                                          `
                                          : '';

                                      const photoThumbHtml = entry.damageDetails?.photo
                                          ? `<img src="${entry.damageDetails.photo}" class="returned-item-photo-thumb" alt="Damage proof" title="Tap to enlarge" data-lightbox-src="${entry.damageDetails.photo}" data-lightbox-caption="${entry.itemName} - ${entry.damageDetails.problem || ''}">`
                                          : '';

                                      return `
                                          <div class="returned-item-line">
                                              <div class="returned-item-main">
                                                  <span>${entry.itemName}</span>
                                                  ${damageDetailsHtml}
                                              </div>
                                              <div style="display: flex; align-items: center; gap: 8px;">
                                                  ${photoThumbHtml}
                                                  <span class="returned-item-condition">${entry.returnedCondition}</span>
                                              </div>
                                          </div>
                                      `;
                                  })
                                  .join('')
                            : `<p>${event.returnedEquipment}</p>`;

                        const conditionCounts = event.returnedInventory.reduce((acc, entry) => {
                            const label = entry.returnedCondition || 'Not returned';
                            acc[label] = (acc[label] || 0) + 1;
                            return acc;
                        }, {});

                        const summaryHtml = Object.entries(conditionCounts).length
                            ? `
                                <div class="returned-item-summary">
                                    ${Object.entries(conditionCounts)
                                        .map(([condition, count]) => {
                                            const conditionClass = (condition || 'not-returned')
                                                .toLowerCase()
                                                .replace(/\s+/g, '-');

                                            return `
                                                <span class="returned-summary-pill returned-summary-pill--${conditionClass}">${condition} (${count})</span>
                                            `;
                                        })
                                        .join('')}
                                </div>
                            `
                            : '';

                        return `
                            <article class="returned-item-card">
                                <div class="returned-item-header">
                                    <strong>${event.eventName}</strong>
                                    <small>${formatDate(event.eventDate)}</small>
                                </div>
                                ${summaryHtml}
                                <div class="returned-item-details">
                                    ${itemsHtml}
                                </div>
                            </article>
                        `;
                    })
                    .join('')}
            </div>
        </section>
    `;

    panelWrap.onclick = (event) => {
        const thumb = event.target.closest('[data-lightbox-src]');
        if (thumb) {
            openPhotoLightbox(thumb.dataset.lightboxSrc, thumb.dataset.lightboxCaption || '');
        }
    };
}

function renderMessagesPanel() {
    const currentUser = getCurrentUser();
    const state = getStoredState();
    const messagesWrap = document.getElementById('messages-panel');

    if (!messagesWrap || !currentUser) {
        return;
    }

    const recipients = state.accounts.filter((account) => account.id !== currentUser.id);
    const visibleMessages = (Array.isArray(state.messages) ? state.messages : [])
        .filter((message) => message.senderId === currentUser.id || message.recipientId === currentUser.id)
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    messagesWrap.innerHTML = `
        <section class="panel messages-panel">
            <div class="panel-header tight">
                <div>
                    <p class="panel-kicker">COMMUNICATION</p>
                    <h3>Messages</h3>
                </div>
            </div>

            <div class="messages-layout">
                <div class="messages-list">
                    ${visibleMessages.length
                        ? visibleMessages
                              .map((message) => {
                                  const sender = getAccountById(message.senderId) || { role: 'Unknown', name: 'Unknown' };
                                  const recipient = getAccountById(message.recipientId) || { role: 'Unknown', name: 'Unknown' };
                                  const isOutgoing = message.senderId === currentUser.id;
                                  const isLoginAlert = message.text.includes('First Staff Login Alert');

                                  const cardClass = isLoginAlert
                                      ? 'message-card message-admin-alert'
                                      : `message-card ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`;

                                  const headerLabel = isLoginAlert
                                      ? `🔔 First Staff Login Alert: ${sender.name} (${sender.role})`
                                      : `${isOutgoing ? 'To:' : 'From:'} ${isOutgoing ? recipient.role : sender.role}`;

                                  return `
                                      <article class="${cardClass}">
                                          <div class="message-header">
                                              <strong>${headerLabel}</strong>
                                              <small>${new Date(message.sentAt).toLocaleString('en-GB', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  year: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit'
                                              })}</small>
                                          </div>
                                          <p>${message.text}</p>
                                      </article>
                                  `;
                              })
                              .join('')
                        : '<p class="inventory-empty">No messages yet. Send one to start a conversation.</p>'}
                </div>

                <form id="message-form" class="message-form">
                    <label>
                        <span>Send to</span>
                        <select id="message-recipient" name="recipientId" required>
                            <option value="">Select a team role</option>
                            ${recipients
                                .map(
                                    (account) => `<option value="${account.id}">${account.role}</option>`
                                )
                                .join('')}
                        </select>
                    </label>

                    <label>
                        <span>Message</span>
                        <textarea id="message-text" name="messageText" rows="4" placeholder="Write a message to another staff role" required></textarea>
                    </label>

                    <button class="primary-btn" type="submit">Send message</button>
                </form>
            </div>
        </section>
    `;

    const messageForm = document.getElementById('message-form');

    if (messageForm) {
        messageForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const formData = new FormData(messageForm);
            const recipientId = formData.get('recipientId')?.toString().trim();
            const text = formData.get('messageText')?.toString().trim();

            if (!recipientId || !text) {
                return;
            }

            const updatedState = getStoredState();
            const nextMessages = Array.isArray(updatedState.messages) ? updatedState.messages : [];

            nextMessages.push({
                id: `msg-${Date.now()}`,
                senderId: currentUser.id,
                recipientId,
                text,
                sentAt: new Date().toISOString()
            });

            updatedState.messages = nextMessages;
            saveState(updatedState);
            renderMessagesPanel();
        });
    }
}

function initDashboardPage() {
    goToLoginIfNeeded();

    const currentUser = getCurrentUser();
    const state = getStoredState();

    renderCurrentUser();
    renderStats(state.events, currentUser, state);
    renderInventoryAlerts(state);
    renderEventsTable();
    renderReturnedItemsPanel();
    renderMessagesPanel();

    const inventoryButton = document.getElementById('inventory-button');
    if (inventoryButton) {
        inventoryButton.addEventListener('click', () => {
            window.location.href = 'inventory.html';
        });
    }

    const newPlanButton = document.getElementById('new-plan-button');
    if (newPlanButton) {
        newPlanButton.addEventListener('click', () => {
            window.location.href = 'plan.html';
        });
    }

    const changePasswordButton = document.getElementById('change-password-button');
    if (changePasswordButton) {
        changePasswordButton.addEventListener('click', async () => {
            const currentPassword = window.prompt('Enter your current password:');

            if (currentPassword === null) {
                return;
            }

            const newPassword = window.prompt('Enter a new password for this account:');

            if (newPassword === null) {
                return;
            }

            const trimmedCurrent = currentPassword.trim();
            const trimmedPassword = newPassword.trim();

            if (!trimmedCurrent || !trimmedPassword) {
                window.alert('Password cannot be empty.');
                return;
            }

            if (trimmedPassword === DEFAULT_PASSWORD) {
                window.alert('New password cannot be the default code 0000.');
                return;
            }

            // The server verifies the current password, so only update the local
            // cache once it has confirmed the change.
            try {
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: currentUser.id,
                        currentPassword: trimmedCurrent,
                        newPassword: trimmedPassword
                    })
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    window.alert(result.error || 'Unable to change password. Please try again.');
                    return;
                }
            } catch (networkError) {
                window.alert('Network error. Password was not changed — please retry while online.');
                return;
            }

            const updatedState = getStoredState();
            const accountIndex = updatedState.accounts.findIndex((account) => account.id === currentUser.id);

            if (accountIndex >= 0) {
                updatedState.accounts[accountIndex].password = trimmedPassword;
                saveState(updatedState);
            }

            const refreshedUser = { ...currentUser, password: trimmedPassword };
            setCurrentUser(refreshedUser);
            renderCurrentUser();
            window.alert('Password updated successfully.');
        });
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            clearCurrentUser();
            window.location.href = 'index.html';
        });
    }
}

function populateAssignedSelect(selectedId) {
    const state = getStoredState();
    const select = document.getElementById('assigned-to');

    if (!select) {
        return;
    }

    select.innerHTML = state.accounts
        .map(
            (account) => `
                <option value="${account.id}" ${selectedId === account.id ? 'selected' : ''}>
                    ${account.name} (${account.role})
                </option>
            `
        )
        .join('');
}

function findInventoryItemById(state, itemId) {
    for (const category of state.inventory || []) {
        const match = category.items.find((item) => item.id === itemId);
        if (match) {
            return {
                ...match,
                categoryId: category.id,
                categoryName: category.name
            };
        }
    }

    return null;
}

function showDamageDetailsModal(item, currentDetails, onSave, onCancel) {
    const existingModal = document.getElementById('damage-details-modal');

    if (existingModal) {
        existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'damage-details-modal';
    overlay.className = 'damage-details-modal-overlay';

    let capturedPhoto = currentDetails?.photo || '';

    overlay.innerHTML = `
        <div class="damage-details-modal" role="dialog" aria-modal="true" aria-labelledby="damage-details-title">
            <div class="damage-details-modal-header">
                <h4 id="damage-details-title">Damaged equipment details</h4>
                <button type="button" class="damage-details-close" aria-label="Close">×</button>
            </div>

            <div class="damage-details-modal-body">
                <p class="damage-details-item">${item?.name || 'Equipment item'}</p>

                <label class="damage-details-field">
                    <span>Serial number</span>
                    <input id="damage-serial-number" type="text" value="${(currentDetails?.serialNumber || '').replace(/"/g, '&quot;')}" placeholder="Enter serial number">
                </label>

                <label class="damage-details-field">
                    <span>Specific problem</span>
                    <textarea id="damage-problem-details" rows="3" placeholder="Describe the issue in detail">${(currentDetails?.problem || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </label>

                <div class="damage-photo-upload-wrap">
                    <input type="file" accept="image/*" capture="environment" id="damage-photo-file-input" style="display:none">
                    <button type="button" class="damage-camera-btn" id="damage-photo-trigger">📷 Snap / Attach Damage Photo</button>
                    <div id="damage-photo-preview-box" class="damage-photo-preview-wrap ${capturedPhoto ? '' : 'hidden'}">
                        <img id="damage-photo-img" class="damage-photo-preview" src="${capturedPhoto}" alt="Damage proof">
                        <button type="button" class="remove-photo-btn" id="remove-damage-photo-btn" title="Remove photo">✕</button>
                    </div>
                </div>
            </div>

            <div class="damage-details-modal-actions">
                <button type="button" class="secondary-btn damage-details-cancel">Cancel</button>
                <button type="button" class="primary-btn damage-details-save">Save details</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = (shouldCancel = false) => {
        overlay.remove();

        if (shouldCancel && typeof onCancel === 'function') {
            onCancel();
        }
    };

    const serialInput = overlay.querySelector('#damage-serial-number');
    const problemInput = overlay.querySelector('#damage-problem-details');
    const photoFileInput = overlay.querySelector('#damage-photo-file-input');
    const photoTriggerBtn = overlay.querySelector('#damage-photo-trigger');
    const photoPreviewBox = overlay.querySelector('#damage-photo-preview-box');
    const photoImg = overlay.querySelector('#damage-photo-img');
    const removePhotoBtn = overlay.querySelector('#remove-damage-photo-btn');

    if (photoTriggerBtn && photoFileInput) {
        photoTriggerBtn.addEventListener('click', () => {
            photoFileInput.click();
        });

        photoFileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                photoTriggerBtn.textContent = 'Compressing photo...';
                capturedPhoto = await compressImageFile(file, 800, 0.75);
                photoImg.src = capturedPhoto;
                photoPreviewBox.classList.remove('hidden');
                photoTriggerBtn.textContent = '📷 Retake / Replace Photo';
            } catch (err) {
                alert('Could not load image. Please try again.');
                photoTriggerBtn.textContent = '📷 Snap / Attach Damage Photo';
            }
        });
    }

    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            capturedPhoto = '';
            photoImg.src = '';
            photoPreviewBox.classList.add('hidden');
            photoFileInput.value = '';
            photoTriggerBtn.textContent = '📷 Snap / Attach Damage Photo';
        });
    }

    overlay.querySelector('.damage-details-close').addEventListener('click', () => {
        closeModal(true);
    });

    overlay.querySelector('.damage-details-cancel').addEventListener('click', () => {
        closeModal(true);
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeModal(true);
        }
    });

    overlay.querySelector('.damage-details-save').addEventListener('click', () => {
        const details = {
            serialNumber: serialInput.value.trim(),
            problem: problemInput.value.trim(),
            photo: capturedPhoto
        };

        if (typeof onSave === 'function') {
            onSave(details);
        }

        closeModal(false);
    });

    serialInput.focus();
}

function renderInventorySection(activeCategoryId, selectedInventory, canEdit, searchQuery = '') {
    const state = getStoredState();
    const categoriesWrap = document.getElementById('inventory-categories');
    const inventoryListWrap = document.getElementById('inventory-list');
    const selectedWrap = document.getElementById('inventory-selected-list');

    if (!categoriesWrap || !inventoryListWrap || !selectedWrap) {
        return;
    }

    const inventory = Array.isArray(state.inventory) ? state.inventory : [];

    if (!inventory.length) {
        categoriesWrap.innerHTML = '';
        inventoryListWrap.innerHTML = '<p class="inventory-empty">No inventory available yet.</p>';
        selectedWrap.innerHTML = '<p class="inventory-empty">No items selected yet.</p>';
        return;
    }

    const validActiveCategory = inventory.some((category) => category.id === activeCategoryId)
        ? activeCategoryId
        : inventory[0].id;

    const activeCategory = inventory.find((category) => category.id === validActiveCategory) || inventory[0];
    const cleanQuery = (searchQuery || '').trim().toLowerCase();
    const isSearch = Boolean(cleanQuery);

    categoriesWrap.innerHTML = inventory
        .map(
            (category) => `
                <button
                    type="button"
                    class="inventory-category ${!isSearch && category.id === validActiveCategory ? 'is-active' : ''}"
                    data-inventory-category="${category.id}"
                >
                    <span>${category.name}</span>
                    <small>${category.items.length} items</small>
                </button>
            `
        )
        .join('');

    let itemsToRender = [];
    let searchHeaderHtml = '';

    if (isSearch) {
        const allItems = inventory.flatMap((cat) => (cat.items || []).map((it) => ({ ...it, categoryName: cat.name })));
        itemsToRender = allItems.filter((item) => {
            const nameMatch = (item.name || '').toLowerCase().includes(cleanQuery);
            const modelMatch = (item.model || '').toLowerCase().includes(cleanQuery);
            const notesMatch = (item.notes || '').toLowerCase().includes(cleanQuery);
            const subMatch = (item.subCategory || '').toLowerCase().includes(cleanQuery);
            const serialMatch = matchesItemSerial(item, cleanQuery);
            return nameMatch || modelMatch || notesMatch || subMatch || serialMatch;
        });

        searchHeaderHtml = `
            <div class="inventory-search-info-bar">
                <span>Matching &ldquo;<strong>${cleanQuery}</strong>&rdquo;: <strong>${itemsToRender.length}</strong> equipment unit${itemsToRender.length === 1 ? '' : 's'} found</span>
            </div>
        `;
    } else {
        itemsToRender = (activeCategory.items || []).map((it) => ({ ...it, categoryName: activeCategory.name }));
    }

    if (!itemsToRender.length) {
        inventoryListWrap.innerHTML = searchHeaderHtml + `<p class="inventory-empty">${isSearch ? `No equipment found matching &ldquo;${cleanQuery}&rdquo;. Try another search term.` : 'No items in this category.'}</p>`;
    } else {
        inventoryListWrap.innerHTML = searchHeaderHtml + itemsToRender
            .map((item) => {
                const selectedItem = selectedInventory.find((entry) => entry.itemId === item.id);
                const selectedQuantity = selectedItem?.quantity || 0;
                const canAddMore = canEdit && selectedQuantity < item.available;

                const modelBadge = item.model ? `<span class="gear-model-badge">📦 ${item.model}</span>` : '';
                const unitSerials = getItemSerials(item);
                const serialBadge = unitSerials.length > 1
                    ? `<span class="gear-serial-chip" title="Unit Serial Numbers">🏷️ SNs (${unitSerials.length}): ${unitSerials.join(', ')}</span>`
                    : (unitSerials.length === 1)
                        ? `<span class="gear-serial-chip" title="Serial Number">🏷️ SN: ${unitSerials[0]}</span>`
                        : (item.serialNumber && item.serialNumber !== 'N/A' && item.serialNumber !== 'N\\A')
                            ? `<span class="gear-serial-chip" title="Serial Number">🏷️ SN: ${item.serialNumber}</span>`
                            : '';
                const conditionClass = (item.condition || 'Good').toLowerCase().replace(/\s+/g, '-');
                const conditionBadge = `<span class="condition-badge condition-${conditionClass}">${item.condition || 'Good'}</span>`;
                const deptBadge = isSearch && item.categoryName
                    ? `<span class="gear-subcat-tag" style="background: rgba(56,169,255,0.1); color: #7ad1ff; border: 1px solid rgba(56,169,255,0.25);">${item.categoryName}</span>`
                    : '';

                return `
                    <article class="inventory-item-card">
                        <div class="inventory-item-details">
                            <div class="inventory-item-header">
                                <h4>${item.name}</h4>
                                <span class="inventory-status ${(item.status || 'Available').toLowerCase().replace(/\s+/g, '-')}">${item.status || 'Available'}</span>
                            </div>
                            <div class="gear-meta-row">
                                ${deptBadge}
                                ${modelBadge}
                                ${serialBadge}
                                ${conditionBadge}
                            </div>
                            ${item.notes ? `<p>${item.notes}</p>` : ''}
                        </div>

                        <div class="inventory-item-actions">
                            <div class="inventory-availability">${item.available} available</div>
                            <button
                                type="button"
                                class="primary-btn inventory-add-btn"
                                data-inventory-action="add-item"
                                data-inventory-item-id="${item.id}"
                                ${canAddMore ? '' : 'disabled'}
                            >
                                ${selectedQuantity ? 'Add another' : 'Add item'}
                            </button>
                        </div>
                    </article>
                `;
            })
            .join('');
    }

    const selectedItems = selectedInventory
        .map((entry) => ({ ...entry, item: findInventoryItemById(state, entry.itemId) }))
        .filter((entry) => entry.item);

    selectedWrap.innerHTML = selectedItems.length
        ? selectedItems
              .map(
                  (entry) => `
                      <div class="inventory-selected-item">
                          <div class="inventory-selected-meta">
                              <strong>${entry.item.name}</strong>
                              <small>${entry.item.categoryName}</small>
                          </div>

                          <div class="inventory-selected-actions">
                              <label class="inventory-returned-row">
                                  <span>Returned condition</span>
                                  <select data-inventory-returned-condition data-inventory-item-id="${entry.itemId}" ${canEdit ? '' : 'disabled'}>
                                      <option value="" ${!entry.returnedCondition ? 'selected' : ''}>Not returned</option>
                                      <option value="Good condition" ${entry.returnedCondition === 'Good condition' ? 'selected' : ''}>Good condition</option>
                                      <option value="Damaged" ${entry.returnedCondition === 'Damaged' ? 'selected' : ''}>Damaged</option>
                                      <option value="Missing" ${entry.returnedCondition === 'Missing' ? 'selected' : ''}>Missing</option>
                                  </select>
                              </label>

                              <div class="inventory-qty-controls">
                                  <button
                                      type="button"
                                      class="inventory-qty-btn"
                                      data-inventory-action="decrease-item"
                                      data-inventory-item-id="${entry.itemId}"
                                      ${canEdit ? '' : 'disabled'}
                                  >
                                      -
                                  </button>
                                  <span>${entry.quantity}</span>
                                  <button
                                      type="button"
                                      class="inventory-qty-btn"
                                      data-inventory-action="increase-item"
                                      data-inventory-item-id="${entry.itemId}"
                                      ${canEdit ? '' : 'disabled'}
                                  >
                                      +
                                  </button>
                                  <button
                                      type="button"
                                      class="inventory-remove-btn"
                                      data-inventory-action="remove-item"
                                      data-inventory-item-id="${entry.itemId}"
                                      ${canEdit ? '' : 'disabled'}
                                  >
                                      Remove
                                  </button>
                              </div>
                          </div>
                      </div>
                  `
              )
              .join('')
        : '<p class="inventory-empty">No items selected yet.</p>';
}

function initPlanPage() {
    goToLoginIfNeeded();

    const currentUser = getCurrentUser();
    const planTitle = document.getElementById('plan-title');
    const form = document.getElementById('plan-form');
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('id');
    const state = getStoredState();
    const existingEvent = state.events.find((event) => event.id === eventId);

    populateAssignedSelect(existingEvent?.assignedTo || 'dave');

    const canEdit = ['steve', 'mariah', 'dave'].includes(currentUser.id);
    const inputFields = form.querySelectorAll('input, textarea, select, button');

    inputFields.forEach((field) => {
        if (field.id === 'save-plan-button') {
            field.disabled = !canEdit;
            return;
        }

        if (field.tagName === 'BUTTON') {
            field.disabled = !canEdit;
            return;
        }

        field.disabled = !canEdit;
    });

    const venueInput = document.getElementById('venue');
    const venueNavBtn = document.getElementById('venue-nav-btn');
    const openMapsInlineBtn = document.getElementById('open-maps-inline-btn');
    const clientPhoneInput = document.getElementById('client-phone');

    const updateVenueNav = () => {
        const val = venueInput ? venueInput.value.trim() : '';
        if (venueNavBtn) {
            if (val) {
                venueNavBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}`;
                venueNavBtn.classList.remove('hidden');
            } else {
                venueNavBtn.classList.add('hidden');
            }
        }
    };

    if (venueInput) {
        venueInput.addEventListener('input', updateVenueNav);
    }
    if (openMapsInlineBtn && venueInput) {
        openMapsInlineBtn.addEventListener('click', () => {
            const val = venueInput.value.trim();
            if (val) {
                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}`, '_blank');
            } else {
                alert('Please enter a venue address first');
                venueInput.focus();
            }
        });
    }

    if (existingEvent) {
        planTitle.textContent = `${existingEvent.eventName} Plan`;
        document.getElementById('event-name').value = existingEvent.eventName;
        document.getElementById('client-name').value = existingEvent.clientName;
        if (clientPhoneInput) clientPhoneInput.value = existingEvent.clientPhone || '';
        document.getElementById('event-date').value = existingEvent.eventDate;
        document.getElementById('venue').value = existingEvent.venue;
        document.getElementById('start-time').value = existingEvent.startTime;
        document.getElementById('end-time').value = existingEvent.endTime;
        document.getElementById('setup-time').value = existingEvent.setupTime;
        document.getElementById('breakdown-time').value = existingEvent.breakdownTime;
        document.getElementById('equipment-booked').value = existingEvent.equipmentBooked;
        document.getElementById('notes').value = existingEvent.notes;
        document.getElementById('status').value = existingEvent.status;
        document.getElementById('assigned-to').value = existingEvent.assignedTo;
        updateVenueNav();
    } else {
        planTitle.textContent = 'New Event Plan';
        document.getElementById('status').value = 'Planned';
        document.getElementById('assigned-to').value = currentUser.id;
    }

    if (!canEdit) {
        const saveButton = document.getElementById('save-plan-button');
        if (saveButton) {
            saveButton.classList.add('hidden');
        }
    }

    renderCurrentUser();

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            clearCurrentUser();
            window.location.href = 'index.html';
        });
    }

    let activeInventoryCategoryId = state.inventory?.[0]?.id || null;
    let planInventorySearchQuery = '';
    const selectedInventory = Array.isArray(existingEvent?.inventoryBooked)
        ? existingEvent.inventoryBooked.map((entry) => ({
            itemId: entry.itemId,
            quantity: Number(entry.quantity) || 0,
            returnedCondition: entry.returnedCondition || '',
            damageDetails: entry.damageDetails || null
        }))
        : [];

    const refreshInventoryUI = () => {
        renderInventorySection(activeInventoryCategoryId, selectedInventory, canEdit, planInventorySearchQuery);
    };

    const planSearchInput = document.getElementById('plan-inventory-search');
    const planSearchClear = document.getElementById('plan-inventory-search-clear');

    if (planSearchInput) {
        planSearchInput.addEventListener('input', (event) => {
            planInventorySearchQuery = event.target.value;
            if (planSearchClear) {
                planSearchClear.classList.toggle('hidden', !planInventorySearchQuery.trim());
            }
            refreshInventoryUI();
        });
    }

    if (planSearchClear) {
        planSearchClear.addEventListener('click', () => {
            if (planSearchInput) {
                planSearchInput.value = '';
                planSearchInput.focus();
            }
            planInventorySearchQuery = '';
            planSearchClear.classList.add('hidden');
            refreshInventoryUI();
        });
    }

    const categoriesWrap = document.getElementById('inventory-categories');
    const inventoryListWrap = document.getElementById('inventory-list');
    const selectedWrap = document.getElementById('inventory-selected-list');

    if (categoriesWrap) {
        categoriesWrap.addEventListener('click', (event) => {
            const categoryButton = event.target.closest('[data-inventory-category]');

            if (!categoryButton) {
                return;
            }

            activeInventoryCategoryId = categoryButton.dataset.inventoryCategory;
            if (planInventorySearchQuery) {
                planInventorySearchQuery = '';
                if (planSearchInput) planSearchInput.value = '';
                if (planSearchClear) planSearchClear.classList.add('hidden');
            }
            refreshInventoryUI();
        });
    }

    if (inventoryListWrap) {
        inventoryListWrap.addEventListener('click', (event) => {
            const button = event.target.closest('[data-inventory-action]');

            if (!button) {
                return;
            }

            const action = button.dataset.inventoryAction;
            const itemId = button.dataset.inventoryItemId;
            const inventoryItem = findInventoryItemById(state, itemId);

            if (!inventoryItem || action !== 'add-item') {
                return;
            }

            const existingEntry = selectedInventory.find((entry) => entry.itemId === itemId);

            if (existingEntry) {
                if (existingEntry.quantity < inventoryItem.available) {
                    existingEntry.quantity += 1;
                }
            } else {
                selectedInventory.push({ itemId, quantity: 1 });
            }

            refreshInventoryUI();
        });
    }

    if (selectedWrap) {
        selectedWrap.addEventListener('change', (event) => {
            const select = event.target.closest('[data-inventory-returned-condition]');

            if (!select) {
                return;
            }

            const itemId = select.dataset.inventoryItemId;
            const existingEntry = selectedInventory.find((entry) => entry.itemId === itemId);
            const item = findInventoryItemById(state, itemId);

            if (!existingEntry) {
                return;
            }

            const previousCondition = existingEntry.returnedCondition || '';
            const nextCondition = select.value;

            if (nextCondition === 'Damaged') {
                showDamageDetailsModal(
                    item,
                    existingEntry.damageDetails || {},
                    (damageDetails) => {
                        existingEntry.returnedCondition = 'Damaged';
                        existingEntry.damageDetails = damageDetails;
                    },
                    () => {
                        existingEntry.returnedCondition = previousCondition;
                        select.value = previousCondition;
                    }
                );
                return;
            }

            existingEntry.returnedCondition = nextCondition;
            existingEntry.damageDetails = null;
        });

        selectedWrap.addEventListener('click', (event) => {
            const button = event.target.closest('[data-inventory-action]');

            if (!button) {
                return;
            }

            const action = button.dataset.inventoryAction;
            const itemId = button.dataset.inventoryItemId;
            const existingEntry = selectedInventory.find((entry) => entry.itemId === itemId);

            if (!existingEntry) {
                return;
            }

            if (action === 'increase-item') {
                const inventoryItem = findInventoryItemById(state, itemId);
                if (inventoryItem && existingEntry.quantity < inventoryItem.available) {
                    existingEntry.quantity += 1;
                }
            }

            if (action === 'decrease-item') {
                existingEntry.quantity -= 1;
                if (existingEntry.quantity <= 0) {
                    const removeIndex = selectedInventory.findIndex((entry) => entry.itemId === itemId);
                    if (removeIndex >= 0) {
                        selectedInventory.splice(removeIndex, 1);
                    }
                }
            }

            if (action === 'remove-item') {
                const removeIndex = selectedInventory.findIndex((entry) => entry.itemId === itemId);
                if (removeIndex >= 0) {
                    selectedInventory.splice(removeIndex, 1);
                }
            }

            refreshInventoryUI();
        });
    }

    refreshInventoryUI();

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!canEdit) {
            return;
        }

        const formData = new FormData(form);
        const inventoryBooked = selectedInventory
            .filter((entry) => entry.quantity > 0)
            .map((entry) => ({
                itemId: entry.itemId,
                quantity: entry.quantity,
                returnedCondition: entry.returnedCondition || '',
                damageDetails: entry.returnedCondition === 'Damaged'
                    ? {
                        serialNumber: entry.damageDetails?.serialNumber || '',
                        problem: entry.damageDetails?.problem || '',
                        photo: entry.damageDetails?.photo || ''
                    }
                    : null
            }));

        const returnedEquipmentSummary = inventoryBooked
            .filter((entry) => entry.returnedCondition)
            .map((entry) => {
                const item = findInventoryItemById(state, entry.itemId);
                const baseLabel = `${item?.name || 'Equipment'} (${entry.returnedCondition})`;

                if (entry.returnedCondition === 'Damaged' && entry.damageDetails) {
                    const serial = entry.damageDetails.serialNumber ? `, Serial: ${entry.damageDetails.serialNumber}` : '';
                    const problem = entry.damageDetails.problem ? `, Problem: ${entry.damageDetails.problem}` : '';
                    return `${baseLabel}${serial}${problem}`;
                }

                return baseLabel;
            })
            .join('; ');

        const updatedEvent = {
            id: existingEvent ? existingEvent.id : `evt-${Date.now()}`,
            eventName: formData.get('eventName').toString().trim(),
            clientName: formData.get('clientName').toString().trim(),
            clientPhone: formData.get('clientPhone') ? formData.get('clientPhone').toString().trim() : '',
            eventDate: formData.get('eventDate').toString(),
            venue: formData.get('venue').toString().trim(),
            startTime: formData.get('startTime').toString(),
            endTime: formData.get('endTime').toString(),
            setupTime: formData.get('setupTime').toString(),
            breakdownTime: formData.get('breakdownTime').toString(),
            equipmentBooked: formData.get('equipmentBooked').toString().trim(),
            returnedEquipment: returnedEquipmentSummary,
            notes: formData.get('notes').toString().trim(),
            assignedTo: formData.get('assignedTo').toString(),
            status: formData.get('status').toString(),
            inventoryBooked
        };

        const currentState = getStoredState();
        const existingIndex = currentState.events.findIndex((item) => item.id === updatedEvent.id);

        if (existingIndex >= 0) {
            currentState.events[existingIndex] = updatedEvent;
        } else {
            currentState.events.unshift(updatedEvent);
        }

        saveState(currentState);
        window.location.href = 'dashboard.html';
    });
}

function initInventoryPage() {
    goToLoginIfNeeded();

    const currentUser = getCurrentUser();

    if (!currentUser || !['steve', 'mariah', 'dave'].includes(currentUser.id)) {
        window.location.href = 'dashboard.html';
        return;
    }

    renderCurrentUser();
    renderInventoryManager();

    const backButton = document.getElementById('back-to-dashboard');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            clearCurrentUser();
            window.location.href = 'index.html';
        });
    }
}

// =========================================================
// IMAGE COMPRESSION UTILITY (FOR DAMAGE PHOTOS)
// =========================================================
function compressImageFile(file, maxDimension = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = readerEvent.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// =========================================================
// PHOTO LIGHTBOX VIEWER
// =========================================================
function openPhotoLightbox(src, caption = '') {
    const modal = document.getElementById('photo-lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const cap = document.getElementById('lightbox-caption');
    if (!modal || !img) return;

    img.src = src;
    if (cap) cap.textContent = caption;
    modal.classList.remove('hidden');

    const closeBtn = document.getElementById('lightbox-close-btn');
    const closeModal = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

// =========================================================
// PWA INSTALL PROMPT & OFFLINE SERVICE WORKER
// =========================================================
// PWA INSTALL PROMPT, OFFLINE SW & MULTI-PLATFORM MODAL
// =========================================================
let deferredInstallPrompt = null;

function initPwaInstall() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch((err) => {
                console.warn('[PWA] Service worker registration error:', err);
            });
        });
    }

    const banner = document.getElementById('app-install-banner');
    const installBtn = document.getElementById('pwa-install-btn');
    const dismissBtn = document.getElementById('pwa-dismiss-btn');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (banner && !isStandalone && !sessionStorage.getItem('pwa-banner-dismissed')) {
            banner.classList.remove('hidden');
        }
    });

    if (banner && (isStandalone || sessionStorage.getItem('pwa-banner-dismissed'))) {
        banner.classList.add('hidden');
    }

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const { outcome } = await deferredInstallPrompt.userChoice;
                if (outcome === 'accepted' && banner) {
                    banner.classList.add('hidden');
                }
                deferredInstallPrompt = null;
            } else {
                openInstallGuideModal();
            }
        });
    }

    if (dismissBtn && banner) {
        dismissBtn.addEventListener('click', () => {
            banner.classList.add('hidden');
            sessionStorage.setItem('pwa-banner-dismissed', 'true');
        });
    }

    // ==========================================
    // INSTALL GUIDE MODAL & DEVICE DETECTION
    // ==========================================
    const guideModal = document.getElementById('install-guide-modal');
    const guideCloseBtn = document.getElementById('install-guide-close-btn');
    const oneClickBtn = document.getElementById('trigger-one-click-install-btn');
    const deviceBadge = document.getElementById('device-detected-badge');
    const tabButtons = document.querySelectorAll('[data-install-tab]');
    const platformPanels = document.querySelectorAll('[data-platform-panel]');

    const detectPlatform = () => {
        const ua = navigator.userAgent || '';
        if (/android/i.test(ua)) return 'android';
        if (/windows|win32|win64/i.test(ua)) return 'windows';
        if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
        if (/macintosh|mac os x/i.test(ua)) return 'mac';
        return 'android';
    };

    const switchInstallTab = (targetPlatform) => {
        tabButtons.forEach((tab) => {
            tab.classList.toggle('is-active', tab.dataset.installTab === targetPlatform);
        });
        platformPanels.forEach((panel) => {
            panel.classList.toggle('hidden', panel.dataset.platformPanel !== targetPlatform);
        });
    };

    const openInstallGuideModal = () => {
        if (!guideModal) return;
        const currentPlatform = detectPlatform();
        switchInstallTab(currentPlatform);

        if (deviceBadge) {
            const platformNames = {
                android: '📱 Android Phone / Tablet',
                windows: '💻 Windows PC / Laptop',
                ios: '🍏 iPhone / iPad (iOS)',
                mac: '🍎 Apple Mac Computer'
            };
            deviceBadge.textContent = `Detected Device: ${platformNames[currentPlatform] || 'Your Device'}`;
        }

        guideModal.classList.remove('hidden');
    };

    const closeInstallGuideModal = () => {
        if (guideModal) guideModal.classList.add('hidden');
    };

    // Wire trigger buttons
    const triggerButtons = document.querySelectorAll('#install-app-button, #open-install-modal-btn, .action-install-btn');
    triggerButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openInstallGuideModal();
        });
    });

    if (guideCloseBtn) guideCloseBtn.onclick = closeInstallGuideModal;
    if (guideModal) {
        guideModal.onclick = (e) => {
            if (e.target === guideModal) closeInstallGuideModal();
        };
    }

    tabButtons.forEach((tab) => {
        tab.addEventListener('click', () => {
            switchInstallTab(tab.dataset.installTab);
        });
    });

    if (oneClickBtn) {
        oneClickBtn.addEventListener('click', async () => {
            if (isStandalone) {
                alert('Phenmo Staff App is already installed and running on this device!');
                return;
            }

            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const { outcome } = await deferredInstallPrompt.userChoice;
                if (outcome === 'accepted') {
                    closeInstallGuideModal();
                    if (banner) banner.classList.add('hidden');
                }
                deferredInstallPrompt = null;
            } else {
                const currentPlatform = detectPlatform();
                if (currentPlatform === 'windows') {
                    alert('To install on Windows:\n\nLook at the right side of your Edge or Chrome address bar for the (+) or computer monitor "Install" icon, and click it!');
                } else if (currentPlatform === 'android') {
                    alert('To install on Android:\n\nTap the Chrome menu (⋮ three dots) at the top-right and choose "Install app" or "Add to Home screen"!');
                } else if (currentPlatform === 'ios') {
                    alert('To install on iPhone:\n\nTap the Share icon (⎋) at the bottom of Safari and choose "Add to Home Screen"!');
                } else {
                    alert('Follow the instructions listed below for your device.');
                }
            }
        });
    }

    // Auto-open install guide if URL contains ?install=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('install') === '1' || params.get('action') === 'install') {
        setTimeout(openInstallGuideModal, 250);
    }
}

// =========================================================
// CAMERA BARCODE & QR GEAR SCANNER
// =========================================================
let activeScannerStream = null;
let scannerInterval = null;

function initGearScanner() {
    const scanButtons = document.querySelectorAll('#scan-gear-button, [data-mob-nav="scan"]');
    const modal = document.getElementById('gear-scanner-modal');
    const closeBtn = document.getElementById('scanner-close-btn');
    const video = document.getElementById('scanner-video');
    const statusMsg = document.getElementById('scanner-status-msg');
    const manualSelect = document.getElementById('scanner-manual-select');
    const manualSearchBtn = document.getElementById('scanner-manual-search-btn');
    const resultCard = document.getElementById('scanner-result-card');

    if (!modal) return;

    const populateItemsDropdown = () => {
        if (!manualSelect) return;
        const state = getStoredState();
        let options = '<option value="">-- Choose equipment item --</option>';
        (state.inventory || []).forEach((cat) => {
            if (cat.items && cat.items.length) {
                options += `<optgroup label="${cat.name} (${cat.items.length} units)">`;
                cat.items.forEach((item) => {
                    const extra = item.serialNumber ? ` [SN: ${item.serialNumber}]` : (item.model ? ` [${item.model}]` : '');
                    options += `<option value="${item.id}">${item.name}${extra} (${item.available} in store)</option>`;
                });
                options += `</optgroup>`;
            }
        });
        manualSelect.innerHTML = options;
    };

    const stopScanner = () => {
        if (activeScannerStream) {
            activeScannerStream.getTracks().forEach((t) => t.stop());
            activeScannerStream = null;
        }
        if (scannerInterval) {
            clearInterval(scannerInterval);
            scannerInterval = null;
        }
        if (video) video.srcObject = null;
        modal.classList.add('hidden');
    };

    const handleFoundItem = async (itemIdOrName) => {
        const state = getStoredState();
        const query = String(itemIdOrName).toLowerCase().trim();
        let foundItem = null;
        let foundCategory = null;

        for (const cat of state.inventory || []) {
            for (const itm of cat.items || []) {
                // Include every consolidated unit's serial, not just the primary one.
                const serials = getItemSerials(itm).map((s) => s.toLowerCase());
                const id = (itm.id || '').toLowerCase().trim();
                const name = (itm.name || '').toLowerCase().trim();
                const model = (itm.model || '').toLowerCase().trim();

                if (
                    serials.some((sn) => sn === query) ||
                    id === query ||
                    serials.some((sn) => sn.includes(query)) ||
                    (model && (model === query || model.includes(query))) ||
                    name.includes(query) ||
                    query.includes(id)
                ) {
                    foundItem = itm;
                    foundCategory = cat;
                    break;
                }
            }
            if (foundItem) break;
        }

        // If not found in local memory, query backend API
        if (!foundItem && typeof fetch === 'function') {
            try {
                const apiRes = await fetch(`/api/inventory/lookup?code=${encodeURIComponent(itemIdOrName)}`);
                if (apiRes.ok) {
                    foundItem = await apiRes.json();
                    foundCategory = { name: foundItem.subCategory || 'Warehouse' };
                }
            } catch (e) {}
        }

        if (!foundItem) {
            if (statusMsg) statusMsg.textContent = `No match found for "${itemIdOrName}". Try another code, barcode, or pick from the list below.`;
            return;
        }

        if (statusMsg) statusMsg.textContent = `Scanned: ${foundItem.name}!`;
        if (navigator.vibrate) navigator.vibrate(40);

        if (resultCard) {
            resultCard.classList.remove('hidden');
            const statusClass = (foundItem.status || 'Available').toLowerCase().replace(/\s+/g, '-');
            const conditionClass = (foundItem.condition || 'Good').toLowerCase().replace(/\s+/g, '-');

            const modelBadge = foundItem.model ? `<span class="gear-model-badge">📦 ${foundItem.model}</span>` : '';
            const serialBadge = foundItem.serialNumber ? `<span class="gear-serial-chip">🏷️ SN: ${foundItem.serialNumber}</span>` : '';
            const conditionBadge = `<span class="condition-badge condition-${conditionClass}">${foundItem.condition || 'Good'}</span>`;
            const locationBadge = foundItem.location ? `<span class="location-tag">📍 ${foundItem.location}</span>` : '';

            resultCard.innerHTML = `
                <div class="scanner-result-header">
                    <div>
                        <h4>${foundItem.name}</h4>
                        <small style="color: var(--muted);">${foundCategory?.name || 'Inventory'} • ID: <code>${foundItem.id}</code></small>
                    </div>
                    <span class="inventory-status ${statusClass}">${foundItem.status}</span>
                </div>

                <div class="gear-meta-row" style="margin: 8px 0;">
                    ${modelBadge}
                    ${serialBadge}
                    ${conditionBadge}
                    ${locationBadge}
                </div>

                <p style="margin: 0; font-size: 13px; color: var(--muted);">${foundItem.notes || 'No notes'}</p>
                <div style="font-size: 13px; font-weight: 700; margin-top: 6px;">Stock Available: <span style="color: #7fe0aa;">${foundItem.available} units</span></div>
                <div class="scanner-result-actions">
                    <button type="button" class="scanner-action-btn" data-scan-action="toggle-status">
                        Change Status
                    </button>
                    <button type="button" class="scanner-action-btn" data-scan-action="return-inspect">
                        Inspect / Report Damage
                    </button>
                </div>
            `;

            resultCard.querySelector('[data-scan-action="toggle-status"]')?.addEventListener('click', () => {
                const nextStatus = foundItem.status === 'Available' ? 'Reserved' : foundItem.status === 'Reserved' ? 'Broken' : 'Available';
                foundItem.status = nextStatus;
                saveState(state);
                if (typeof fetch === 'function') {
                    fetch(`/api/inventory/${encodeURIComponent(foundItem.id)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: nextStatus })
                    }).catch(() => {});
                }
                handleFoundItem(foundItem.id);
                if (typeof renderInventoryAlerts === 'function') renderInventoryAlerts(state);
                if (typeof renderStats === 'function') renderStats(state.events, getCurrentUser(), state);
            });

            resultCard.querySelector('[data-scan-action="return-inspect"]')?.addEventListener('click', () => {
                showDamageDetailsModal(foundItem, {}, (damageDetails) => {
                    foundItem.status = 'Broken';
                    foundItem.condition = 'Faulty';
                    foundItem.notes = `[Damage] ${damageDetails.problem || ''} (SN: ${damageDetails.serialNumber || foundItem.serialNumber || 'N/A'})`;
                    saveState(state);
                    if (typeof fetch === 'function') {
                        fetch(`/api/inventory/${encodeURIComponent(foundItem.id)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                status: 'Broken',
                                condition: 'Faulty',
                                notes: foundItem.notes
                            })
                        }).catch(() => {});
                    }
                    handleFoundItem(foundItem.id);
                    alert(`Damage record updated for ${foundItem.name}`);
                });
            });
        }
    };

    const startScanner = async () => {
        populateItemsDropdown();
        if (resultCard) resultCard.classList.add('hidden');
        if (statusMsg) statusMsg.textContent = 'Point camera at equipment QR code or flight case barcode';
        modal.classList.remove('hidden');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (statusMsg) statusMsg.textContent = 'Camera not available. Choose equipment item from the list below.';
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } }
            });
            activeScannerStream = stream;
            if (video) {
                video.srcObject = stream;
                await video.play().catch(() => {});
            }

            if ('BarcodeDetector' in window) {
                try {
                    const detector = new window.BarcodeDetector({
                        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a']
                    });
                    scannerInterval = setInterval(async () => {
                        if (!video || video.readyState < 2) return;
                        try {
                            const barcodes = await detector.detect(video);
                            if (barcodes && barcodes.length > 0) {
                                const rawVal = barcodes[0].rawValue;
                                handleFoundItem(rawVal);
                            }
                        } catch (e) {}
                    }, 400);
                } catch (err) {
                    console.log('[Scanner] BarcodeDetector init:', err);
                }
            }
        } catch (err) {
            if (statusMsg) statusMsg.textContent = 'Camera permission denied. Choose equipment item from the list below.';
        }
    };

    scanButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            startScanner();
        });
    });

    if (closeBtn) closeBtn.onclick = stopScanner;
    modal.onclick = (e) => {
        if (e.target === modal) stopScanner();
    };

    if (manualSearchBtn && manualSelect) {
        manualSearchBtn.addEventListener('click', () => {
            const val = manualSelect.value;
            if (val) handleFoundItem(val);
        });
        manualSelect.addEventListener('change', () => {
            const val = manualSelect.value;
            if (val) handleFoundItem(val);
        });
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'scan') {
        setTimeout(startScanner, 200);
    }
}

// =========================================================
// MOBILE BOTTOM NAVIGATION TABS
// =========================================================
function initMobileBottomNav() {
    const navItems = document.querySelectorAll('.mob-nav-item');
    const currentPage = document.body.dataset.page;

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            const target = item.dataset.mobNav;
            if (target === 'scan') {
                return; // Handled by gear scanner click listener
            }

            if (target === 'dashboard') {
                if (currentPage === 'dashboard') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.location.href = 'dashboard.html';
                }
            } else if (target === 'events') {
                if (currentPage === 'dashboard') {
                    const section = document.getElementById('events-section');
                    if (section) section.scrollIntoView({ behavior: 'smooth' });
                } else {
                    window.location.href = 'dashboard.html#events-section';
                }
            } else if (target === 'inventory') {
                if (currentPage !== 'inventory') {
                    window.location.href = 'inventory.html';
                }
            } else if (target === 'messages') {
                if (currentPage === 'dashboard') {
                    const section = document.getElementById('messages-panel');
                    if (section) section.scrollIntoView({ behavior: 'smooth' });
                } else {
                    window.location.href = 'dashboard.html#messages-panel';
                }
            }
        });
    });
}

function initializePage() {
    const page = document.body.dataset.page;

    if (page === 'login') {
        initLoginPage();
    }

    if (page === 'dashboard') {
        initDashboardPage();
    }

    if (page === 'plan') {
        initPlanPage();
    }

    if (page === 'inventory') {
        initInventoryPage();
    }

    initGearScanner();
    initMobileBottomNav();
    initPwaInstall();
}

document.addEventListener('DOMContentLoaded', async () => {
    await hydrateStateFromServer();
    initializePage();
});

