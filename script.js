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
    FOOTER_TEXT: 'سیستم پیش‌انتخاب واحد دانشگاه سجاد - در صورت مشابه باگ به آدرس زیر مراجعه کنید',
    FOOTER_LINK: 'https://AmousaviNezhod.github.io/links',
    FOOTER_LINK_TEXT: 'ساخته شده توسط سید امیرحسین موسوی نژاد',

    // Data sources (read fresh on every page load)
    COURSES_FILE: 'data/courses.txt',
    FALLBACK_COURSES_FILE: 'example.txt',
    LAST_UPDATE_FILE: 'data/last-update.txt',

    // LocalStorage keys
    STORAGE_KEY: 'university_scheduler_selected_courses',
    CUSTOM_DATA_KEY: 'university_scheduler_custom_data',

    // Schedule settings
    DAYS: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه'],
    HOURS: Array.from({ length: 14 }, (_, i) => i + 7), // 7 to 20

    // Units
    MAX_UNITS: 20,

    // Search settings
    INITIAL_COURSE_COUNT: 10,

    // Course block palette (cycled by course index)
    PALETTE: [
        '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
        '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
        '#84cc16', '#a855f7'
    ],

    // Toast duration
    TOAST_DURATION: 3000
};

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const state = {
    defaultCourses: [],     // From data/courses.txt
    customCourses: [],      // From user-pasted HTML table
    customActive: false,    // True when custom dataset is active
    selectedCourses: [],    // Selected course IDs (code-group)
    currentModalCourse: null,
    currentHours: CONFIG.HOURS, // Hours currently rendered on grid
    unitsWarned: false      // To avoid repeating the >20 units toast
};

/** Active dataset (custom overrides default) */
function getActiveCourses() {
    return state.customActive ? state.customCourses : state.defaultCourses;
}

/** Courses listed in pickers: active ones + (disabled) default ones when custom is active */
function getListCourses() {
    if (!state.customActive) return state.defaultCourses;
    return [...state.customCourses, ...state.defaultCourses];
}

