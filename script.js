/**
 * ═══════════════════════════════════════════════════════════════
 * UNIVERSITY COURSE SCHEDULER - MAIN SCRIPT
 * ═══════════════════════════════════════════════════════════════
 *
 * Data flow:
 * - Default dataset is read from data/courses.txt (portal HTML table)
 *   on EVERY page load (no cache).
 * - data/last-update.txt holds a manually-edited label shown in header.
 * - User can paste a new HTML table ("دیتای دلخواه" modal); it becomes
 *   the active dataset and the default one is disabled (greyed out).
 * - Time conflicts are blocked; >20 units shows a warning (allowed).
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    // Footer configuration - easily editable
    FOOTER_TEXT: 'سیستم پیش‌انتخاب واحد دانشگاهی - در صورت مشاهده باگ به آدرس زیر مراجعه کنید',
    FOOTER_LINK: 'https://AmousaviNezhod.github.io/links',
    FOOTER_LINK_TEXT: 'ساخته شده توسط سید امیرحسین موسوی نژاد',

    // Data sources (read fresh on every page load)
    COURSES_FILE: 'data/courses.txt',
    FALLBACK_COURSES_FILE: 'example.txt',
    LAST_UPDATE_FILE: 'data/last-update.txt',
    PRICES_FILE: 'data/couresPrice.html',

    // LocalStorage keys
    STORAGE_KEY: 'university_scheduler_selected_courses',
    CUSTOM_DATA_KEY: 'university_scheduler_custom_data',
    DEGREE_KEY: 'university_scheduler_degree',
    PRICES_KEY: 'university_scheduler_prices',
    SCHEDULES_KEY: 'university_scheduler_schedules',

    // Schedule settings
    DAYS: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه'],
    HOURS: Array.from({ length: 14 }, (_, i) => i + 7), // 7 to 20

    // Units
    MAX_UNITS: 20,

    // Multi-schedule tabs
    MAX_SCHEDULES: 5,

    // Search settings
    INITIAL_COURSE_COUNT: 10,

    // Course block palette (cycled by course index)
    PALETTE: [
        '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
        '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
        '#84cc16', '#a855f7'
    ],

    // Toast duration
    TOAST_DURATION: 2000,
    TOAST_WARNING_DURATION: 5000 // warnings stay longer — user must read them
};

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const state = {
    defaultCourses: [],     // From data/courses.txt
    customCourses: [],      // From user-pasted HTML table
    customActive: false,    // True when custom dataset is active
    selectedCourses: [],    // Selected course IDs (code-group) of the ACTIVE schedule
    schedules: [],          // [{ id, name, courses: [] }] — one entry per tab
    activeScheduleId: '',   // Currently shown schedule tab
    prices: {},             // Course code -> unit price (from data/couresPrice.html)
    currentModalCourse: null,
    currentHours: CONFIG.HOURS, // Hours currently rendered on grid
    currentTransposed: false, // True while the fit-mode transposed grid is rendered
    unitsWarned: false,     // To avoid repeating the >20 units toast
    degree: '',             // Selected degree level (مقطع); '' = all degrees
    filters: {              // Advanced filters (shared panel + mobile)
        days: new Set(),        // Empty set = all days
        startHour: null,        // Course sessions must start >= this hour
        endHour: null,          // Course sessions must end <= this hour
        exactHour: null,        // Only courses running at this exact hour
        professor: '',          // Selected professor (dropdown)
        units: null,            // Exact unit count, or '3plus' for 3+
        group: '',              // Substring match (e.g. "40")
        hasTime: false,         // Only courses with fixed class time
        onlyAvailable: false,   // Only courses with free capacity
        onlyFull: false,        // Only courses whose capacity is full
        sortAsc: null           // null | 'asc' | 'desc' — sort results by name
    }
};

/** Active dataset (custom overrides default), narrowed by the degree (مقطع) choice */
function getActiveCourses() {
    const all = state.customActive ? state.customCourses : state.defaultCourses;
    return state.degree ? all.filter(c => c.degree === state.degree) : all;
}

/** Courses listed in pickers: only the active dataset (custom fully replaces default) */
function getListCourses() {
    return getActiveCourses();
}

/** Distinct degree levels present in the full (unfiltered) dataset */
function getDegreeOptions() {
    const all = state.customActive ? state.customCourses : state.defaultCourses;
    const set = new Set();
    all.forEach(c => { if (c.degree) set.add(c.degree); });
    return [...set].sort((a, b) => a.localeCompare(b, 'fa'));
}

/**
 * Degree select in the freshness modal: refill options from the dataset and
 * restore the saved choice (kept only if still present in the data).
 */
function populateDegreeSelect() {
    const select = elements.degreeSelect;
    if (!select) return;
    const current = state.degree;
    select.innerHTML = '<option value="">همه مقاطع</option>' +
        getDegreeOptions().map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    select.value = getDegreeOptions().includes(current) ? current : '';
    state.degree = select.value;
    saveDegree(select.value);
}

function saveDegree(degree) {
    try {
        if (degree) localStorage.setItem(CONFIG.DEGREE_KEY, degree);
        else localStorage.removeItem(CONFIG.DEGREE_KEY);
    } catch (error) {
        console.error('Error saving degree:', error);
    }
}

function loadSavedDegree() {
    try {
        return localStorage.getItem(CONFIG.DEGREE_KEY) || '';
    } catch (error) {
        return '';
    }
}

/** Is a course selectable? Capacity-full courses are locked (unless already selected) */
function isSelectable(course) {
    if (!isCapacityAvailable(course)) return false;
    return state.customActive
        ? state.customCourses.some(c => getCourseId(c) === getCourseId(course))
        : true;
}

/** True when the course still has free seats (or capacity is unknown/0-capped custom rows) */
function isCapacityAvailable(course) {
    if (!course) return true;
    // capacity 0 = ظرفیت نامشخص (e.g. کاراموزی/پروژه) — treat as available
    if (course.capacity === 0) return true;
    return course.registered < course.capacity;
}

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════

const elements = {
    // Header / last update
    dataUpdate: document.getElementById('dataUpdate'),
    lastUpdateValue: document.getElementById('lastUpdateValue'),

    // Custom-data active banner
    customDataBanner: document.getElementById('customDataBanner'),

    // Mobile search
    searchSection: document.getElementById('searchSection'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchResults: document.getElementById('searchResults'),
    resultsCount: document.getElementById('resultsCount'),
    resultsList: document.getElementById('resultsList'),

    // Desktop panel
    panelSearch: document.getElementById('panelSearch'),
    panelSearchClear: document.getElementById('panelSearchClear'),
    panelList: document.getElementById('panelList'),
    panelCount: document.getElementById('panelCount'),

    // Summary
    selectedCount: document.getElementById('selectedCount'),
    totalUnits: document.getElementById('totalUnits'),
    limitUnits: document.getElementById('limitUnits'),

    // Units warning flag
    unitsFlag: document.getElementById('unitsFlag'),
    unitsFlagText: document.getElementById('unitsFlagText'),

    // Cost (هزینه) summary + modal
    costSummaryItem: document.getElementById('costSummaryItem'),
    totalCost: document.getElementById('totalCost'),
    btnCost: document.getElementById('btnCost'),
    btnCostM: document.getElementById('btnCostM'),
    costModal: document.getElementById('costModal'),
    costModalBody: document.getElementById('costModalBody'),
    costScriptBox: document.getElementById('costScriptBox'),
    btnCopyCostScript: document.getElementById('btnCopyCostScript'),
    closeCostModal: document.getElementById('closeCostModal'),
    btnCloseCostModal: document.getElementById('btnCloseCostModal'),

    // Controls
    btnViewList: document.getElementById('btnViewList'),
    btnCopyTable: document.getElementById('btnCopyTable'),
    btnExportPDF: document.getElementById('btnExportPDF'),
    btnCustomData: document.getElementById('btnCustomData'),
    btnShareLink: document.getElementById('btnShareLink'),
    btnReset: document.getElementById('btnReset'),
    btnFitTable: document.getElementById('btnFitTable'),
    btnBannerRestoreDefault: document.getElementById('btnBannerRestoreDefault'),
    btnIo: document.getElementById('btnIo'),
    btnIoM: document.getElementById('btnIoM'),

    // Mobile bottom action bar (phone-only mirror of the controls above)
    btnViewListM: document.getElementById('btnViewListM'),
    btnCopyTableM: document.getElementById('btnCopyTableM'),
    btnExportPDFM: document.getElementById('btnExportPDFM'),
    btnCustomDataM: document.getElementById('btnCustomDataM'),
    btnShareLinkM: document.getElementById('btnShareLinkM'),
    btnResetM: document.getElementById('btnResetM'),

    // Schedule
    scheduleBody: document.getElementById('scheduleBody'),
    scheduleTable: document.getElementById('scheduleTable'),
    scheduleContainer: document.getElementById('scheduleContainer'),
    scheduleTabs: document.getElementById('scheduleTabs'),

    // Theme
    themeToggle: document.getElementById('themeToggle'),

    // Footer
    footerText: document.getElementById('footerText'),
    footerLink: document.getElementById('footerLink'),

    // Course info modal
    courseModal: document.getElementById('courseModal'),
    courseModalBody: document.getElementById('courseModalBody'),
    closeCourseModal: document.getElementById('closeCourseModal'),
    btnCloseCourseModal: document.getElementById('btnCloseCourseModal'),
    btnRemoveCourse: document.getElementById('btnRemoveCourse'),

    // List modal
    listModal: document.getElementById('listModal'),
    selectedList: document.getElementById('selectedList'),
    closeListModal: document.getElementById('closeListModal'),
    btnCloseListModal: document.getElementById('btnCloseListModal'),

    // Custom data modal
    customDataModal: document.getElementById('customDataModal'),
    customDataInput: document.getElementById('customDataInput'),
    customDataStatus: document.getElementById('customDataStatus'),
    closeCustomDataModal: document.getElementById('closeCustomDataModal'),
    btnLoadCustomData: document.getElementById('btnLoadCustomData'),
    btnRestoreDefault: document.getElementById('btnRestoreDefault'),
    tabDataImport: document.getElementById('tabDataImport'),
    tabDataGuide: document.getElementById('tabDataGuide'),
    paneDataImport: document.getElementById('paneDataImport'),
    paneDataGuide: document.getElementById('paneDataGuide'),
    btnGuideVideo: document.getElementById('btnGuideVideo'),
    guideVideoWrap: document.getElementById('guideVideoWrap'),
    guideVideoFrame: document.getElementById('guideVideoFrame'),

    // Advanced filters (rendered into mobile bar + desktop drawer)
    filterBarMobile: document.getElementById('filterBarMobile'),
    filterDrawerBar: document.getElementById('filterDrawerBar'),

    // Mobile search modal
    searchTrigger: document.getElementById('searchTrigger'),
    searchModal: document.getElementById('searchModal'),
    searchModalClose: document.getElementById('searchModalClose'),

    // Desktop filter drawer
    panelFilterToggle: document.getElementById('panelFilterToggle'),
    panelFilterBadge: document.getElementById('panelFilterBadge'),
    filterDrawer: document.getElementById('filterDrawer'),
    filterDrawerClose: document.getElementById('filterDrawerClose'),

    // Conflict modal
    conflictModal: document.getElementById('conflictModal'),
    conflictMessage: document.getElementById('conflictMessage'),
    closeConflictModal: document.getElementById('closeConflictModal'),
    btnCloseConflictModal: document.getElementById('btnCloseConflictModal'),

    // Data-freshness notice (page-load modal)
    freshnessModal: document.getElementById('freshnessModal'),
    closeFreshnessModal: document.getElementById('closeFreshnessModal'),
    btnCloseFreshness: document.getElementById('btnCloseFreshness'),
    btnOpenCustomDataFreshness: document.getElementById('btnOpenCustomDataFreshness'),
    freshnessLastUpdate: document.getElementById('freshnessLastUpdate'),
    degreeSelect: document.getElementById('degreeSelect'),

    // Import/Export modal (ورود و خروجی برنامه)
    ioModal: document.getElementById('ioModal'),
    closeIoModal: document.getElementById('closeIoModal'),
    tabIoExport: document.getElementById('tabIoExport'),
    tabIoImport: document.getElementById('tabIoImport'),
    paneIoExport: document.getElementById('paneIoExport'),
    paneIoImport: document.getElementById('paneIoImport'),
    ioExportBox: document.getElementById('ioExportBox'),
    btnIoCopy: document.getElementById('btnIoCopy'),
    btnIoDownload: document.getElementById('btnIoDownload'),
    ioFileInput: document.getElementById('ioFileInput'),
    ioPasteBox: document.getElementById('ioPasteBox'),
    btnIoValidate: document.getElementById('btnIoValidate'),
    ioPreview: document.getElementById('ioPreview'),
    ioImportFooter: document.getElementById('ioImportFooter'),
    ioModeRow: document.getElementById('ioModeRow'),
    ioModeAdd: document.getElementById('ioModeAdd'),
    ioModeReplace: document.getElementById('ioModeReplace'),
    btnIoApply: document.getElementById('btnIoApply'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Parse "10:30" -> 10.5 */
function parseTime(timeStr) {
    const [hours, minutes = 0] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
}

/** Minutes since midnight -> "HH:MM" */
function minutesToTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Check if two time ranges overlap */
function hasTimeOverlap(start1, end1, start2, end2) {
    const s1 = parseTime(start1), e1 = parseTime(end1);
    const s2 = parseTime(start2), e2 = parseTime(end2);
    return s1 < e2 && s2 < e1;
}

/**
 * Two overlapping sessions conflict only when they occupy the SAME week
 * parity. A weekly session occupies both parities; a biweekly one occupies
 * just its own (زوج/فرد) — so "مباحث ویژه (زوج)" and "چندرسانه‌ای (فرد)"
 * can share شنبه 14-16 without clashing.
 */
function slotsConflict(slot1, slot2) {
    if (slot1.day !== slot2.day) return false;
    if (!hasTimeOverlap(slot1.start, slot1.end, slot2.start, slot2.end)) return false;
    const p1 = slot1.cadence === 'biweekly' ? (slot1.parity || 'both') : 'both';
    const p2 = slot2.cadence === 'biweekly' ? (slot2.parity || 'both') : 'both';
    // 'both' overlaps everything; even+odd never meet
    if (p1 === 'both' || p2 === 'both') return true;
    return p1 === p2;
}

/** Check if two courses have schedule conflicts */
function checkConflict(course1, course2) {
    for (const slot1 of course1.schedule) {
        for (const slot2 of course2.schedule) {
            if (slotsConflict(slot1, slot2)) {
                return {
                    hasConflict: true,
                    day: slot1.day,
                    time1: `${slot1.start}-${slot1.end}`,
                    time2: `${slot2.start}-${slot2.end}`
                };
            }
        }
    }
    return { hasConflict: false };
}

/** Persian label for a slot's week parity (زوج/فرد) — null when none */
function slotParityLabel(slot) {
    if (!slot || slot.cadence !== 'biweekly') return null;
    if (slot.parity === 'even') return 'زوج';
    if (slot.parity === 'odd') return 'فرد';
    return null;
}

/** Unique course ID: code-group */
function getCourseId(course) {
    return `${course.code}-${course.group}`;
}

function findCourseById(courseId) {
    return getActiveCourses().find(c => getCourseId(c) === courseId);
}

function findInListCourses(courseId) {
    return getListCourses().find(c => getCourseId(c) === courseId);
}

/** Format number with Persian digits */
function toPersianNumber(num) {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/\d/g, d => persianDigits[parseInt(d)]);
}

/** Convert "10:30" to Persian digits (keeps the colon) */
function toPersianTime(timeStr) {
    return toPersianNumber(timeStr);
}

/** Units may arrive as "2.00" -> display ۲ (or ۲٫۵ for fractions) */
function formatUnits(units) {
    return toPersianNumber(Number.isInteger(units) ? units : units.toFixed(1).replace('.', '٫'));
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING & PARSING (portal HTML table format)
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize Persian day names to CONFIG.DAYS spelling
 */
function normalizeDay(raw) {
    const day = raw.replace(/[\s\u200c]+/g, '‌'); // spaces + ZWNJ -> ZWNJ
    if (day.includes('یک')) return 'یکشنبه';
    if (day.includes('چهار')) return 'چهارشنبه';
    if (day.includes('پنج')) return 'پنجشنبه';
    if (day.includes('سه')) return 'سه‌شنبه';
    if (day.includes('دو')) return 'دوشنبه';
    return 'شنبه';
}

/**
 * Parse a single session chunk like:
 *   "شنبه ساعت 12(هر هفته به مدت 180 دقیقه در کلاس 0)"
 *   "دو شنبه ساعت 8 تا 10" / "یکشنبه ساعت 8-10" / "سه‌شنبه ساعت 10:30 به مدت 90 دقیقه"
 * Returns null when day/start/end cannot be determined (e.g. مدت 0)
 */
function parseSessionChunk(chunk) {
    if (!chunk) return null;

    const dayMatch = chunk.match(/(?:سه|یک|چهار|پنج|دو)?\s*[‌\s]?\s*شنبه|جمعه/);
    if (!dayMatch) return null;

    const rangeMatch = chunk.match(/ساعت\s*(\d{1,2})(?::(\d{2}))?\s*(?:[-–—]|تا)\s*(\d{1,2})(?::(\d{2}))?/);
    const startMatch = chunk.match(/ساعت\s*(\d{1,2})(?::(\d{2}))?/);
    const durMatch = chunk.match(/به\s*مدت\s*(\d+)\s*دقیقه/);

    let startMin = null, endMin = null;

    if (rangeMatch) {
        startMin = parseInt(rangeMatch[1], 10) * 60 + parseInt(rangeMatch[2] || 0, 10);
        endMin = parseInt(rangeMatch[3], 10) * 60 + parseInt(rangeMatch[4] || 0, 10);
    } else if (startMatch) {
        startMin = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2] || 0, 10);
        if (durMatch) endMin = startMin + parseInt(durMatch[1], 10);
    }

    if (startMin == null || endMin == null || endMin <= startMin) return null;

    // Portal marks biweekly sessions inside the chunk:
    //   "(هفته در میان به مدت 120 دقیقه در کلاس 0) شروع زوج" — even weeks
    //   "(هفته در میان به مدت 120 دقیقه در کلاس 0) شروع فرد" — odd weeks
    const cadence = /هفته\s*در\s*میان/.test(chunk) ? 'biweekly' : 'weekly';
    const parity = /شروع\s*زوج\s*و\s*فرد/.test(chunk) ? 'both'
        : /شروع\s*زوج/.test(chunk) ? 'even'
        : /شروع\s*فرد/.test(chunk) ? 'odd' : null;

    return { day: normalizeDay(dayMatch[0]), start: minutesToTime(startMin), end: minutesToTime(endMin), cadence, parity };
}

/**
 * Extract weekly sessions from the info tooltip.
 * Portal format (one per session):
 *   "<b>جلسه اول روز:</b> شنبه ساعت 12(هر هفته به مدت 180 دقیقه در کلاس 0)"
 * Handles جلسه اول / دوم / سوم ... individually.
 * "ساعت 6 (به مدت 0 دقیقه)" => no fixed class time (project/internship)
 * Biweekly sessions carry "هفته در میان" + "شروع زوج/فرد" — kept on the slot
 * as cadence/parity so two opposite-parity courses may share the same hour.
 */
function parseScheduleFromInfo(title) {
    if (!title) return [];
    const slots = [];

    const sessionRe = /جلسه\s*[^:<]*روز\s*:?\s*<\/b>\s*([^<]+)/g;
    let m;
    while ((m = sessionRe.exec(title)) !== null) {
        const slot = parseSessionChunk(m[1]);
        if (slot) slots.push(slot);
    }

    // Fallback for plain-text formats without <b> markers
    if (!slots.length) {
        const slot = parseSessionChunk(title);
        if (slot) slots.push(slot);
    }

    return slots;
}

/**
 * Extract weekly sessions from the course-detail tooltip of a row.
 * Rows with co-professors (اساتید همکار) carry a second img[title] tooltip
 * without any جلسه info; prefer the one that actually parses.
 */
function getCourseSchedule(row) {
    const titles = Array.from(row.querySelectorAll('img[title]'))
        .map(img => img.getAttribute('title'));
    for (const title of titles) {
        const slots = parseScheduleFromInfo(title);
        if (slots.length) return slots;
    }
    // Fall back to the detail tooltip (course with no fixed class time)
    for (const title of titles) {
        if (title && title.includes('coursedetail')) return parseScheduleFromInfo(title);
    }
    return [];
}

/** Extract the degree level (مقطع) from the course-detail tooltip, e.g. "كارشناسي" */
function getCourseDegree(row) {
    for (const img of row.querySelectorAll('img[title]')) {
        const title = img.getAttribute('title') || '';
        if (!title.includes('مقطع')) continue;
        const m = title.match(/مقطع:?\s*(?:<\/b>)?\s*([^<&]+?)(?:<br|$)/);
        if (m) return m[1].replace(/&lt;br&gt;.*$/, '').trim();
    }
    return '';
}

/**
 * Parse the portal HTML table (see example.txt) into course objects
 */
function parseTableData(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('tr');
    const courses = [];
    const seen = new Set();

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        const code = cells[1].textContent.trim();
        const group = cells[2].textContent.trim();
        const name = cells[3].textContent.trim();
        if (!code || !name) return;

        const units = parseFloat(cells[4].textContent.trim().replace(/[^\d.]/g, '')) || 0;

        // Professor cell may embed a co-professor tooltip <img>/<font> (اساتید همکار);
        // strip them so the name stays clean
        let professor = '';
        if (cells[8]) {
            const profClone = cells[8].cloneNode(true);
            profClone.querySelectorAll('img, font').forEach(el => el.remove());
            professor = profClone.textContent.replace(/\u00a0/g, ' ').trim();
        }
        professor = professor.replace(/^-\s*/, '').trim() || 'نامعلوم';

        const capacity = cells[6] ? parseInt(cells[6].textContent.trim(), 10) || 0 : 0;
        const registered = cells[5] ? parseInt(cells[5].textContent.trim(), 10) || 0 : 0;

        // Pick the course-detail tooltip, not the co-professor one (first img[title]
        // in the row may be the "اساتید همکار" tooltip inside the professor cell)
        const schedule = getCourseSchedule(row);
        const degree = getCourseDegree(row);

        const id = `${code}-${group}`;
        if (seen.has(id)) return;
        seen.add(id);

        courses.push({
            code,
            group,
            name,
            units,
            professor,
            capacity,
            registered,
            schedule,
            degree,
            color: CONFIG.PALETTE[courses.length % CONFIG.PALETTE.length]
        });
    });

    return courses;
}