/** Is a course selectable? */
function isSelectable(course) {
    return state.customActive
        ? state.customCourses.some(c => getCourseId(c) === getCourseId(course))
        : true;
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

    // Controls
    btnViewList: document.getElementById('btnViewList'),
    btnCopyTable: document.getElementById('btnCopyTable'),
    btnExportPDF: document.getElementById('btnExportPDF'),
    btnCustomData: document.getElementById('btnCustomData'),
    btnReset: document.getElementById('btnReset'),

    // Schedule
    scheduleBody: document.getElementById('scheduleBody'),
    scheduleTable: document.getElementById('scheduleTable'),
    scheduleContainer: document.getElementById('scheduleContainer'),

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

    // Conflict modal
    conflictModal: document.getElementById('conflictModal'),
    conflictMessage: document.getElementById('conflictMessage'),
    closeConflictModal: document.getElementById('closeConflictModal'),
    btnCloseConflictModal: document.getElementById('btnCloseConflictModal'),

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

/** Check if two courses have schedule conflicts */
function checkConflict(course1, course2) {
    for (const slot1 of course1.schedule) {
        for (const slot2 of course2.schedule) {
            if (slot1.day === slot2.day && hasTimeOverlap(slot1.start, slot1.end, slot2.start, slot2.end)) {
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
    return { day: normalizeDay(dayMatch[0]), start: minutesToTime(startMin), end: minutesToTime(endMin) };
}

/**
 * Extract weekly sessions from the info tooltip.
 * Portal format (one per session):
 *   "<b>جلسه اول روز:</b> شنبه ساعت 12(هر هفته به مدت 180 دقیقه در کلاس 0)"
 * Handles جلسه اول / دوم / سوم ... individually.
 * "ساعت 6 (به مدت 0 دقیقه)" => no fixed class time (project/internship)
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

        let professor = cells[8] ? cells[8].textContent.replace(/\u00a0/g, ' ').trim() : '';
        professor = professor.replace(/^-\s*/, '').trim() || 'نامعلوم';

        const capacity = cells[6] ? parseInt(cells[6].textContent.trim(), 10) || 0 : 0;
        const registered = cells[5] ? parseInt(cells[5].textContent.trim(), 10) || 0 : 0;

        const infoImg = row.querySelector('img[title]');
        const schedule = infoImg ? parseScheduleFromInfo(infoImg.getAttribute('title')) : [];

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
    saveToStorage();
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

function filterCourses(query) {
    const normalizedQuery = (query || '').trim();
    if (!normalizedQuery) {
        return { list: getListCourses(), initial: true };
    }
    // Normalize Persian digits in query to latin
    const q = normalizedQuery
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    return { list: getListCourses().filter(c => matchesQuery(c, q)), initial: false };
}

function scheduleTagsHtml(course) {
    if (!course.schedule.length) {
        return '<span class="schedule-tag muted">بدون زمان‌بندی مشخص</span>';
    }
    return course.schedule.map(s =>
        `<span class="schedule-tag">${escapeHtml(s.day)} ${toPersianTime(s.start)}-${toPersianTime(s.end)}</span>`
    ).join('');
}

/** Build a course card (shared by panel + mobile search) */
function courseCardHtml(course) {
    const courseId = getCourseId(course);
    const isSelected = state.selectedCourses.includes(courseId);
    const selectable = isSelectable(course);

    const badge = !selectable
        ? '<span class="course-badge default-badge">پیش‌فرض</span>'
        : '';

    const btn = isSelected
        ? `<button class="btn-add-course selected" data-course-id="${courseId}">✓ اضافه شده - حذف</button>`
        : (selectable
            ? `<button class="btn-add-course" data-course-id="${courseId}" ${course.schedule.length ? '' : 'data-no-time="1"'}>+ افزودن به برنامه</button>`
            : `<button class="btn-add-course" disabled>غیرفعال</button>`);

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
        : `${toPersianNumber(courses.length)} نتیجه`;

    elements.resultsList.innerHTML = courses.map(courseCardHtml).join('');
    bindCardButtons(elements.resultsList);
}

function showSearchResults(isInitial = false) {
    const { list, initial } = filterCourses(elements.searchInput.value);
    renderSearchResults(list, isInitial && initial);
    elements.searchResults.classList.add('active');
    elements.searchClear.classList.add('visible');
}

function hideSearchResults() {
    setTimeout(() => elements.searchResults.classList.remove('active'), 200);
}

/** Desktop panel list */
function renderPanelList() {
    const { list } = filterCourses(elements.panelSearch.value);

    elements.panelCount.textContent = toPersianNumber(
        `${state.selectedCourses.length}/${state.defaultCourses.length + state.customCourses.length}`
    );

    if (!list.length) {
        elements.panelList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>نتیجه‌ای یافت نشد</p>
            </div>`;
        return;
    }

    elements.panelList.innerHTML = list.map(courseCardHtml).join('');
    bindCardButtons(elements.panelList);
}

/** Refresh every course list view */
function refreshLists() {
    renderPanelList();
    if (elements.searchResults.classList.contains('active')) {
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

    // Block time conflicts
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
    saveToStorage();
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
    saveToStorage();
    updateSummary();
    refreshLists();
    renderSchedule();
    closeAllModals();

    if (course) showToast(`درس "${course.name}" حذف شد`, 'info');
}

function resetSchedule() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }

    if (confirm('آیا مطمئن هستید که می‌خواهید تمام دروس را حذف کنید؟')) {
        state.selectedCourses = [];
        state.unitsWarned = false;
        saveToStorage();
        updateSummary();
        refreshLists();
        renderSchedule();
        showToast('برنامه ریست شد', 'info');
    }
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
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE RENDERING - MULTI-HOUR SPANNING (RTL aware)
// ═══════════════════════════════════════════════════════════════

function initializeScheduleTable() {
    state.currentHours = CONFIG.HOURS;
    buildScheduleTable(CONFIG.HOURS);
}

function renderSchedule() {
    const hours = getScheduleHours();
    if (JSON.stringify(hours) !== JSON.stringify(state.currentHours)) {
        state.currentHours = hours;
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

function renderCourseBlock(course, slot) {
    const startTime = parseTime(slot.start);
    const endTime = parseTime(slot.end);
    const startHour = Math.floor(startTime);
    const duration = endTime - startTime;
    if (duration <= 0) return;

    const startCell = elements.scheduleBody.querySelector(
        `tr[data-day="${slot.day}"] td[data-hour="${startHour}"]`
    );
    if (!startCell) return;

    const block = document.createElement('div');
    block.className = 'course-block';
    block.style.backgroundColor = course.color;
    block.dataset.courseId = getCourseId(course);

    // RTL: time flows right-to-left, anchor to the RIGHT edge of the cell
    const offsetPercent = ((startTime - startHour) / 1) * 100;

    block.style.right = `${offsetPercent}%`;
    block.style.width = `${duration * 100}%`;

    block.innerHTML = `
        <span class="course-block-name">${escapeHtml(course.name)}</span>
        <span class="course-block-time">${toPersianTime(slot.start)}-${toPersianTime(slot.end)}</span>
        <span class="course-block-group">گروه ${toPersianNumber(course.group)}</span>
    `;

    block.addEventListener('click', () => showCourseModal(course));
    startCell.appendChild(block);
}

// ═══════════════════════════════════════════════════════════════
// MODAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function showCourseModal(course) {
    state.currentModalCourse = course;

    const scheduleHtml = course.schedule.length
        ? course.schedule.map(s => `
            <div class="schedule-item">
                <span class="schedule-item-day">${escapeHtml(s.day)}</span>
                <span class="schedule-item-time">${toPersianTime(s.start)} - ${toPersianTime(s.end)}</span>
            </div>`).join('')
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
            ? course.schedule.map(s => `${escapeHtml(s.day)} ${toPersianTime(s.start)}-${toPersianTime(s.end)}`).join('، ')
            : 'بدون زمان‌بندی مشخص';

        return `
            <div class="selected-item">
                <div class="selected-item-info">
                    <span class="selected-item-name">${escapeHtml(course.name)}</span>
                    <span class="selected-item-meta">
                        ${escapeHtml(course.professor)} | ${formatUnits(course.units)} واحد | گروه ${toPersianNumber(course.group)} | کد ${toPersianNumber(course.code)}<br>
                        ${scheduleText}
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

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    state.currentModalCourse = null;
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

    // Old (default) selections are no longer valid
    pruneSelections(state.customCourses);
    state.unitsWarned = getTotalUnits() > CONFIG.MAX_UNITS;

    updateSummary();
    updateCustomDataStatus();
    refreshLists();
    renderSchedule();

    if (!silent) showToast(`دیتای دلخواه بارگذاری شد (${toPersianNumber(courses.length)} درس)`, 'success');
    return true;
}

function restoreDefaultData() {
    state.customCourses = [];
    state.customActive = false;
    clearCustomData();

    pruneSelections(state.defaultCourses);
    state.unitsWarned = getTotalUnits() > CONFIG.MAX_UNITS;

    updateSummary();
    updateCustomDataStatus();
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

        // Light wrapper so the table is exported dark-on-white regardless of theme
        const wrapper = document.createElement('div');
        wrapper.className = 'light-mode';
        wrapper.style.cssText = `
            position: fixed; left: -9999px; top: 0; width: 1320px;
            padding: 24px; background: #ffffff;
            font-family: 'Vazirmatn', sans-serif; direction: rtl;`;

        const totalUnits = getTotalUnits();
        wrapper.innerHTML = `
            <div style="text-align: center; margin-bottom: 14px;">
                <h1 style="font-size: 22px; margin: 0 0 6px;">پیش‌انتخاب واحد - جدول زمان‌بندی</h1>
                <p style="font-size: 12px; color: #666; margin: 0;">
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

        const canvas = await html2canvas(wrapper, {
            backgroundColor: '#ffffff',
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

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
    }, CONFIG.TOAST_DURATION);
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
    // Mobile search
    elements.searchInput.addEventListener('input', () => showSearchResults(false));
    elements.searchInput.addEventListener('focus', () => {
        showSearchResults(!elements.searchInput.value.trim());
    });
    elements.searchInput.addEventListener('blur', hideSearchResults);

    elements.searchClear.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.searchResults.classList.remove('active');
        elements.searchClear.classList.remove('visible');
        elements.searchInput.focus();
    });

    // Desktop panel search
    elements.panelSearch.addEventListener('input', renderPanelList);
    elements.panelSearchClear.addEventListener('click', () => {
        elements.panelSearch.value = '';
        renderPanelList();
        elements.panelSearch.focus();
    });

    // Controls
    elements.btnViewList.addEventListener('click', () => {
        renderSelectedList();
        elements.listModal.classList.add('active');
    });
    elements.btnCopyTable.addEventListener('click', copyToClipboard);
    elements.btnExportPDF.addEventListener('click', exportPDF);
    elements.btnReset.addEventListener('click', resetSchedule);

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
        if (e.key === 'Escape') closeAllModals();
    });
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
    await Promise.all([loadCourses(), loadLastUpdate()]);

    // Restore + validate selections against the active dataset
    loadFromStorage();

    updateSummary();
    updateCustomDataStatus();
    renderPanelList();
    setupEventListeners();

    console.log('Initialization complete!');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