/** Detect format and parse accordingly (HTML table expected) */
function parseCourses(text) {
    if (/<\s*tr[\s>]/i.test(text) || /<\s*table/i.test(text)) {
        return parseTableData(text);
    }
    return [];
}

/** Load default courses from file - fresh on every page request */
async function loadCourses() {
    const candidates = [CONFIG.COURSES_FILE, CONFIG.FALLBACK_COURSES_FILE];
    for (const url of candidates) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) continue;
            const text = await response.text();
            const courses = parseCourses(text);
            if (courses.length > 0) {
                state.defaultCourses = courses;
                console.log(`Loaded ${courses.length} courses from ${url}`);
                return;
            }
        } catch (error) {
            console.warn(`Could not load ${url}:`, error);
        }
    }
    state.defaultCourses = [];
    showToast('خطا در بارگذاری فایل دیتا. صفحه را از طریق وب‌سرور باز کنید (نه file://)', 'error');
}

/** Load the manually-maintained "last update" label */
async function loadLastUpdate() {
    try {
        const response = await fetch(CONFIG.LAST_UPDATE_FILE, { cache: 'no-store' });
        if (!response.ok) throw new Error('http ' + response.status);
        const text = (await response.text()).trim();
        if (text) {
            elements.lastUpdateValue.textContent = toPersianNumber(text);
            return;
        }
    } catch (error) {
        console.warn('Could not load last-update file:', error);
    }
    elements.lastUpdateValue.textContent = '—';
}

// ═══════════════════════════════════════════════════════════════
// ADVANCED FILTERS UI
// ═══════════════════════════════════════════════════════════════

const FILTER_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/** List of distinct professors in the active dataset (for the dropdown) */
function getProfessorOptions() {
    const names = new Set();
    getListCourses().forEach(c => {
        if (c.professor && c.professor !== 'نامعلوم') names.add(c.professor);
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'fa'));
}

/** Shared fields (used by both mobile bar and desktop drawer) */
function buildFilterFieldsHtml() {
    const hourOpts = FILTER_HOURS.map(h =>
        `<option value="${h}">${toPersianNumber(h)}:۰۰</option>`
    ).join('');

    const unitOpts = [1, 2, 3, 4].map(u =>
        `<option value="${u}">${toPersianNumber(u)}</option>`
    ).join('');

    return `
        <div class="filter-detail-grid">
            <label class="filter-field">
                <span>مقطع</span>
                <select data-filter="degree"><option value="">همه مقاطع</option>
                    ${getDegreeOptions().map(d =>
                        `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
                </select>
            </label>
            <label class="filter-field">
                <span>از ساعت</span>
                <select data-filter="startHour"><option value="">—</option>${hourOpts}</select>
            </label>
            <label class="filter-field">
                <span>تا ساعت</span>
                <select data-filter="endHour"><option value="">—</option>${hourOpts}</select>
            </label>
            <label class="filter-field">
                <span>ساعت مشخص</span>
                <select data-filter="exactHour"><option value="">—</option>${hourOpts}</select>
            </label>
            <label class="filter-field">
                <span>استاد</span>
                <select data-filter="professor"><option value="">همه</option>
                    ${getProfessorOptions().map(p =>
                        `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
                </select>
            </label>
            <label class="filter-field">
                <span>گروه</span>
                <input type="text" data-filter="group" placeholder="مثلاً ۴۰">
            </label>
            <label class="filter-field filter-field-wide">
                <span>واحد</span>
                <select data-filter="unitsMin">
                    <option value="">همه</option>
                    ${unitOpts}
                    <option value="3plus">۳ به بالا</option>
                </select>
            </label>
        </div>
    `;
}

/**
 * Build the filter bar markup (identical for panel + mobile).
 * Structure: toggle row (chips for days / time / professor / units / group /
 * availability) + collapsible detail area for time/professor/units inputs.
 */
function buildFilterBarHtml() {
    const dayChips = CONFIG.DAYS.map(d =>
        `<button type="button" class="filter-chip" data-filter="day" data-value="${d}">${d}</button>`
    ).join('');

    return `
        <div class="filter-row filter-row-main">
            <button type="button" class="filter-chip filter-toggle" data-filter="toggle" title="فیلترهای پیشرفته">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                فیلتر
                <span class="filter-badge hidden" data-role="badge">۰</span>
            </button>
            ${dayChips}
            <button type="button" class="filter-chip" data-filter="onlyAvailable">ظرفیت آزاد</button>
            <button type="button" class="filter-chip" data-filter="onlyFull">ظرفیت پر</button>
            <button type="button" class="filter-chip" data-filter="sort" title="مرتب‌سازی بر اساس نام درس">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h13M3 12h9M3 18h5"></path>
                </svg>
                <span data-role="sort-label">مرتب‌سازی</span>
            </button>
            <button type="button" class="filter-chip filter-clear hidden" data-filter="clear">حذف فیلترها ✕</button>
        </div>

        <div class="filter-details hidden" data-role="details">
            ${buildFilterFieldsHtml()}
        </div>
    `;
}

/** Reflect state.filters onto the bar's chips/inputs */
function syncFilterBar(bar) {
    if (!bar) return;
    const f = state.filters;

    bar.querySelectorAll('[data-filter="day"]').forEach(btn => {
        btn.classList.toggle('active', f.days.has(btn.dataset.value));
    });
    bar.querySelector('[data-filter="hasTime"]')?.classList.toggle('active', f.hasTime);
    bar.querySelector('[data-filter="onlyAvailable"]')?.classList.toggle('active', f.onlyAvailable);
    bar.querySelector('[data-filter="onlyFull"]')?.classList.toggle('active', f.onlyFull);

    // Sort chip cycles: none → asc → desc → none
    const sortBtn = bar.querySelector('[data-filter="sort"]');
    if (sortBtn) {
        sortBtn.classList.toggle('active', f.sortAsc != null);
        const label = sortBtn.querySelector('[data-role="sort-label"]');
        if (label) {
            label.textContent = f.sortAsc === 'asc' ? 'صعودی' : f.sortAsc === 'desc' ? 'نزولی' : 'مرتب‌سازی';
        }
        sortBtn.dataset.sortState = f.sortAsc || '';
    }

    const n = countActiveFilters();
    const badge = bar.querySelector('[data-role="badge"]');
    if (badge) {
        badge.textContent = toPersianNumber(n);
        badge.classList.toggle('hidden', n === 0);
    }

    bar.querySelector('[data-filter="clear"]')?.classList.toggle('hidden', n === 0);

    const setVal = (sel, val) => {
        const el = bar.querySelector(sel);
        if (el) el.value = val == null ? '' : String(val);
    };
    setVal('[data-filter="startHour"]', f.startHour);
    setVal('[data-filter="endHour"]', f.endHour);
    setVal('[data-filter="exactHour"]', f.exactHour);
    setVal('[data-filter="unitsMin"]', f.units);
    // Degree is a global (state.degree), not part of state.filters
    const deg = bar.querySelector('[data-filter="degree"]');
    if (deg && document.activeElement !== deg) deg.value = state.degree;
    const prof = bar.querySelector('[data-filter="professor"]');
    if (prof && document.activeElement !== prof) prof.value = f.professor;
    const grp = bar.querySelector('[data-filter="group"]');
    if (grp && document.activeElement !== grp) grp.value = f.group;
}

function syncFilterBars() {
    syncFilterBar(elements.filterBarMobile);
    syncFilterBar(elements.filterDrawerBar);

    // Header badge on the panel filter button
    if (elements.panelFilterBadge) {
        const n = countActiveFilters();
        elements.panelFilterBadge.textContent = toPersianNumber(n);
        elements.panelFilterBadge.classList.toggle('hidden', n === 0);
    }
}

/** Drawer variant of the filter UI: details always expanded, no toggle chip */
function buildFilterDrawerHtml() {
    const dayChips = CONFIG.DAYS.map(d =>
        `<button type="button" class="filter-chip" data-filter="day" data-value="${d}">${d}</button>`
    ).join('');

    return `
        <div class="filter-row filter-row-main">
            ${dayChips}
        </div>
        <div class="filter-row">
            <button type="button" class="filter-chip" data-filter="onlyAvailable">ظرفیت آزاد</button>
            <button type="button" class="filter-chip" data-filter="onlyFull">ظرفیت پر</button>
            <button type="button" class="filter-chip" data-filter="sort" title="مرتب‌سازی بر اساس نام درس">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h13M3 12h9M3 18h5"></path>
                </svg>
                <span data-role="sort-label">مرتب‌سازی</span>
            </button>
            <button type="button" class="filter-chip filter-clear hidden" data-filter="clear">حذف فیلترها ✕</button>
        </div>
        <div class="filter-details" data-role="details">
            ${buildFilterFieldsHtml()}
        </div>
    `;
}

/** Rebuild both filter bars (used on init and when the dataset changes) */
function rebuildFilterBars() {
    elements.filterBarMobile.innerHTML = buildFilterBarHtml();
    elements.filterDrawerBar.innerHTML = buildFilterDrawerHtml();
    bindFilterBar(elements.filterBarMobile);
    bindFilterBar(elements.filterDrawerBar);
    syncFilterBars();
}

/** Open/close the desktop filter drawer (inline grid column, pushes schedule) */
function setFilterDrawerOpen(open) {    elements.filterDrawer.classList.toggle('open', open);
    document.querySelector('.workspace').classList.toggle('drawer-open', open);
    elements.filterDrawer.setAttribute('aria-hidden', String(!open));
    elements.panelFilterToggle.classList.toggle('active', open);
}

function isFilterDrawerOpen() {
    return elements.filterDrawer.classList.contains('open');
}

/** Wire events on a filter bar container (called once per bar) */
function bindFilterBar(bar) {
    if (!bar) return;

    bar.addEventListener('click', e => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        const kind = btn.dataset.filter;

        if (kind === 'toggle') {
            bar.querySelector('[data-role="details"]').classList.toggle('hidden');
            btn.classList.toggle('open');
            return;
        }

        if (kind === 'clear') {
            state.filters = {
                days: new Set(), startHour: null, endHour: null,
                exactHour: null, professor: '', units: null,
                group: '', hasTime: false, onlyAvailable: false, onlyFull: false, sortAsc: null
            };
            syncFilterBars();
            refreshLists();
            return;
        }

        if (kind === 'day') {
            const d = btn.dataset.value;
            state.filters.days.has(d) ? state.filters.days.delete(d) : state.filters.days.add(d);
        } else if (kind === 'hasTime') {
            state.filters.hasTime = !state.filters.hasTime;
        } else if (kind === 'onlyAvailable') {
            state.filters.onlyAvailable = !state.filters.onlyAvailable;
            // ظرفیت آزاد / ظرفیت پر are mutually exclusive
            if (state.filters.onlyAvailable) state.filters.onlyFull = false;
        } else if (kind === 'onlyFull') {
            state.filters.onlyFull = !state.filters.onlyFull;
            if (state.filters.onlyFull) state.filters.onlyAvailable = false;
        } else if (kind === 'sort') {
            // Cycle: none → asc → desc → none
            state.filters.sortAsc = state.filters.sortAsc === 'asc'
                ? 'desc' : state.filters.sortAsc === 'desc' ? null : 'asc';
        }

        syncFilterBars();
        refreshLists();
    });

    bar.addEventListener('change', e => {
        const el = e.target.closest('[data-filter]');
        if (!el) return;
        const kind = el.dataset.filter;
        const raw = el.value.trim();
        const num = raw === '' ? null : parseInt(raw, 10);

        if (kind === 'startHour') {
            state.filters.startHour = num;
            // Range and exact-hour filters are mutually exclusive
            if (num != null) {
                state.filters.exactHour = null;
                syncFilterBars();
            }
        }
        else if (kind === 'endHour') {
            state.filters.endHour = num;
            if (num != null) {
                state.filters.exactHour = null;
                syncFilterBars();
            }
        }
        else if (kind === 'exactHour') {
            state.filters.exactHour = num;
            if (num != null) {
                state.filters.startHour = null;
                state.filters.endHour = null;
                syncFilterBars();
            }
        }
        else if (kind === 'unitsMin') {
            // "3plus" = 3 units or more, otherwise an exact count
            state.filters.units = raw === '3plus' ? '3plus' : num;
        }
        else if (kind === 'degree') {
            // Same data source as the freshness-modal select — keep both in sync
            state.degree = raw;
            saveDegree(state.degree);
            elements.degreeSelect.value = state.degree;
            rebuildFilterBars(); // professor dropdown + degree options follow
        }

        syncFilterBars();
        refreshLists();
    });

    bar.addEventListener('input', e => {
        const el = e.target.closest('[data-filter]');
        if (!el) return;
        const kind = el.dataset.filter;

        if (kind === 'professor') {
            // Professor is a <select> now — fires on change, not input
            state.filters.professor = el.value;
            syncFilterBars();
        } else if (kind === 'group') state.filters.group = el.value;
        else return;

        // Mirror text into the sibling bars without re-rendering this one
        const siblings = [elements.filterBarMobile, elements.filterDrawerBar]
            .filter(b => b && b !== bar);
        for (const other of siblings) {
            const twin = other.querySelector(`[data-filter="${kind}"]`);
            if (twin && document.activeElement !== twin) twin.value = el.value;
        }
        refreshLists();
    });
}

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════

function saveToStorage() {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.selectedCourses));
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            const ids = JSON.parse(saved);
            // Keep only IDs that exist in the active dataset
            state.selectedCourses = ids.filter(id => findCourseById(id));
        }
    } catch (error) {
        console.error('Error loading from storage:', error);
    }
}

function saveCustomData(text) {
    try {
        localStorage.setItem(CONFIG.CUSTOM_DATA_KEY, text);
    } catch (error) {
        console.error('Error saving custom data:', error);
    }
}

function loadCustomData() {
    try {
        return localStorage.getItem(CONFIG.CUSTOM_DATA_KEY);
    } catch (error) {
        return null;
    }
}

function clearCustomData() {
    try {
        localStorage.removeItem(CONFIG.CUSTOM_DATA_KEY);
    } catch (error) { /* noop */ }
}

/** Keep only selections that exist in a given course list */
function pruneSelections(courses) {
    const valid = new Set(courses.map(getCourseId));
    state.selectedCourses = state.selectedCourses.filter(id => valid.has(id));
    saveSchedules();
}

// ═══════════════════════════════════════════════════════════════
// MULTI-SCHEDULE TABS (حالت برنامه چندتایی)
// state.selectedCourses always mirrors the ACTIVE tab; the full tab
// list lives in state.schedules and persists to SCHEDULES_KEY.
// The active tab is also mirrored to STORAGE_KEY so old features
// (share links, combo.js) keep working unchanged.
// ═══════════════════════════════════════════════════════════════

/** Load schedule tabs; first run seeds one tab from the old single-selection key */
function loadSchedules() {
    try {
        const saved = localStorage.getItem(CONFIG.SCHEDULES_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
                state.schedules = parsed.tabs.filter(t => t && typeof t.id === 'string');
                state.activeScheduleId = state.schedules.some(t => t.id === parsed.activeId)
                    ? parsed.activeId
                    : state.schedules[0].id;
                state.selectedCourses = [...(getActiveSchedule()?.courses || [])];
                return;
            }
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
    }
    // First run (or corrupt data): migrate the legacy selection into tab 1
    let legacy = [];
    try {
        legacy = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '[]');
        if (!Array.isArray(legacy)) legacy = [];
    } catch (e) { legacy = []; }
    state.schedules = [{ id: 'tab1', name: 'برنامه ۱', courses: legacy }];
    state.activeScheduleId = 'tab1';
    state.selectedCourses = [...legacy];
}

/** Persist the tab list; the active tab's courses are also mirrored to
 *  STORAGE_KEY (share-link restore + combo.js write there) */
function saveSchedules() {
    const tab = getActiveSchedule();
    if (tab) tab.courses = [...state.selectedCourses];
    try {
        localStorage.setItem(CONFIG.SCHEDULES_KEY, JSON.stringify({
            tabs: state.schedules,
            activeId: state.activeScheduleId
        }));
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.selectedCourses));
    } catch (error) {
        console.error('Error saving schedules:', error);
    }
}

function getActiveSchedule() {
    return state.schedules.find(t => t.id === state.activeScheduleId) || null;
}

/** Sync every tab's courses from its stored copy EXCEPT the active one */
function syncSchedulesFromState() {
    const tab = getActiveSchedule();
    if (tab) tab.courses = [...state.selectedCourses];
}

/** Create a new empty schedule tab (up to CONFIG.MAX_SCHEDULES) */
function createSchedule() {
    if (state.schedules.length >= CONFIG.MAX_SCHEDULES) {
        showToast(`حداکثر ${toPersianNumber(CONFIG.MAX_SCHEDULES)} برنامه می‌توان داشته باشید`, 'warning');
        return;
    }
    // unique id
    let id = 'tab' + Date.now();
    while (state.schedules.some(t => t.id === id)) id = 'tab' + Date.now() + Math.floor(Math.random() * 100);
    const name = `برنامه ${toPersianNumber(state.schedules.length + 1)}`;
    state.schedules.push({ id, name, courses: [] });
    switchSchedule(id);
    showToast(`"${name}" ساخته شد`, 'success');
}

/** Switch the active tab: stash current selection, load the target's */
function switchSchedule(id) {
    if (id === state.activeScheduleId) return;
    const target = state.schedules.find(t => t.id === id);
    if (!target) return;

    // stash the outgoing selection, then swap
    syncSchedulesFromState();
    state.activeScheduleId = id;
    state.selectedCourses = [...target.courses];
    state.unitsWarned = false;
    saveSchedules();

    // same cascade as add/remove course
    updateSummary();
    refreshLists();
    renderSchedule();
    renderScheduleTabs();
}

/** Delete a tab; never the last one; switch to the first remaining when needed */
function deleteSchedule(id) {
    if (state.schedules.length <= 1) {
        showToast('حداقل یک برنامه باید باقی بماند', 'warning');
        return;
    }
    const tab = state.schedules.find(t => t.id === id);
    if (!tab) return;
    const count = tab.courses.length;
    if (!confirm(`برنامه "${tab.name}" با ${toPersianNumber(count)} درس حذف شود؟`)) return;

    state.schedules = state.schedules.filter(t => t.id !== id);
    if (id === state.activeScheduleId) {
        // switch to the first remaining tab without the confirm dance
        const next = state.schedules[0];
        state.activeScheduleId = next.id;
        state.selectedCourses = [...next.courses];
        state.unitsWarned = false;
        updateSummary();
        refreshLists();
        renderSchedule();
    }
    saveSchedules();
    renderScheduleTabs();
    showToast(`"${tab.name}" حذف شد`, 'info');
}

/** Rename a tab via prompt */
function renameSchedule(id) {
    const tab = state.schedules.find(t => t.id === id);
    if (!tab) return;
    const name = prompt('نام برنامه:', tab.name);
    if (name === null) return; // cancelled
    const trimmed = name.trim();
    if (!trimmed || trimmed === tab.name) return;
    tab.name = trimmed.slice(0, 40);
    saveSchedules();
    renderScheduleTabs();
}

/** Render the tab chips above the schedule table */
function renderScheduleTabs() {
    const host = elements.scheduleTabs;
    if (!host) return;
    host.innerHTML = '';

    state.schedules.forEach(tab => {
        const chip = document.createElement('div');
        chip.className = 'schedule-tab' + (tab.id === state.activeScheduleId ? ' active' : '');
        chip.title = 'دابل‌کلیک: تغییر نام';

        const label = document.createElement('span');
        label.className = 'schedule-tab-name';
        label.textContent = tab.name;

        const count = document.createElement('span');
        count.className = 'schedule-tab-count';
        count.textContent = toPersianNumber(tab.id === state.activeScheduleId
            ? state.selectedCourses.length
            : tab.courses.length);

        const del = document.createElement('button');
        del.className = 'schedule-tab-delete';
        del.type = 'button';
        del.innerHTML = '&times;';
        del.setAttribute('aria-label', `حذف ${tab.name}`);
        del.title = 'حذف برنامه';
        del.addEventListener('click', e => {
            e.stopPropagation();
            deleteSchedule(tab.id);
        });

        chip.append(label, count, del);
        chip.addEventListener('click', () => switchSchedule(tab.id));
        chip.addEventListener('dblclick', () => renameSchedule(tab.id));
        host.appendChild(chip);
    });

    // add-tab button (hidden at the cap)
    if (state.schedules.length < CONFIG.MAX_SCHEDULES) {
        const add = document.createElement('button');
        add.className = 'schedule-tab-add';
        add.type = 'button';
        add.innerHTML = '+';
        add.title = 'برنامه جدید';
        add.setAttribute('aria-label', 'افزودن برنامه جدید');
        add.addEventListener('click', createSchedule);
        host.appendChild(add);
    }
}

/** True when the viewport is phone-sized (same breakpoint as CSS media queries) */
function isMobileViewport() {
    return window.matchMedia('(max-width: 1023px)').matches;
}

/** True while the fullscreen fit-mode overlay is active */
function isFitMode() {
    return elements.scheduleContainer.classList.contains('fit-mode');
}

// ═══════════════════════════════════════════════════════════════
// SEARCH & PANEL LIST
// ═══════════════════════════════════════════════════════════════

function matchesQuery(course, q) {
    return course.name.includes(q)
        || course.professor.includes(q)
        || course.code.includes(q)
        || String(course.group).includes(q);
}

/** Is any advanced filter active? */
function hasActiveFilters() {
    const f = state.filters;
    return f.days.size > 0
        || f.startHour != null || f.endHour != null
        || f.exactHour != null
        || f.professor !== ''
        || f.units != null
        || f.group.trim() !== ''
        || f.hasTime || f.onlyAvailable || f.onlyFull
        || f.sortAsc != null;
}

/** Count of active filter dimensions (for badge) */
function countActiveFilters() {
    const f = state.filters;
    let n = 0;
    if (f.days.size) n++;
    if (f.startHour != null || f.endHour != null) n++;
    if (f.exactHour != null) n++;
    if (f.professor) n++;
    if (f.units != null) n++;
    if (f.group.trim()) n++;
    if (f.hasTime) n++;
    if (f.onlyAvailable) n++;
    if (f.onlyFull) n++;
    return n;
}

/** Does the course satisfy all advanced filters? */
function matchesFilters(course) {
    const f = state.filters;

    if (f.hasTime && !course.schedule.length) return false;

    if (f.onlyAvailable) {
        const remaining = course.capacity - course.registered;
        if (course.capacity > 0 && remaining <= 0) return false;
        if (course.capacity === 0) return false;
    }

    // ظرفیت پر: only courses whose seats are all taken
    if (f.onlyFull) {
        if (course.capacity === 0 || course.registered < course.capacity) return false;
    }

    if (f.days.size) {
        if (!course.schedule.length) return false;
        if (!course.schedule.some(s => f.days.has(s.day))) return false;
    }

    // Range filter: every session must lie fully inside [start, end].
    if (f.startHour != null || f.endHour != null) {
        if (!course.schedule.length) return false;
        const lo = f.startHour != null ? f.startHour : 7;
        const hi = f.endHour != null ? f.endHour : 20;
        const ok = course.schedule.every(s => {
            const st = parseTime(s.start);
            const en = parseTime(s.end);
            return st >= lo && en <= hi;
        });
        if (!ok) return false;
    }

    // Exact-hour filter: at least one session runs during this hour
    if (f.exactHour != null) {
        if (!course.schedule.length) return false;
        const ok = course.schedule.some(s => {
            const st = parseTime(s.start);
            const en = parseTime(s.end);
            return st <= f.exactHour && en > f.exactHour;
        });
        if (!ok) return false;
    }

    if (f.professor && course.professor !== f.professor) return false;

    if (f.units != null) {
        if (f.units === '3plus') {
            if (course.units < 3) return false;
        } else if (course.units !== f.units) return false;
    }

    if (f.group.trim() && !String(course.group).includes(f.group.trim())) return false;

    return true;
}

/** Sort the course list by name (asc/desc) per state.filters.sortAsc */
function sortCourses(courses) {
    const dir = state.filters.sortAsc;
    if (!dir) return courses;
    const sorted = [...courses].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return dir === 'asc' ? sorted : sorted.reverse();
}

function filterCourses(query) {
    const normalizedQuery = (query || '').trim();
    let list = getListCourses();

    if (hasActiveFilters()) {
        list = list.filter(matchesFilters);
    }

    if (normalizedQuery) {
        // Normalize Persian digits in query to latin
        const q = normalizedQuery
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        list = list.filter(c => matchesQuery(c, q));
    }

    list = sortCourses(list);

    const filtered = hasActiveFilters();
    return { list, initial: !normalizedQuery && !filtered };
}

function scheduleTagsHtml(course) {
    if (!course.schedule.length) {
        return '<span class="schedule-tag muted">بدون زمان‌بندی مشخص</span>';
    }
    return course.schedule.map(s => {
        const parity = slotParityLabel(s);
        // Parity rides INSIDE the day/time tag — never a detached label
        return `<span class="schedule-tag">${escapeHtml(s.day)} ${toPersianTime(s.start)}-${toPersianTime(s.end)}${parity ? ` <b class="parity-inline">${parity}</b>` : ''}</span>`;
    }).join('');
}

/** Build a course card (shared by panel + mobile search) */
function courseCardHtml(course) {
    const courseId = getCourseId(course);
    const isSelected = state.selectedCourses.includes(courseId);
    const capacityFull = !isCapacityAvailable(course);
    const selectable = isSelected || isSelectable(course);

    const badge = capacityFull
        ? '<span class="course-badge full-badge">ظرفیت پر</span>'
        : '';

    const btn = isSelected
        ? `<button class="btn-add-course selected" data-course-id="${courseId}">✓ اضافه شده - حذف</button>`
        : (selectable
            ? `<button class="btn-add-course" data-course-id="${courseId}" ${course.schedule.length ? '' : 'data-no-time="1"'}>+ افزودن به برنامه</button>`
            : `<button class="btn-add-course" disabled>ظرفیت تکمیل</button>`);

    return `
        <div class="course-result ${selectable ? '' : 'disabled'}" data-course-id="${courseId}">
            <div class="course-result-header">
                <span class="course-result-name">${escapeHtml(course.name)} ${badge}</span>
                <span class="course-result-code">${toPersianNumber(course.code)}</span>
            </div>
            <div class="course-result-meta">
                <span>استاد: ${escapeHtml(course.professor)}</span>
                <span>${formatUnits(course.units)} واحد</span>
                <span>گروه ${toPersianNumber(course.group)}</span>
                ${course.capacity > 0
                    ? `<span class="${capacityFull ? 'capacity-full' : 'capacity-ok'}">ظرفیت: ${toPersianNumber(course.registered)} از ${toPersianNumber(course.capacity)}</span>`
                    : '<span>ظرفیت: نامشخص</span>'}
            </div>
            <div class="course-result-schedule">${scheduleTagsHtml(course)}</div>
            ${btn}
        </div>
    `;
}

function bindCardButtons(container) {
    container.querySelectorAll('.btn-add-course[data-course-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const courseId = btn.dataset.courseId;
            if (state.selectedCourses.includes(courseId)) {
                removeCourse(courseId);
            } else {
                addCourse(courseId);
            }
        });
    });
}

function renderSearchResults(courses, isInitial) {
    if (!courses.length) {
        elements.resultsCount.textContent = 'نتیجه‌ای یافت نشد';
        elements.resultsList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>درسی با این مشخصات یافت نشد</p>
            </div>`;
        return;
    }

    elements.resultsCount.textContent = isInitial
        ? `${toPersianNumber(courses.length)} درس ارائه‌شده`
        : `${toPersianNumber(courses.length)} نتیجه${hasActiveFilters() ? ' (فیلتر شده)' : ''}`;

    elements.resultsList.innerHTML = courses.map(courseCardHtml).join('');
    bindCardButtons(elements.resultsList);
}

function showSearchResults(isInitial = false) {
    const { list, initial } = filterCourses(elements.searchInput.value);
    renderSearchResults(list, isInitial && initial);
    elements.searchClear.classList.add('visible');
}

/* Mobile search modal: open/close (results always visible inside) */
function setSearchModalOpen(open) {
    elements.searchModal.classList.toggle('active', open);
    document.body.classList.toggle('modal-open', open);
    if (open) {
        showSearchResults(true);
        setTimeout(() => elements.searchInput.focus(), 250);
    } else {
        elements.searchInput.value = '';
        elements.searchClear.classList.remove('visible');
        showSearchResults(true);
    }
}

function isSearchModalOpen() {
    return elements.searchModal.classList.contains('active');
}

/** Desktop panel list */
function renderPanelList() {
    const { list } = filterCourses(elements.panelSearch.value);

    elements.panelCount.textContent = toPersianNumber(
        `${state.selectedCourses.length}/${getListCourses().length}`
    );

    if (!list.length) {
        elements.panelList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>${hasActiveFilters() ? 'درسی با این فیلترها یافت نشد' : 'نتیجه‌ای یافت نشد'}</p>
            </div>`;
        return;
    }

    elements.panelList.innerHTML = list.map(courseCardHtml).join('');
    bindCardButtons(elements.panelList);
}

/** Refresh every course list view */
function refreshLists() {
    renderPanelList();
    if (isSearchModalOpen() || elements.searchResults.classList.contains('active')) {
        const { list, initial } = filterCourses(elements.searchInput.value);
        renderSearchResults(list, initial && !elements.searchInput.value.trim());
    }
    if (elements.listModal.classList.contains('active')) {
        renderSelectedList();
    }
}

// ═══════════════════════════════════════════════════════════════
// COURSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function getTotalUnits() {
    return state.selectedCourses.reduce((sum, id) => sum + (findCourseById(id)?.units || 0), 0);
}

function addCourse(courseId) {
    const course = findCourseById(courseId);
    if (!course) return;

    if (state.selectedCourses.includes(courseId)) {
        showToast('این درس قبلاً اضافه شده است', 'warning');
        return;
    }

    // Same course code in another group (e.g. گروه ۱ vs گروه ۲) counts as the
    // same course — a student takes it once, so block the duplicate
    const duplicate = state.selectedCourses
        .map(findCourseById)
        .find(c => c && c.code === course.code);
    if (duplicate) {
        showToast(`درس "${course.name}" را قبلاً برداشته‌اید (گروه ${toPersianNumber(duplicate.group)}) — هر درس فقط یک‌بار قابل انتخاب است`, 'warning');
        return;
    }

    // Capacity full: selection blocked at the source too (not just UI)
    if (!isCapacityAvailable(course)) {
        showToast(`ظرفیت درس "${course.name}" پر شده است`, 'error');
        return;
    }

    // Block time conflicts (parity-aware: زوج/فرد sessions sharing a slot don't clash)
    for (const existingId of state.selectedCourses) {
        const existingCourse = findCourseById(existingId);
        if (existingCourse) {
            const conflict = checkConflict(course, existingCourse);
            if (conflict.hasConflict) {
                showConflictModal(course, existingCourse, conflict);
                return;
            }
        }
    }

    const wasOverLimit = getTotalUnits() > CONFIG.MAX_UNITS;

    state.selectedCourses.push(courseId);
    saveSchedules();
    updateSummary();
    refreshLists();
    renderSchedule();

    showToast(`درس "${course.name}" اضافه شد`, 'success');

    // Courses without fixed class time appear in the "سایر دروس" row
    if (!course.schedule.length) {
        showToast(`"${course.name}" ساعت کلاسی در دیتا ندارد و در ردیف «سایر دروس» جدول نمایش داده می‌شود`, 'info');
    }

    // 20-unit warning (non-blocking)
    const total = getTotalUnits();
    if (!wasOverLimit && total > CONFIG.MAX_UNITS) {
        showToast(`هشدار: جمع واحدها (${formatUnits(total)}) از ${toPersianNumber(CONFIG.MAX_UNITS)} واحد مجاز بیشتر شد!`, 'warning');
    }
}

function removeCourse(courseId) {
    const index = state.selectedCourses.indexOf(courseId);
    if (index === -1) return;

    const course = findCourseById(courseId);
    state.selectedCourses.splice(index, 1);
    saveSchedules();
    updateSummary();
    refreshLists();
    renderSchedule();

    // Keep the search modal open; close other modals (course info etc.)
    const searchWasOpen = isSearchModalOpen();
    closeAllModals();
    if (searchWasOpen) setSearchModalOpen(true);

    if (course) showToast(`درس "${course.name}" حذف شد`, 'info');
}

function resetSchedule() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }

    if (confirm('آیا مطمئن هستید که می‌خواهید تمام دروس این برنامه را حذف کنید؟')) {
        state.selectedCourses = [];
        state.unitsWarned = false;
        saveSchedules();
        updateSummary();
        refreshLists();
        renderSchedule();
        showToast('برنامه ریست شد', 'info');
    }
}

// ═══════════════════════════════════════════════════════════════
// COURSE PRICES (data/couresPrice.html — code -> unit price)
// ═══════════════════════════════════════════════════════════════

/** Parse the portal price table: per row, course code + مبلغ واحد (unit price).
 *  Row layout: [checkbox][code][name][مبلغ واحد][واحد][مبلغ كل] */
function parsePriceTable(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const prices = {};
    doc.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        const code = cells[1].textContent.trim();
        const unitPrice = parseInt(cells[3].textContent.replace(/[^\d]/g, ''), 10);
        if (!/^\d+$/.test(code) || !unitPrice) return;
        prices[code] = unitPrice;
    });
    return prices;
}

/** Load prices fresh on every page load; cached copy as fallback */
async function loadPrices() {
    try {
        const response = await fetch(CONFIG.PRICES_FILE, { cache: 'no-store' });
        if (response.ok) {
            const prices = parsePriceTable(await response.text());
            if (Object.keys(prices).length) {
                state.prices = prices;
                try { localStorage.setItem(CONFIG.PRICES_KEY, JSON.stringify(prices)); } catch (e) { /* noop */ }
                return;
            }
        }
    } catch (error) {
        console.warn('Could not load price file:', error);
    }
    // Fallback: last successfully saved prices
    try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.PRICES_KEY) || '{}');
        if (Object.keys(saved).length) state.prices = saved;
    } catch (e) { /* noop */ }
}

/** Unit price of a course (0 = unknown) */
function getCoursePrice(course) {
    return state.prices[course.code] || 0;
}

/** Total cost of the current selection (unit price × units per course) */
function getTotalCost() {
    return state.selectedCourses.reduce((sum, id) => {
        const course = findCourseById(id);
        if (!course) return sum;
        return sum + getCoursePrice(course) * course.units;
    }, 0);
}

/** 13500000 -> "۱۳,۵۰۰,۰۰۰" (Persian digits, thousands separators) */
function formatMoney(amount) {
    return toPersianNumber(amount.toLocaleString('en-US'));
}

/** Portal prices are Rial — display as Toman (÷ ۱۰) */
function formatToman(amountRial) {
    return formatMoney(Math.round(amountRial / 10)) + ' تومان';
}

function updateSummary() {
    const totalCourses = state.selectedCourses.length;
    const totalUnits = getTotalUnits();

    elements.selectedCount.textContent = toPersianNumber(totalCourses);
    elements.totalUnits.textContent = formatUnits(totalUnits);
    elements.limitUnits.textContent = toPersianNumber(CONFIG.MAX_UNITS);

    // Over-limit styling
    const overLimit = totalUnits > CONFIG.MAX_UNITS;
    elements.totalUnits.classList.toggle('over-limit', overLimit);
    elements.unitsFlag.classList.toggle('visible', overLimit);
    elements.unitsFlagText.textContent =
        `جمع واحدها (${formatUnits(totalUnits)}) از ${toPersianNumber(CONFIG.MAX_UNITS)} واحد مجاز بیشتر شده است!`;
    elements.scheduleContainer.classList.toggle('over-limit', overLimit);

    // Cost (هزینه) — unit price × units per selected course, shown in Toman
    if (elements.totalCost) {
        const totalCost = getTotalCost();
        elements.totalCost.textContent = totalCost ? formatToman(totalCost) : '—';
    }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE RENDERING - MULTI-HOUR SPANNING (RTL aware)
// ═══════════════════════════════════════════════════════════════

function initializeScheduleTable() {
    state.currentHours = CONFIG.HOURS;
    state.currentTransposed = false;
    buildScheduleTable(CONFIG.HOURS);
}

function renderSchedule() {
    // Normal grid on every viewport: day rows / hour columns. On phones the
    // wrapper scrolls horizontally so blocks keep their real hour positions;
    // the fullscreen fit button swaps to the compressed transposed grid.
    const hours = getScheduleHours();
    if (JSON.stringify(hours) !== JSON.stringify(state.currentHours) ||
        state.currentTransposed) {
        state.currentHours = hours;
        state.currentTransposed = false;
        buildScheduleTable(hours);
    }

    elements.scheduleBody.querySelectorAll('.course-block').forEach(el => el.remove());

    state.selectedCourses.forEach(courseId => {
        const course = findCourseById(courseId);
        if (!course) return;
        course.schedule.forEach(slot => renderCourseBlock(course, slot));
    });

    renderNotimeChips();
}

/** Union of base grid hours + every hour covered by selected courses */
function getScheduleHours() {
    const hours = new Set(CONFIG.HOURS);
    state.selectedCourses.forEach(id => {
        const course = findCourseById(id);
        if (!course) return;
        course.schedule.forEach(s => {
            const start = Math.floor(parseTime(s.start));
            const end = parseTime(s.end);
            for (let h = start; h < end && h < 24; h++) hours.add(h);
        });
    });
    return Array.from(hours).sort((a, b) => a - b);
}

function buildScheduleTable(hours) {
    // Header hours
    const theadRow = elements.scheduleTable.querySelector('.time-header');
    theadRow.innerHTML = '<th class="day-header">روز / ساعت</th>' +
        hours.map(h => `<th>${String(h).padStart(2, '0')}:00</th>`).join('');

    elements.scheduleBody.innerHTML = '';

    // Day rows
    CONFIG.DAYS.forEach(day => {
        const row = document.createElement('tr');
        row.className = 'day-row';
        row.dataset.day = day;

        const dayCell = document.createElement('th');
        dayCell.textContent = day;
        row.appendChild(dayCell);

        hours.forEach(hour => {
            const cell = document.createElement('td');
            cell.dataset.hour = hour;
            cell.dataset.day = day;
            row.appendChild(cell);
        });

        elements.scheduleBody.appendChild(row);
    });

    // Extra row: courses without fixed class time (project/internship ...)
    const notimeRow = document.createElement('tr');
    notimeRow.className = 'day-row notime-row';
    const notimeTh = document.createElement('th');
    notimeTh.textContent = 'سایر دروس';
    notimeRow.appendChild(notimeTh);
    const notimeCell = document.createElement('td');
    notimeCell.colSpan = hours.length;
    notimeCell.className = 'notime-cell';
    notimeRow.appendChild(notimeCell);
    elements.scheduleBody.appendChild(notimeRow);
}

/** Chips for selected courses that have no fixed class time */
function renderNotimeChips() {
    const cell = elements.scheduleBody.querySelector('.notime-cell');
    if (!cell) return;
    cell.innerHTML = '';

    state.selectedCourses.forEach(courseId => {
        const course = findCourseById(courseId);
        if (!course || course.schedule.length) return;

        const chip = document.createElement('div');
        chip.className = 'notime-chip';
        chip.style.borderColor = course.color;
        chip.dataset.courseId = getCourseId(course);

        chip.innerHTML = `
            <span class="notime-chip-name">${escapeHtml(course.name)}</span>
            <span class="notime-chip-meta">گروه ${toPersianNumber(course.group)} • ${formatUnits(course.units)} واحد • بدون ساعت کلاس</span>`;

        chip.addEventListener('click', () => showCourseModal(course));
        cell.appendChild(chip);
    });

    // Hide the row entirely when empty
    cell.closest('tr').style.display = cell.children.length ? '' : 'none';
}

/** Shared factory: block element with content + click handler (no positioning) */
function createCourseBlock(course, slot, extraClass) {
    const block = document.createElement('div');
    const parity = slotParityLabel(slot);
    block.className = extraClass ? `course-block ${extraClass}` : 'course-block';
    if (parity) block.classList.add(`parity-${slot.parity}`);
    block.style.backgroundColor = course.color;
    block.dataset.courseId = getCourseId(course);
    block.innerHTML = `
        ${parity ? `<span class="course-block-parity">${parity}</span>` : ''}
        <span class="course-block-name">${escapeHtml(course.name)}</span>
        <span class="course-block-time">${toPersianTime(slot.start)}-${toPersianTime(slot.end)}</span>
        <span class="course-block-group">گروه ${toPersianNumber(course.group)}</span>
    `;
    block.addEventListener('click', () => showCourseModal(course));
    return block;
}

function renderCourseBlock(course, slot, targetCell, spanRows = 1) {
    const startTime = parseTime(slot.start);
    const endTime = parseTime(slot.end);
    const startHour = Math.floor(startTime);
    const duration = endTime - startTime;
    if (duration <= 0) return;

    if (state.currentTransposed) {
        // Transposed grid (fit-mode fullscreen): the block lives in its
        // START-hour cell. Multi-hour slots stretch DOWNWARD across the
        // covered rows (8-10 fills rows 8 AND 9) — final height is measured
        // from real cell geometry in the post-pass below, so wrapped titles
        // and row heights never break the span.
        const block = createCourseBlock(course, slot, 'course-block-flow');
        if (spanRows > 1) {
            block.dataset.spanRows = spanRows;
            block.dataset.spanEndHour = startHour + spanRows - 1;
            block.dataset.spanDay = slot.day;
            targetCell.style.position = 'relative';
        }
        targetCell.appendChild(block);
        return;
    }

    // Normal grid: day rows / hour columns
    const startCell = elements.scheduleBody.querySelector(
        `tr[data-day="${slot.day}"] td[data-hour="${startHour}"]`);
    if (!startCell) return;

    const block = createCourseBlock(course, slot);
    // RTL: time flows right-to-left — anchor to the RIGHT edge of the cell
    // and stretch leftwards across the covered hours
    const offsetPercent = ((startTime - startHour) / 1) * 100;

    // Parity sharing: a زوج/فرد block only shrinks to half width when an
    // opposite-parity block occupies the SAME slot — a lone one stays full.
    // hasOppositeParityBlock reads state (not DOM), so render order is safe.
    if (hasOppositeParityBlock(slot)) {
        const half = duration * 50;
        if (slot.parity === 'even') {
            // Even weeks (زوج): right half — anchored at the slot's right edge
            block.style.right = `${offsetPercent}%`;
            block.style.width = `${half}%`;
        } else {
            // Odd weeks (فرد): left half — push past the even block's half
            block.style.right = `${offsetPercent + half}%`;
            block.style.width = `${half}%`;
        }
        block.classList.add('parity-half');
    } else {
        block.style.right = `${offsetPercent}%`;
        block.style.width = `${duration * 100}%`;
    }
    startCell.appendChild(block);
}

/** Does an opposite-parity (زوج/فرد) block already occupy this exact slot? */
function hasOppositeParityBlock(slot) {
    if (slotParityLabel(slot) === null) return false;
    const opposite = slot.parity === 'even' ? 'odd' : 'even';
    return state.selectedCourses.some(id => {
        const other = findCourseById(id);
        if (!other) return false;
        return other.schedule.some(s2 =>
            s2.day === slot.day && s2.start === slot.start && s2.end === slot.end &&
            s2.cadence === 'biweekly' && s2.parity === opposite);
    });
}

// ── Transposed fit-mode grid ────────────────────────────────────
// Fullscreen (fit button): hours as rows, days as columns. The table becomes
// tall and narrow so it fits the phone width without horizontal scroll.
// Empty hour rows collapse to a slim strip; empty day columns stay narrow.

const DAY_SHORT = { 'شنبه': 'ش', 'یکشنبه': 'ی', 'دوشنبه': 'د', 'سه‌شنبه': 'س', 'چهارشنبه': 'چ', 'پنجشنبه': 'پ' };

/** Union of base hours + selected-course hours, in the transposed grid */
function getTransposedHours() {
    return getScheduleHours();
}

function buildTransposedTable(hours) {
    const theadRow = elements.scheduleTable.querySelector('.time-header');
    // RTL row: time label first (right), then days right-to-left
    theadRow.innerHTML = '<th class="day-header hour-col-header">ساعت / روز</th>' +
        CONFIG.DAYS.map(d => `<th class="day-col-header">${DAY_SHORT[d] || d}</th>`).join('');

    elements.scheduleBody.innerHTML = '';

    hours.forEach(hour => {
        const row = document.createElement('tr');
        row.className = 'day-row hour-row';
        row.dataset.hour = hour;

        const timeCell = document.createElement('th');
        timeCell.textContent = `${String(hour).padStart(2, '0')}:00`;
        timeCell.className = 'hour-label';
        row.appendChild(timeCell);

        CONFIG.DAYS.forEach(day => {
            const cell = document.createElement('td');
            cell.dataset.hour = hour;
            cell.dataset.day = day;
            row.appendChild(cell);
        });

        elements.scheduleBody.appendChild(row);
    });

    // Extra row: courses without fixed class time
    const notimeRow = document.createElement('tr');
    notimeRow.className = 'day-row notime-row';
    const notimeTh = document.createElement('th');
    notimeTh.textContent = 'سایر';
    notimeTh.className = 'hour-label';
    notimeRow.appendChild(notimeTh);
    const notimeCell = document.createElement('td');
    notimeCell.colSpan = CONFIG.DAYS.length;
    notimeCell.className = 'notime-cell';
    notimeRow.appendChild(notimeCell);
    elements.scheduleBody.appendChild(notimeRow);
}

function renderTransposedSchedule() {
    const hours = getTransposedHours();
    if (JSON.stringify(hours) !== JSON.stringify(state.currentHours) ||
        !state.currentTransposed) {
        state.currentHours = hours;
        state.currentTransposed = true;
        buildTransposedTable(hours);
    }

    elements.scheduleBody.querySelectorAll('.course-block').forEach(el => el.remove());
    elements.scheduleBody.querySelectorAll('td.span-covered').forEach(el => el.classList.remove('span-covered'));

    state.selectedCourses.forEach(courseId => {
        const course = findCourseById(courseId);
        if (!course) return;
        course.schedule.forEach(slot => {
            // Transposed: the block lives in its START-hour row and stretches
            // DOWNWARD across every row its duration covers (8-10 spans rows
            // 8 and 9), mirroring the horizontal span of the normal grid
            const startHour = Math.floor(parseTime(slot.start));
            const endHour = Math.ceil(parseTime(slot.end));
            const cell = elements.scheduleBody.querySelector(
                `tr[data-hour="${startHour}"] td[data-day="${slot.day}"]`);
            if (cell) {
                const span = Math.max(1, endHour - startHour);
                renderCourseBlock(course, slot, cell, span);
            }
        });
    });

    // Mark rows a multi-hour block flows over, then collapse truly empty rows
    elements.scheduleBody.querySelectorAll('.course-block[data-span-rows]').forEach(block => {
        const endHour = block.dataset.spanEndHour;
        const day = block.dataset.spanDay;
        const lastCell = elements.scheduleBody.querySelector(
            `tr[data-hour="${endHour}"] td[data-day="${day}"]`);
        if (lastCell) lastCell.classList.add('span-covered');
    });

    // Collapse hour rows that have no course block in any day cell — rows a
    // multi-hour block flows over count as occupied
    elements.scheduleBody.querySelectorAll('tr.hour-row').forEach(row => {
        const hasBlock = [...row.querySelectorAll('td')].some(td => td.children.length);
        const covered = row.querySelector('td.span-covered') !== null;
        row.classList.toggle('empty-row', !hasBlock && !covered);
    });

    // Post-pass: size each multi-hour block to the real geometric span between
    // its start cell and the bottom of the last covered row (handles wrapped
    // titles and variable row heights)
    elements.scheduleBody.querySelectorAll('.course-block[data-span-rows]').forEach(block => {
        const endHour = block.dataset.spanEndHour;
        const day = block.dataset.spanDay;
        const lastCell = elements.scheduleBody.querySelector(
            `tr[data-hour="${endHour}"] td[data-day="${day}"]`);
        if (!lastCell) return;
        const cell = block.parentElement;
        const top = cell.getBoundingClientRect().top;
        const bottom = lastCell.getBoundingClientRect().bottom;
        block.style.height = `${Math.max(44, Math.round(bottom - top) - 4)}px`;
    });

    renderNotimeChips();
}

// ═══════════════════════════════════════════════════════════════
// MODAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function showCourseModal(course) {
    state.currentModalCourse = course;

    const scheduleHtml = course.schedule.length
        ? course.schedule.map(s => {
            const parity = slotParityLabel(s);
            return `
            <div class="schedule-item">
                <span class="schedule-item-day">${escapeHtml(s.day)}</span>
                <span class="schedule-item-time">${toPersianTime(s.start)} - ${toPersianTime(s.end)}${parity ? ` <span class="parity-inline">${parity}</span>` : ''}</span>
            </div>`;
        }).join('')
        : '<div class="schedule-item"><span class="schedule-item-day">بدون زمان‌بندی مشخص</span></div>';

    elements.courseModalBody.innerHTML = `
        <div class="course-info-grid">
            <div class="course-info-item">
                <span class="course-info-label">نام درس</span>
                <span class="course-info-value">${escapeHtml(course.name)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">کد درس</span>
                <span class="course-info-value">${toPersianNumber(course.code)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">استاد</span>
                <span class="course-info-value">${escapeHtml(course.professor)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">تعداد واحد</span>
                <span class="course-info-value">${formatUnits(course.units)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">گروه</span>
                <span class="course-info-value">${toPersianNumber(course.group)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">ظرفیت</span>
                <span class="course-info-value">${toPersianNumber(course.registered)} از ${toPersianNumber(course.capacity)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">برنامه هفتگی</span>
                <div class="course-schedule-list">${scheduleHtml}</div>
            </div>
        </div>`;

    // Hide remove button if course is not selected
    elements.btnRemoveCourse.style.display =
        state.selectedCourses.includes(getCourseId(course)) ? '' : 'none';

    elements.courseModal.classList.add('active');
}

function showConflictModal(newCourse, existingCourse, conflict) {
    elements.conflictMessage.innerHTML = `
        درس "<strong>${escapeHtml(newCourse.name)}</strong>" با درس "<strong>${escapeHtml(existingCourse.name)}</strong>"
        تداخل زمانی دارد:<br><br>
        روز <strong>${escapeHtml(conflict.day)}</strong> -
        ساعت ${toPersianTime(conflict.time1)} با ${toPersianTime(conflict.time2)}
    `;
    elements.conflictModal.classList.add('active');
}

function renderSelectedList() {
    if (state.selectedCourses.length === 0) {
        elements.selectedList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <p>هنوز درسی انتخاب نشده است</p>
            </div>`;
        return;
    }

    elements.selectedList.innerHTML = state.selectedCourses.map(courseId => {
        const course = findCourseById(courseId);
        if (!course) return '';

        const scheduleText = course.schedule.length
            ? course.schedule.map(s => {
                const parity = slotParityLabel(s);
                return `${escapeHtml(s.day)} ${toPersianTime(s.start)}-${toPersianTime(s.end)}${parity ? ` (${parity})` : ''}`;
            }).join('، ')
            : 'بدون زمان‌بندی مشخص';

        const capacityFull = !isCapacityAvailable(course);
        const capacityText = course.capacity > 0
            ? `ظرفیت: ${toPersianNumber(course.registered)} از ${toPersianNumber(course.capacity)}${capacityFull ? ' (تکمیل)' : ''}`
            : 'ظرفیت: نامشخص';

        return `
            <div class="selected-item">
                <div class="selected-item-info">
                    <span class="selected-item-name">${escapeHtml(course.name)}${course.degree ? `<span class="selected-item-degree">${escapeHtml(course.degree)}</span>` : ''}</span>
                    <span class="selected-item-meta">
                        ${escapeHtml(course.professor)} | ${formatUnits(course.units)} واحد | گروه ${toPersianNumber(course.group)} | کد ${toPersianNumber(course.code)}<br>
                        ${scheduleText}<br>
                        ${capacityText}
                    </span>
                </div>
                <button class="selected-item-remove" data-course-id="${courseId}" title="حذف">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>`;
    }).join('');

    elements.selectedList.querySelectorAll('.selected-item-remove').forEach(btn => {
        btn.addEventListener('click', () => removeCourse(btn.dataset.courseId));
    });
}

// ═══════════════════════════════════════════════════════════════
// COST MODAL (breakdown + copyable portal script)
// ═══════════════════════════════════════════════════════════════

function renderCostModal() {
    const courses = state.selectedCourses
        .map(findCourseById)
        .filter(Boolean);

    if (!courses.length) {
        elements.costModalBody.innerHTML = '<div class="cost-empty">هنوز درسی انتخاب نشده است</div>';
        elements.costScriptBox.value = '';
        return;
    }

    let unknown = 0;
    const rows = courses.map((course, index) => {
        const unitPrice = getCoursePrice(course);
        const total = unitPrice * course.units;
        if (!unitPrice) unknown++;
        return `
            <tr>
                <td>${toPersianNumber(index + 1)}</td>
                <td class="cost-cell-name">${escapeHtml(course.name)}</td>
                <td>${toPersianNumber(course.code)}</td>
                <td>${formatUnits(course.units)}</td>
                <td>${unitPrice ? formatToman(unitPrice) : 'نامشخص'}</td>
                <td class="cost-cell-total">${unitPrice ? formatToman(total) : '—'}</td>
            </tr>`;
    }).join('');

    const total = getTotalCost();
    const unknownLabel = unknown ? `(${toPersianNumber(unknown)} درس قیمت ندارد)` : '';
    elements.costModalBody.innerHTML = `
        <table class="cost-table">
            <thead>
                <tr><th>#</th><th>نام درس</th><th>کد</th><th>واحد</th><th>مبلغ واحد</th><th>مبلغ کل</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="5">جمع کل ${unknownLabel}</td>
                    <td class="cost-cell-total">${formatToman(total)}</td>
                </tr>
            </tfoot>
        </table>
        ${unknown ? '<div class="cost-note">قیمت بعضی دروس در جدول قیمت پیدا نشد — جمع کل ممکن است ناقص باشد.</div>' : ''}`;

    elements.costScriptBox.value = buildPortalTickScript(courses);
}

/**
 * Self-contained script the user pastes into the browser console on the
 * university portal page: it scans the document AND same-origin iframes
 * (portal tables often live inside a frame) for each selected course's row —
 * code from the LesCode link, the row-level hidden LsnNo input, or bare
 * digits — then ticks it. Falls back to clicking a button-like element when
 * the row has no checkbox.
 */
function buildPortalTickScript(courses) {
    const payload = JSON.stringify({
        courses: courses.map(c => ({ code: String(c.code), group: String(c.group), name: c.name }))
    });
    return `(function () {
  var data = ${payload};
  var ticks = [], skipped = [];
  var seen = {};

  // collect the top document + every reachable same-origin frame document
  var docs = [];
  function collectDocs(win, depth) {
    if (!win || depth > 5) return;
    try {
      docs.push({ doc: win.document, label: docs.length ? 'فریم ' + docs.length : 'صفحه اصلی' });
    } catch (e) { return; }
    for (var i = 0; i < win.frames.length; i++) collectDocs(win.frames[i], depth + 1);
  }
  try { collectDocs(window, 0); } catch (e) {}
  if (!docs.length) docs.push({ doc: document, label: 'صفحه اصلی' });

  function runDoc(doc, label) {
    var scanned = 0;
    doc.querySelectorAll('tr').forEach(function (row) {
      var box0 = row.querySelector('input[type=checkbox]');
      var cells = row.querySelectorAll('td');
      if (!box0 && cells.length < 2) return;
      scanned++;
      // course code: LesCode link > row-level hidden LsnNo input > bare 5-7 digit cell
      var link = row.querySelector('a[href*="LesCode="]');
      var code = '';
      if (link) {
        var m = link.href.match(/LesCode=(\\d+)/);
        if (m) code = m[1];
      }
      if (!code) {
        var hidden = row.querySelector('input[type=hidden][name*="LsnNo"]');
        if (hidden) code = (hidden.value || '').trim();
      }
      for (var j = 0; j < cells.length && !code; j++) {
        var t = cells[j].textContent.trim();
        if (/^\\d{5,7}$/.test(t)) { code = t; break; }
      }
      if (!code) return;
      // group: first small-number cell AFTER the code cell (ردیف sits before it)
      var codeIdx = -1;
      for (var k = 0; k < cells.length && codeIdx < 0; k++) {
        if (cells[k].querySelector('a[href*="LesCode="]') || /^\\d{5,7}$/.test(cells[k].textContent.trim())) codeIdx = k;
      }
      var group = '';
      for (var g = codeIdx + 1; g < cells.length && !group; g++) {
        var gt = cells[g].textContent.trim();
        if (/^\\d{1,2}$/.test(gt)) group = gt.replace(/^0+/, '');
      }
      var want = data.courses.filter(function (c) { return c.code === code; });
      if (!want.length) return;
      if (seen[code]) return; // keep the row matching the requested group
      // group detected → row must be the requested variant; no group → first row wins
      var rowMatches = want.some(function (c) { return String(c.group) === group; });
      if (group && !rowMatches) return;
      seen[code] = true;
      // tick target: checkbox > radio > button-like element
      var box = box0 || row.querySelector('input[type=radio]');
      var btn = row.querySelector('input[type=button], input[type=submit], button, [onclick]');
      if (box && !box.disabled) {
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new Event('click', { bubbles: true }));
        box.dispatchEvent(new Event('input', { bubbles: true }));
        ticks.push(code + (group ? ' گروه ' + group : ''));
      } else if (btn) {
        btn.click();
        ticks.push(code + (group ? ' گروه ' + group : ''));
      } else {
        skipped.push(code);
      }
    });
    console.log('%c[' + label + '] ' + scanned + ' ردیف بررسی شد', 'color:#6b7280');
    return scanned;
  }

  var total = 0;
  docs.forEach(function (d) { total += runDoc(d.doc, d.label); });

  var missing = data.courses.filter(function (c) { return !seen[c.code]; });
  console.log('%c✅ ' + ticks.length + ' درس علامت خورد', 'color:#22c55e;font-weight:bold');
  ticks.forEach(function (t) { console.log('  ✔ ' + t); });
  if (skipped.length) console.log('%cℹ ' + skipped.length + ' ردیف بدون چک‌باکس/دکمه — دستی علامت بزنید', 'color:#3b82f6');
  if (missing.length) {
    console.log('%c⚠ در جدول صفحه پیدا نشد: ' + missing.length + ' درس', 'color:#f59e0b;font-weight:bold');
    missing.forEach(function (c) { console.log('  ✖ ' + c.code + ' ' + c.name); });
  }
  if (!total) console.log('%cهیچ جدولی پیدا نشد — مطمئن شو جدول دروس کامل لود شده و صفحه انتخاب واحد باز است', 'color:#ef4444;font-weight:bold');
  console.log('قبل از ثبت نهایی، صفحه را خودتان بررسی کنید.');
})();`;
}

function openCostModal() {
    renderCostModal();
    elements.costModal.classList.add('active');
}

async function copyCostScript() {
    const text = elements.costScriptBox.value;
    if (!text) {
        showToast('اسکریپتی برای کپی نیست — اول درس انتخاب کنید', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('اسکریپت کپی شد — در کنسول صفحه پیش‌محاسبه paste کنید', 'success');
    } catch (error) {
        console.error('Error copying script:', error);
        showToast('خطا در کپی کردن', 'error');
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    state.currentModalCourse = null;
    if (isSearchModalOpen()) setSearchModalOpen(false);
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM DATA (user-pasted portal table)
// ═══════════════════════════════════════════════════════════════

function updateCustomDataStatus() {
    // Top banner: default data locked while custom data is active
    elements.customDataBanner.classList.toggle('hidden', !state.customActive);

    if (state.customActive) {
        elements.customDataStatus.innerHTML =
            `<span class="status-active">✔ دیتای دلخواه فعال است (${toPersianNumber(state.customCourses.length)} درس) — دیتای پیش‌فرض قفل شده</span>`;
    } else {
        elements.customDataStatus.innerHTML =
            `<span class="status-default">دیتای پیش‌فرض فعال است (${toPersianNumber(state.defaultCourses.length)} درس)</span>`;
    }
}

function applyCustomData(text, { silent = false } = {}) {
    const courses = parseCourses(text);
    if (!courses.length) {
        if (!silent) showToast('هیچ درسی از دیتای واردشده استخراج نشد', 'error');
        return false;
    }

    state.customCourses = courses;
    state.customActive = true;
    saveCustomData(text);

    // Dataset replaced: wipe all previous selections so the schedule starts clean
    state.selectedCourses = [];
    saveSchedules();
    state.unitsWarned = false;

    updateSummary();
    updateCustomDataStatus();
    rebuildFilterBars(); // professor dropdown + options follow the new dataset
    refreshLists();
    renderSchedule();

    if (!silent) showToast(`دیتای دلخواه بارگذاری شد (${toPersianNumber(courses.length)} درس)`, 'success');
    return true;
}

function restoreDefaultData() {
    state.customCourses = [];
    state.customActive = false;
    clearCustomData();

    // Dataset replaced: wipe all selections so the schedule starts clean,
    // same as applyCustomData — stale default selections must not survive
    state.selectedCourses = [];
    saveSchedules();
    state.unitsWarned = false;

    updateSummary();
    updateCustomDataStatus();
    rebuildFilterBars();
    refreshLists();
    renderSchedule();
    showToast('به دیتای پیش‌فرض بازگشتید', 'info');
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Export the schedule TABLE as PDF (light theme snapshot, supports Persian)
 */
async function exportPDF() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }

    try {
        showToast('در حال تهیه PDF از جدول...', 'info');

        const { jsPDF } = window.jspdf;

        // Dark wrapper so the exported PDF matches the app's dark theme
        const wrapper = document.createElement('div');
        wrapper.className = 'dark-mode';
        wrapper.style.cssText = `
            position: fixed; left: -9999px; top: 0; width: 1320px;
            padding: 24px; background: #0a0a0a; color: #ffffff;
            font-family: 'Vazirmatn', sans-serif; direction: rtl;`;

        const totalUnits = getTotalUnits();
        wrapper.innerHTML = `
            <div style="text-align: center; margin-bottom: 14px;">
                <h1 style="font-size: 22px; margin: 0 0 6px; color: #ffffff;">پیش‌انتخاب واحد - جدول زمان‌بندی</h1>
                <p style="font-size: 12px; color: #a0a0a0; margin: 0;">
                    تاریخ: ${new Date().toLocaleDateString('fa-IR')}
                    | تعداد درس: ${toPersianNumber(state.selectedCourses.length)}
                    | جمع واحد: ${formatUnits(totalUnits)}
                </p>
            </div>`;

        // Clone the schedule table container
        const tableClone = elements.scheduleContainer.cloneNode(true);
        tableClone.classList.remove('over-limit');
        const flag = tableClone.querySelector('.units-flag');
        if (flag) flag.remove();
        wrapper.appendChild(tableClone);

        document.body.appendChild(wrapper);
        await new Promise(r => setTimeout(r, 200));

        // Snapshot resolved colors AFTER the wrapper is attached and laid out
        // (getComputedStyle returns nothing on detached nodes, which would
        // also strip the inline course-block / chip colors)
        tableClone.querySelectorAll('*').forEach(el => {
            const cs = getComputedStyle(el);
            el.style.backgroundColor = cs.backgroundColor;
            el.style.color = cs.color;
            el.style.borderColor = cs.borderColor;
        });

        // html2canvas renders inline-block chips more reliably than inline-flex
        tableClone.querySelectorAll('.notime-chip').forEach(chip => {
            chip.style.display = 'inline-block';
        });

        const canvas = await html2canvas(wrapper, {
            backgroundColor: '#0a0a0a',
            scale: 2,
            useCORS: true,
            allowTaint: true
        });
        document.body.removeChild(wrapper);

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = 297;   // A4 landscape width (mm)
        const pageHeight = 210; // A4 landscape height (mm)
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        // Multi-page support (vertical slicing)
        let remaining = imgHeight, position = 0, firstPage = true;
        while (remaining > 0) {
            if (!firstPage) pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            firstPage = false;
            remaining -= pageHeight;
            position -= pageHeight;
        }

        pdf.save(`course-table-${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF جدول با موفقیت دانلود شد', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showToast('خطا در تهیه PDF', 'error');
    }
}

async function copyToClipboard() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }

    try {
        let text = 'پیش‌انتخاب واحد - برنامه هفتگی\n';
        text += '═══════════════\n\n';

        state.selectedCourses.forEach((courseId, index) => {
            const course = findCourseById(courseId);
            if (!course) return;

            const scheduleText = course.schedule.length
                ? course.schedule.map(s => `${s.day} ${s.start}-${s.end}`).join('، ')
                : 'بدون زمان‌بندی';

            text += `${index + 1}. ${course.name} (گروه ${course.group})\n`;
            text += `   کد: ${course.code}\n`;
            text += `   استاد: ${course.professor}\n`;
            text += `   واحد: ${course.units}\n`;
            text += `   برنامه: ${scheduleText}\n\n`;
        });

        text += `═══════════════\n`;
        text += `تعداد درس: ${state.selectedCourses.length} | جمع واحد: ${getTotalUnits()}\n`;

        await navigator.clipboard.writeText(text);
        showToast('برنامه در کلیپ‌بورد کپی شد', 'success');
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        showToast('خطا در کپی کردن', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// SHARE VIA LINK (URL hash)
// ═══════════════════════════════════════════════════════════════

/** Encode selected course IDs into the URL hash (shareable link) */
function buildShareLink() {
    const payload = JSON.stringify({ c: state.selectedCourses });
    const encoded = btoa(unescape(encodeURIComponent(payload))); // UTF-8 safe base64
    return `${location.origin}${location.pathname}#${encoded}`;
}

/** Copy a share link (URL #hash with selected course IDs) to the clipboard */
async function shareSchedule() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }

    const link = buildShareLink();
    try {
        if (navigator.share) {
            // Mobile: native share sheet (can also send the link via apps)
            await navigator.share({ title: 'برنامه هفتگی من', url: link });
            return;
        }
        await navigator.clipboard.writeText(link);
        showToast('لینک برنامه کپی شد', 'success');
    } catch (error) {
        if (error && error.name === 'AbortError') return; // user closed share sheet
        try {
            await navigator.clipboard.writeText(link);
            showToast('لینک برنامه کپی شد', 'success');
        } catch (e) {
            console.error('Error sharing link:', e);
            showToast('خطا در ساخت لینک', 'error');
        }
    }
}

/** Restore selections from a share link's #hash (returns true when applied) */
function restoreFromHash() {
    if (!location.hash || location.hash.length < 2) return false;
    try {
        const payload = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
        const ids = Array.isArray(payload.c) ? payload.c.filter(id => typeof id === 'string') : [];
        const valid = ids.filter(id => findCourseById(id));
        if (!valid.length) return false;

        state.selectedCourses = valid;
        saveSchedules();
        // Strip the hash so a refresh doesn't re-import the shared list
        history.replaceState(null, '', location.pathname + location.search);
        return true;
    } catch (error) {
        console.error('Invalid share link:', error);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE IMPORT/EXPORT (ورود و خروجی برنامه)
// Export the active tab's selection as JSON; import validates every
// entry against the active dataset (no hallucinated courses), shows
// conflicts for the user to resolve, then applies to the active tab.
// ═══════════════════════════════════════════════════════════════

const SCHEDULE_IO_FORMAT = 'unit-selection-schedule';
const SCHEDULE_IO_VERSION = 1;

/** Import previews build a model { resolved, rejected, conflicts, duplicates } kept here for apply */
let ioLastModel = null;

/** Convert Persian/Arabic-Indic digits in a string to Latin digits */
function faDigitsToLatin(str) {
    return String(str)
        .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x30))
        .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30));
}

/** Export slot -> file slot ({day,start,end,parity?}); parity label only when biweekly */
function slotToExport(slot) {
    const out = { day: slot.day, start: slot.start, end: slot.end };
    const parity = slotParityLabel(slot);
    if (parity) out.parity = parity;
    return out;
}

/** JSON of the current selection in the shareable format */
function buildExportJson() {
    return {
        format: SCHEDULE_IO_FORMAT,
        version: SCHEDULE_IO_VERSION,
        courses: state.selectedCourses
            .map(findCourseById)
            .filter(Boolean)
            .map(c => ({
                code: c.code,
                group: c.group,
                name: c.name,
                units: c.units,
                professor: c.professor,
                schedule: c.schedule.map(slotToExport)
            }))
    };
}

/** Refresh the export textarea from the current selection */
function exportIo() {
    elements.ioExportBox.value = JSON.stringify(buildExportJson(), null, 2);
}

/** Download the export as schedule.json */
function downloadIo() {
    const blob = new Blob([JSON.stringify(buildExportJson(), null, 2)],
        { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import: normalization + resolution against the live dataset ──

/** Normalize slot fields; invalid slot -> null.
 *  Accepts {day,start,end,parity?} objects or raw portal strings like
 *  "جلسه اول روز: پنجشنبه ساعت 14(هفته در میان به مدت 120 دقیقه در 0) شروع فرد"
 *  (parseSessionChunk handles the portal text format). */
function normalizeIoSlot(raw) {
    if (typeof raw === 'string') return parseSessionChunk(raw);
    if (!raw || typeof raw !== 'object') return null;
    const day = raw.day ? normalizeDay(String(raw.day)) : null;
    const start = faDigitsToLatin(String(raw.start ?? '')).trim();
    const end = faDigitsToLatin(String(raw.end ?? '')).trim();
    if (!day || !start || !end) return null;
    // Times must be HH:MM-ish; parseTime does the numeric validation
    if (!/^\d{1,2}(:\d{1,2})?$/.test(start) || !/^\d{1,2}(:\d{1,2})?$/.test(end)) return null;
    const parityRaw = String(raw.parity ?? '').trim();
    const parity = parityRaw.includes('زوج') ? 'even'
        : parityRaw.includes('فرد') ? 'odd' : null;
    const slot = { day, start, end, cadence: parity ? 'biweekly' : 'weekly', parity: parity || null };
    return parseTime(start) >= parseTime(end) ? null : slot;
}

/**
 * Mirror parseTableData field-shape from an imported entry, or null when the
 * entry's core fields (code/name) are unusable.
 */
function normalizeIoEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const code = faDigitsToLatin(String(raw.code ?? '')).trim();
    if (!code) return null;
    const name = String(raw.name ?? '').trim();
    const group = faDigitsToLatin(String(raw.group ?? '')).trim();
    const professor = String(raw.professor ?? '').trim();
    const units = parseFloat(faDigitsToLatin(String(raw.units ?? ''))) || 0;
    const slots = Array.isArray(raw.schedule)
        ? raw.schedule.map(normalizeIoSlot).filter(Boolean)
        : [];
    return { code, name, group, professor, units, slots };
}

/** Do entry slots and a real course's slots describe the same timetable? */
function slotsMatchIo(entrySlots, courseSlots) {
    if (entrySlots.length !== courseSlots.length) return false;
    return entrySlots.every(slot => courseSlots.some(or => {
        if (or.day !== slot.day) return false;
        if (parseTime(or.start) !== parseTime(slot.start)) return false;
        if (parseTime(or.end) !== parseTime(slot.end)) return false;
        const orParity = or.cadence === 'biweekly' ? (or.parity || 'both') : 'both';
        const inParity = slot.cadence === 'biweekly' ? (slot.parity || 'both') : 'both';
        return orParity === inParity;
    }));
}

/** Loose professor comparison: exact, or a full containment either way */
function professorMatches(a, b) {
    if (!a || !b) return true; // unknown on either side is not a mismatch
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
}

/**
 * Resolve one imported entry against the active dataset.
 * Strategy: code+group exact lookup first; verify units/professor/schedule of
 * the matched row. Mismatch on any core field rejects the entry — imported
 * data may never differ from the pre-loaded dataset.
 */
function resolveIoEntry(entry) {
    const pool = getActiveCourses();
    const byCode = pool.filter(c => c.code === entry.code);

    if (!byCode.length) {
        return { status: 'rejected', reason: 'کد درس در دیتای فعلی پیدا نشد' };
    }

    let candidates = byCode;
    if (entry.group) {
        const exact = byCode.filter(c => c.group === entry.group);
        if (!exact.length) {
            return { status: 'rejected', reason: `گروه ${entry.group} برای این کد ارائه نشده (گروه‌های موجود: ${byCode.map(c => c.group).join('، ')})` };
        }
        candidates = exact;
    }

    for (const c of candidates) {
        const unitsOk = !entry.units || Math.abs(c.units - entry.units) < 0.01;
        const profOk = professorMatches(c.professor, entry.professor || c.professor);
        const slotsOk = entry.slots.length === 0
            ? c.schedule.length === 0 // both no-time → consistent
            : slotsMatchIo(entry.slots, c.schedule);
        if (unitsOk && profOk && slotsOk) {
            if (!isCapacityAvailable(c)) {
                return { status: 'rejected', reason: 'ظرفیت این درس تکمیل شده است' };
            }
            return { status: 'resolved', course: c };
        }
    }

    // Diagnose the first candidate for a precise Persian reason
    const c = candidates[0];
    const problems = [];
    if (entry.units && Math.abs(c.units - entry.units) >= 0.01) {
        problems.push(`واحد (${entry.units} به‌جای ${c.units})`);
    }
    if (entry.professor && !professorMatches(c.professor, entry.professor)) {
        problems.push(`استاد (${entry.professor} به‌جای ${c.professor})`);
    }
    if (!slotsMatchIo(entry.slots, c.schedule)) {
        problems.push('زمان کلاس با دیتا مطابقت ندارد');
    }
    return { status: 'rejected', reason: 'اطلاعات درس با دیتای سایت یکی نیست: ' + problems.join('، ') };
}

/** Parse + normalize pasted text into a preview model */
function validateIoText(text) {
    ioLastModel = null;
    elements.ioPreview.innerHTML = '';
    elements.ioImportFooter.hidden = true;

    if (!text.trim()) {
        renderIoError('کادر ورودی خالی است.');
        return;
    }

    let payload;
    try {
        payload = JSON.parse(text.trim());
    } catch (e1) {
        // LLMs often wrap JSON in ``` fences — keep only the {...} span
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first >= 0 && last > first) {
            try { payload = JSON.parse(text.slice(first, last + 1)); } catch (e2) { payload = null; }
        } else {
            payload = null;
        }
    }

    if (!payload) {
        renderIoError('متن واردشده JSON معتبر نیست. خروجی مدل را کامل و بدون متن اضافه وارد کنید.');
        return;
    }

    if (payload.format !== SCHEDULE_IO_FORMAT) {
        renderIoError(`فرمت پشتیبانی نمی‌شود ("format" باید "${SCHEDULE_IO_FORMAT}" باشد).`);
        return;
    }
    if (payload.version !== SCHEDULE_IO_VERSION) {
        renderIoError(`نسخه فرمت پشتیبانی نمی‌شود (version باید ${SCHEDULE_IO_VERSION} باشد).`);
        return;
    }
    if (!Array.isArray(payload.courses) || payload.courses.length === 0) {
        renderIoError('لیست دروس خالی است ("courses" باید آرایه دروس باشد).');
        return;
    }

    // Normalize + dedupe: same code twice in one file → keep the first
    const entries = [];
    const rejected = [];
    const duplicates = [];
    for (const raw of payload.courses) {
        const entry = normalizeIoEntry(raw);
        if (!entry) {
            rejected.push({ entry: { name: '?', code: '—' }, reason: 'ساختار درس نامعتبر است (کد ندارد یا زمان‌ها خراب است)' });
            continue;
        }
        if (entries.some(e => e.code === entry.code)) {
            duplicates.push(entry.name || entry.code);
            continue;
        }
        entries.push(entry);
    }

    // Resolve each entry against the dataset
    const resolved = [];
    for (const entry of entries) {
        const result = resolveIoEntry(entry);
        if (result.status === 'resolved') resolved.push(result.course);
        else rejected.push({ entry, reason: result.reason });
    }

    // Conflict graph: import-vs-import pairs, then import-vs-current (add mode)
    const conflicts = [];
    for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
            const d = checkConflict(resolved[i], resolved[j]);
            if (d.hasConflict) conflicts.push({
                a: { source: 'import', ref: resolved[i] },
                b: { source: 'import', ref: resolved[j] },
                detail: d
            });
        }
    }
    resolved.forEach(course => {
        state.selectedCourses.map(findCourseById).filter(Boolean).forEach(current => {
            if (getCourseId(course) === getCourseId(current)) return; // same course, not a conflict
            const d = checkConflict(course, current);
            if (d.hasConflict) conflicts.push({
                a: { source: 'import', ref: course },
                b: { source: 'current', ref: current },
                detail: d
            });
        });
    });

    ioLastModel = { resolved, rejected, conflicts, duplicates };
    renderIoPreview(ioLastModel);
    showToast(
        resolved.length
            ? `${toPersianNumber(resolved.length)} درس معتبر${rejected.length ? `، ${toPersianNumber(rejected.length)} درس رد شد` : ''}`
            : 'هیچ درس معتبری پیدا نشد',
        resolved.length ? (rejected.length ? 'warning' : 'info') : 'error'
    );
}

/** Inline error box inside the preview area */
function renderIoError(message) {
    ioLastModel = null;
    elements.ioImportFooter.hidden = true;
    elements.ioPreview.innerHTML = `<div class="io-error">${escapeHtml(message)}</div>`;
}

/** Preview: pickable resolved courses, rejected rows, conflict radios */
function renderIoPreview(model) {
    const { resolved, rejected, conflicts, duplicates } = model;

    // Mode radios only matter when there is an existing program to interact with
    elements.ioModeRow.style.display = state.selectedCourses.length ? 'flex' : 'none';
    if (!state.selectedCourses.length) elements.ioModeAdd.checked = true;
    if (!elements.ioModeReplace.checked && !elements.ioModeAdd.checked) elements.ioModeAdd.checked = true;

    let html = '';

    if (duplicates && duplicates.length) {
        html += `<p class="io-note">تکراری نادیده گرفته شد: ${duplicates.map(escapeHtml).join('، ')}</p>`;
    }

    if (resolved.length) {
        html += `
        <div class="io-section resolves">
            <h4 class="io-section-title">✅ دروس قابل افزودن <span class="io-count">${toPersianNumber(resolved.length)}</span></h4>
            ${resolved.map((c, i) => renderIoCourseRow(c, i)).join('')}
        </div>`;
    }

    if (rejected.length) {
        html += `
        <div class="io-section rejects">
            <h4 class="io-section-title">⛔ دروس رد شده <span class="io-count">${toPersianNumber(rejected.length)}</span></h4>
            ${rejected.map(r => `
                <div class="io-reject-row">
                    <span class="io-reject-name">${escapeHtml(r.entry.name || 'درس بی‌نام')} ${r.entry.code ? `(کد ${toPersianNumber(r.entry.code)})` : ''}</span>
                    <span class="io-reject-reason">${escapeHtml(r.reason)}</span>
                </div>`).join('')}
        </div>`;
    }

    if (conflicts.length) {
        html += `
        <div class="io-section conflicts">
            <h4 class="io-section-title">⚠️ تداخل‌های زمانی <span class="io-count">${toPersianNumber(conflicts.length)}</span></h4>
            ${conflicts.map((cf, i) => renderIoConflictPair(cf, i)).join('')}
        </div>`;
    }

    if (!resolved.length && !rejected.length) {
        html += '<div class="io-error">هیچ درسی در فایل پیدا نشد.</div>';
    }

    elements.ioPreview.innerHTML = html;

    // Wire checkboxes/radios, then sync visibility of excluded rows
    elements.ioPreview.querySelectorAll('.io-course-row input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => refreshIoPreviewState());
    });
    elements.ioPreview.querySelectorAll(`input[name^="io-conflict-"]`).forEach(radio => {
        radio.addEventListener('change', () => refreshIoPreviewState());
    });
    refreshIoPreviewState();
}

/** One checkbox row of a resolvable import course */
function renderIoCourseRow(course) {
    const slots = course.schedule.length
        ? course.schedule.map(s => {
            const parity = slotParityLabel(s);
            return `<span class="io-slot-tag">${escapeHtml(s.day)} ${toPersianTime(s.start)}-${toPersianTime(s.end)}${parity ? ` (${parity})` : ''}</span>`;
        }).join('')
        : '<span class="io-slot-tag">بدون زمان‌بندی مشخص</span>';
    return `
        <label class="io-course-row" data-io-code="${escapeHtml(course.code)}">
            <input type="checkbox" checked data-io-code="${escapeHtml(course.code)}">
            <span class="io-course-main">
                <span class="io-course-name">${escapeHtml(course.name)}</span>
                <span class="io-course-meta">استاد: ${escapeHtml(course.professor)} • ${formatUnits(course.units)} واحد • گروه ${toPersianNumber(course.group)} • کد ${toPersianNumber(course.code)}</span>
                <span class="io-course-slots">${slots}</span>
            </span>
        </label>`;
}
// (unused index param dropped; callers pass only the course)

/** One conflict card with two radio options */
function renderIoConflictPair(cf, index) {
    const srcLabel = src => src === 'import'
        ? '<span class="io-opt-source import-src">فایل</span>'
        : '<span class="io-opt-source current-src">برنامه فعلی</span>';
    const opt = (side, iMin) => `
        <label class="io-conflict-option" data-io-side="${iMin ? 'b' : 'a'}" data-io-code="${escapeHtml(cf[iMin ? 'b' : 'a'].ref.code)}">
            <input type="radio" name="io-conflict-${index}" value="${iMin ? 'b' : 'a'}" ${iMin ? '' : 'checked'}>
            ${srcLabel(cf[iMin ? 'b' : 'a'].source)}
            <span>${escapeHtml(cf[iMin ? 'b' : 'a'].ref.name)} (گروه ${toPersianNumber(cf[iMin ? 'b' : 'a'].ref.group)})</span>
        </label>`;
    return `
        <div class="io-conflict-pair" data-io-pair="${index}">
            <p class="io-conflict-reason">روز ${escapeHtml(cf.detail.day)} — ساعت ${toPersianTime(cf.detail.time1)} با ${toPersianTime(cf.detail.time2)}</p>
            <div class="io-conflict-options">
                ${opt(cf.a, 0)}
                ${opt(cf.b, 1)}
            </div>
        </div>`;
}

/**
 * Recompute which resolved rows stay visible after each checkbox/radio change:
 * a conflict loser gets its row dimmed (kept visible so the user can switch).
 */
function refreshIoPreviewState() {
    if (!ioLastModel) return;
    const { conflicts } = ioLastModel;

    // Losers per conflict: side not chosen by its radio
    const losers = new Set(); // by resolved-course code; or code string of current course
    conflicts.forEach((cf, index) => {
        const radios = document.querySelectorAll(`input[name="io-conflict-${index}"]`);
        const chosen = Array.from(radios).find(r => r.checked);
        if (!chosen) return;
        const loserSide = chosen.value === 'a' ? 'b' : 'a';
        const loser = cf[loserSide];
        losers.add((loser.source === 'import' ? 'i:' : 'c:') + loser.ref.code);
    });

    // Dim excluded import rows: lost a conflict radio, or user unchecked
    elements.ioPreview.querySelectorAll('.io-course-row').forEach(row => {
        const code = row.dataset.ioCode;
        const box = row.querySelector('input[type="checkbox"]');
        const lostConflict = losers.has('i:' + code);
        row.classList.toggle('excluded', lostConflict || !box.checked);
    });

    updateIoApplyState();
}

/** Enable/disable the apply footer from the current preview state */
function updateIoApplyState() {
    const checked = elements.ioPreview.querySelectorAll('.io-course-row input[type="checkbox"]:checked');
    elements.ioImportFooter.hidden =
        !ioLastModel ||
        (!ioLastModel.resolved.length && !ioLastModel.rejected.length);
    const mode = elements.ioModeReplace.checked ? 'replace' : 'add';
    const anyPicks = mode === 'replace'
        ? checked.length > 0
        : checked.length > 0 || state.selectedCourses.length > 0;
    elements.btnIoApply.disabled = !anyPicks;
}

/** Compute the final course list from the preview and apply it to the ACTIVE tab */
function applyIoImport() {
    if (!ioLastModel) return;
    const { resolved, conflicts } = ioLastModel;
    const mode = elements.ioModeReplace.checked ? 'replace' : 'add';

    // Courses excluded by losing a conflict radio
    const lost = new Set();
    conflicts.forEach((cf, index) => {
        const chosen = document.querySelector(`input[name="io-conflict-${index}"]:checked`);
        if (!chosen) return;
        const loserSide = chosen.value === 'a' ? 'b' : 'a';
        const loser = cf[loserSide];
        lost.add(loser.ref.code);
    });

    // Checked resolved rows minus conflict losers
    const checked = new Map(
        Array.from(elements.ioPreview.querySelectorAll('.io-course-row input[type="checkbox"]:checked'))
            .map(box => [box.dataset.ioCode, true])
    );
    const finalIds = resolved
        .filter(c => checked.has(c.code) && !lost.has(c.code))
        .map(getCourseId);

    // Build the target list: replace = imports only; add = current + imports.
    // Same course code must never appear twice (addCourse rule: a course is
    // taken once regardless of group) — the NEW import wins over an old group.
    const base = mode === 'replace' ? [] : state.selectedCourses.slice();
    const target = base.map(id => findCourseById(id)).filter(Boolean);
    finalIds.forEach(id => {
        const course = findCourseById(id);
        if (!course) return;
        // drop any existing entry of the same code (including the exact same id)
        for (let i = target.length - 1; i >= 0; i--) {
            if (target[i].code === course.code) target.splice(i, 1);
        }
        target.push(course);
    });

    state.selectedCourses = target.map(getCourseId);

    saveSchedules(); // keeps the active tab + mirror key in sync
    state.unitsWarned = false;
    updateSummary();
    refreshLists();
    renderSchedule();
    renderScheduleTabs(); // tab count badges may change
    closeAllModals();
    ioLastModel = null;

    showToast(
        mode === 'replace'
            ? `برنامه جایگزین شد (${toPersianNumber(finalIds.length)} درس)`
            : `${toPersianNumber(finalIds.length)} درس به برنامه اضافه شد`,
        'success'
    );

    const total = getTotalUnits();
    if (total > CONFIG.MAX_UNITS) {
        showToast(`هشدار: جمع واحدها (${formatUnits(total)}) از ${toPersianNumber(CONFIG.MAX_UNITS)} واحد مجاز بیشتر شد!`, 'warning');
    }
}

// ── Modal open/close + tab switching ───────────────────────────

function exportIoOpen() {
    exportIo();
    setIoTab('export');
    elements.ioModal.classList.add('active');
}

function setIoTab(tab) {
    const isExport = tab === 'export';
    elements.tabIoExport.classList.toggle('active', isExport);
    elements.tabIoExport.setAttribute('aria-selected', String(isExport));
    elements.tabIoImport.classList.toggle('active', !isExport);
    elements.tabIoImport.setAttribute('aria-selected', String(!isExport));
    elements.paneIoExport.classList.toggle('active', isExport);
    elements.paneIoImport.classList.toggle('active', !isExport);
}

function setupIoFeature() {
    const open = () => exportIoOpen();
    if (elements.btnIo) elements.btnIo.addEventListener('click', open);
    if (elements.btnIoM) elements.btnIoM.addEventListener('click', open);

    elements.closeIoModal.addEventListener('click', closeAllModals);

    elements.tabIoExport.addEventListener('click', () => setIoTab('export'));
    elements.tabIoImport.addEventListener('click', () => setIoTab('import'));

    elements.btnIoCopy.addEventListener('click', async () => {
        try {
            exportIo();
            await navigator.clipboard.writeText(elements.ioExportBox.value);
            showToast('JSON برنامه کپی شد', 'success');
        } catch (e) {
            showToast('خطا در کپی کردن', 'error');
        }
    });

    elements.btnIoDownload.addEventListener('click', () => {
        if (!state.selectedCourses.length) {
            showToast('برنامه خالی است', 'warning');
            return;
        }
        downloadIo();
        showToast('فایل schedule.json دانلود شد', 'success');
    });

    elements.btnIoValidate.addEventListener('click', () => validateIoText(elements.ioPasteBox.value));

    elements.ioFileInput.addEventListener('change', () => {
        const file = elements.ioFileInput.files && elements.ioFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            elements.ioPasteBox.value = String(reader.result || '');
            validateIoText(elements.ioPasteBox.value);
        };
        reader.onerror = () => showToast('خطا در خواندن فایل', 'error');
        reader.readAsText(file, 'utf-8');
        elements.ioFileInput.value = ''; // allow re-picking the same file
    });

    elements.ioModeAdd.addEventListener('change', updateIoApplyState);
    elements.ioModeReplace.addEventListener('change', updateIoApplyState);
    elements.btnIoApply.addEventListener('click', applyIoImport);

    // Overlay/X close handled globally (closeAllModals + .modal-overlay click)
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>`;

    elements.toastContainer.appendChild(toast);

    // Warnings linger longer so the user has time to read them
    const duration = type === 'warning' ? CONFIG.TOAST_WARNING_DURATION : CONFIG.TOAST_DURATION;
    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ═══════════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');

    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
}

function loadTheme() {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
    // Mobile search modal
    elements.searchTrigger.addEventListener('click', () => setSearchModalOpen(true));
    elements.searchModalClose.addEventListener('click', () => setSearchModalOpen(false));
    elements.searchModal.addEventListener('click', (e) => {
        if (e.target === elements.searchModal) setSearchModalOpen(false);
    });

    // Live search inside the modal (results list is always visible there)
    elements.searchInput.addEventListener('input', () => showSearchResults(false));

    elements.searchClear.addEventListener('click', () => {
        elements.searchInput.value = '';
        showSearchResults(true);
        elements.searchInput.focus();
    });

    // Desktop panel search
    elements.panelSearch.addEventListener('input', renderPanelList);
    elements.panelSearchClear.addEventListener('click', () => {
        elements.panelSearch.value = '';
        renderPanelList();
        elements.panelSearch.focus();
    });

    // Desktop filter drawer (filters apply live — no apply button)
    elements.panelFilterToggle.addEventListener('click', () => setFilterDrawerOpen(!isFilterDrawerOpen()));
    elements.filterDrawerClose.addEventListener('click', () => setFilterDrawerOpen(false));

    // Controls
    elements.btnViewList.addEventListener('click', () => {
        renderSelectedList();
        elements.listModal.classList.add('active');
    });
    elements.btnCopyTable.addEventListener('click', copyToClipboard);
    elements.btnShareLink.addEventListener('click', shareSchedule);
    elements.btnCost.addEventListener('click', openCostModal);
    elements.btnExportPDF.addEventListener('click', exportPDF);
    elements.btnReset.addEventListener('click', resetSchedule);

    // Mobile floating action dock — same actions as the controls above
    elements.btnViewListM.addEventListener('click', () => {
        renderSelectedList();
        elements.listModal.classList.add('active');
    });
    elements.btnCopyTableM.addEventListener('click', copyToClipboard);
    elements.btnShareLinkM.addEventListener('click', shareSchedule);
    elements.btnCostM.addEventListener('click', openCostModal);
    elements.btnExportPDFM.addEventListener('click', exportPDF);
    elements.btnResetM.addEventListener('click', resetSchedule);
    elements.btnCustomDataM.addEventListener('click', () => {
        updateCustomDataStatus();
        elements.customDataModal.classList.add('active');
    });

    // Fit-whole-table toggle (mobile screenshot helper): schedule container
    // goes fullscreen with a transposed grid (hours as rows) that fits width.
    // Triggered from the schedule header button only.
    const exitFitMode = () => {
        if (!elements.scheduleContainer.classList.contains('fit-mode')) return;
        elements.scheduleContainer.classList.remove('fit-mode');
        elements.btnFitTable.classList.remove('active');
        elements.btnFitTable.setAttribute('aria-pressed', 'false');
        document.body.style.overflow = '';
        window.removeEventListener('resize', fitOnResize);
        renderSchedule(); // back to the normal day-rows / hour-columns grid
    };

    const applyFitScale = () => {
        // Transposed grid columns grow only as wide as their content needs,
        // so the table already fits the viewport — no transform squeezing.
        elements.scheduleContainer.style.removeProperty('--fit-scale');
    };

    const fitOnResize = () => applyFitScale();

    const toggleFitMode = () => {
        const active = elements.scheduleContainer.classList.toggle('fit-mode');
        elements.btnFitTable.classList.toggle('active', active);
        elements.btnFitTable.setAttribute('aria-pressed', String(active));

        if (active) {
            document.body.style.overflow = 'hidden';
            renderTransposedSchedule(); // swap to hours-as-rows grid
            applyFitScale();
            window.addEventListener('resize', fitOnResize);
        } else {
            exitFitMode();
        }
    };

    elements.btnFitTable.addEventListener('click', toggleFitMode);

    // Crossing the 1024px breakpoint re-renders so the table adopts the
    // per-breakpoint paddings/cell sizes. Grid orientation no longer
    // depends on the viewport — the normal grid is universal, fit-mode is
    // always transposed.
    const onViewportChange = () => {
        if (isFitMode()) return; // fit-mode keeps its transposed grid
        renderSchedule();
    };
    window.addEventListener('resize', onViewportChange);

    // Tap anywhere on the fullscreen overlay (outside the table) exits fit mode
    elements.scheduleContainer.addEventListener('click', (e) => {
        if (elements.scheduleContainer.classList.contains('fit-mode') &&
            !e.target.closest('.schedule-table') &&
            !e.target.closest('.fit-table-btn') &&
            !e.target.closest('.fit-close-btn')) {
            exitFitMode();
        }
    });

    document.getElementById('btnFitClose').addEventListener('click', exitFitMode);

    // External restore-default button in the custom-data banner
    elements.btnBannerRestoreDefault.addEventListener('click', restoreDefaultData);

    // Custom data modal
    elements.btnCustomData.addEventListener('click', () => {
        updateCustomDataStatus();
        elements.customDataModal.classList.add('active');
    });
    elements.btnLoadCustomData.addEventListener('click', () => {
        const text = elements.customDataInput.value;
        if (!text.trim()) {
            showToast('کادر دیتا خالی است', 'warning');
            return;
        }
        if (applyCustomData(text)) {
            elements.customDataModal.classList.remove('active');
        }
    });
    elements.btnRestoreDefault.addEventListener('click', () => {
        restoreDefaultData();
        elements.customDataModal.classList.remove('active');
    });

    // Custom-data modal tabs: import | guide
    // dl.dropboxusercontent.com + raw=1 → direct MP4 stream (no download page)
    const GUIDE_VIDEO_URL = 'https://dl.dropboxusercontent.com/scl/fi/am9w2tvohu6prl1056xaw/Custome-Data-low.mp4?rlkey=gi4mpqegaq71qet3ishulfr2k&st=an1qljhz&raw=1';
    const setCustomDataTab = (tab) => {
        const isGuide = tab === 'guide';
        elements.tabDataImport.classList.toggle('active', !isGuide);
        elements.tabDataImport.setAttribute('aria-selected', String(!isGuide));
        elements.tabDataGuide.classList.toggle('active', isGuide);
        elements.tabDataGuide.setAttribute('aria-selected', String(isGuide));
        elements.paneDataImport.classList.toggle('active', !isGuide);
        elements.paneDataGuide.classList.toggle('active', isGuide);
    };
    elements.tabDataImport.addEventListener('click', () => setCustomDataTab('import'));
    elements.tabDataGuide.addEventListener('click', () => setCustomDataTab('guide'));

    // Guide video: load lazily only when requested; pause when hidden
    let guideVideoLoaded = false;
    elements.btnGuideVideo.addEventListener('click', () => {
        elements.guideVideoWrap.hidden = false;
        if (!guideVideoLoaded) {
            elements.guideVideoFrame.src = GUIDE_VIDEO_URL;
            guideVideoLoaded = true;
        }
    });
    // Switching back to the import tab pauses playback
    elements.tabDataImport.addEventListener('click', () => {
        elements.guideVideoFrame.pause();
    });

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Modal close buttons
    elements.closeCourseModal.addEventListener('click', closeAllModals);
    elements.btnCloseCourseModal.addEventListener('click', closeAllModals);
    elements.closeListModal.addEventListener('click', closeAllModals);
    elements.btnCloseListModal.addEventListener('click', closeAllModals);
    elements.closeConflictModal.addEventListener('click', closeAllModals);
    elements.btnCloseConflictModal.addEventListener('click', closeAllModals);
    elements.closeCustomDataModal.addEventListener('click', closeAllModals);

    // Cost modal
    elements.closeCostModal.addEventListener('click', closeAllModals);
    elements.btnCloseCostModal.addEventListener('click', closeAllModals);
    elements.btnCopyCostScript.addEventListener('click', copyCostScript);

    // Data-freshness notice: close via X or footer button
    elements.closeFreshnessModal.addEventListener('click', closeAllModals);
    elements.btnCloseFreshness.addEventListener('click', closeAllModals);
    // Degree (مقطع) choice filters the whole active dataset live
    elements.degreeSelect.addEventListener('change', () => {
        state.degree = elements.degreeSelect.value;
        saveDegree(state.degree);
        populateDegreeSelect(); // keeps the chosen option selected
        updateSummary();
        rebuildFilterBars(); // professor dropdown follows the narrowed dataset
        refreshLists();
        renderSchedule();
    });
    // "Enter your own data" jumps straight to the custom-data modal
    elements.btnOpenCustomDataFreshness.addEventListener('click', () => {
        closeAllModals();
        elements.customDataModal.classList.add('active');
    });

    // Remove course button (info modal)
    elements.btnRemoveCourse.addEventListener('click', () => {
        if (state.currentModalCourse) {
            removeCourse(getCourseId(state.currentModalCourse));
        }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isFilterDrawerOpen()) {
                setFilterDrawerOpen(false);
            } else {
                closeAllModals();
            }
        }
    });

    // Reset search state when the mobile modal closes
    elements.searchModal.addEventListener('transitionend', () => {
        if (!isSearchModalOpen()) {
            elements.searchInput.value = '';
            showSearchResults(true);
        }
    });

    // Combo generator
    if (typeof setupComboGenerator === 'function') {
        setupComboGenerator();
    }

    // Import/Export (ورود و خروجی برنامه)
    setupIoFeature();
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

function initializeFooter() {
    elements.footerText.textContent = CONFIG.FOOTER_TEXT;
    elements.footerLink.textContent = CONFIG.FOOTER_LINK_TEXT;
    elements.footerLink.href = CONFIG.FOOTER_LINK;
}

async function init() {
    console.log('Initializing University Course Scheduler...');

    initializeScheduleTable();
    initializeFooter();
    loadTheme();

    // Restore persisted custom data (if any)
    const savedCustom = loadCustomData();
    if (savedCustom) {
        const courses = parseCourses(savedCustom);
        if (courses.length) {
            state.customCourses = courses;
            state.customActive = true;
        } else {
            clearCustomData();
        }
    }

    // Load fresh data from files (every page request)
    await Promise.all([loadCourses(), loadLastUpdate(), loadPrices()]);

    // Degree (مقطع) choice: restore the saved selection before lists render,
    // then fill the modal select from the degrees present in the data
    state.degree = loadSavedDegree();
    populateDegreeSelect();

    // Data-freshness notice: shown on every page load, after the last-update
    // date is known. Warns the data may be stale + points to custom-data import.
    if (state.customActive) {
        elements.freshnessLastUpdate.textContent = 'دیتای دلخواه شما';
    } else {
        elements.freshnessLastUpdate.textContent = elements.lastUpdateValue.textContent;
    }
    elements.freshnessModal.classList.add('active');

    // Restore schedule tabs first (seeds tab 1 from the legacy key on first run),
    // then import a share link into the active tab or load its saved selection
    loadSchedules();
    if (!restoreFromHash()) {
        loadFromStorage(); // no share link → load saved selections
    }
    syncSchedulesFromState();

    updateSummary();
    updateCustomDataStatus();
    renderPanelList();
    renderSchedule();
    renderScheduleTabs();

    // Build advanced filter bars (mobile search + desktop drawer)
    rebuildFilterBars();

    setupEventListeners();

    console.log('Initialization complete!');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
