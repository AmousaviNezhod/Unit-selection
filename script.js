/**
 * ═══════════════════════════════════════════════════════════════
 * UNIVERSITY COURSE SCHEDULER - MAIN SCRIPT
 * ═══════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Course search with real-time filtering
 * - Schedule visualization with time blocks (multi-hour spanning)
 * - Conflict detection
 * - LocalStorage persistence
 * - PDF export (with Persian support via image capture)
 * - Copy to clipboard
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    // Footer configuration - easily editable
    FOOTER_TEXT: 'سیستم پیش‌انتخاب واحد دانشگاه سجاد - در صورت مشابه باگ به آدرس زیر مراجعه کنید',
    FOOTER_LINK: 'https://AmousaviNezhod.github.io/links',
    FOOTER_LINK_TEXT: 'ساخته شده توسط سید امیرحسین موسوی نژاد',
    
    // Data source
    COURSES_FILE: 'data/courses.txt',
    
    // LocalStorage key
    STORAGE_KEY: 'university_scheduler_selected_courses',
    
    // Schedule settings
    DAYS: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه'],
    HOURS: Array.from({ length: 14 }, (_, i) => i + 7), // 7 to 20
    
    // Search settings
    INITIAL_COURSE_COUNT: 10,
    
    // Toast duration
    TOAST_DURATION: 3000
};

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const state = {
    courses: [],           // All available courses
    selectedCourses: [],   // Currently selected course IDs
    searchQuery: '',       // Current search query
    currentModalCourse: null // Course currently shown in modal
};

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════

const elements = {
    // Search
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchResults: document.getElementById('searchResults'),
    resultsCount: document.getElementById('resultsCount'),
    resultsList: document.getElementById('resultsList'),
    
    // Summary
    selectedCount: document.getElementById('selectedCount'),
    totalUnits: document.getElementById('totalUnits'),
    
    // Controls
    btnViewList: document.getElementById('btnViewList'),
    btnCopyTable: document.getElementById('btnCopyTable'),
    btnExportPDF: document.getElementById('btnExportPDF'),
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
    
    // Modals
    courseModal: document.getElementById('courseModal'),
    courseModalBody: document.getElementById('courseModalBody'),
    closeCourseModal: document.getElementById('closeCourseModal'),
    btnCloseCourseModal: document.getElementById('btnCloseCourseModal'),
    btnRemoveCourse: document.getElementById('btnRemoveCourse'),
    
    listModal: document.getElementById('listModal'),
    selectedList: document.getElementById('selectedList'),
    closeListModal: document.getElementById('closeListModal'),
    btnCloseListModal: document.getElementById('btnCloseListModal'),
    
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

/**
 * Parse time string (HH:MM) to hour number with minutes as decimal
 * e.g., "10:30" -> 10.5
 */
function parseTime(timeStr) {
    const [hours, minutes = 0] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
}

/**
 * Format time for display
 */
function formatTime(timeNum) {
    const hours = Math.floor(timeNum);
    const minutes = Math.round((timeNum - hours) * 60);
    return minutes === 0 ? `${hours}:00` : `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Check if two time ranges overlap
 */
function hasTimeOverlap(start1, end1, start2, end2) {
    const s1 = parseTime(start1);
    const e1 = parseTime(end1);
    const s2 = parseTime(start2);
    const e2 = parseTime(end2);
    return s1 < e2 && s2 < e1;
}

/**
 * Check if two courses have schedule conflicts
 */
function checkConflict(course1, course2) {
    for (const slot1 of course1.schedule) {
        for (const slot2 of course2.schedule) {
            if (slot1.day === slot2.day) {
                if (hasTimeOverlap(slot1.start, slot1.end, slot2.start, slot2.end)) {
                    return {
                        hasConflict: true,
                        day: slot1.day,
                        time1: `${slot1.start}-${slot1.end}`,
                        time2: `${slot2.start}-${slot2.end}`
                    };
                }
            }
        }
    }
    return { hasConflict: false };
}

/**
 * Generate unique ID for a course (code + group)
 */
function getCourseId(course) {
    return `${course.code}-${course.group}`;
}

/**
 * Find course by ID
 */
function findCourseById(courseId) {
    return state.courses.find(c => getCourseId(c) === courseId);
}

/**
 * Format number with Persian digits
 */
function toPersianNumber(num) {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return num.toString().replace(/\d/g, d => persianDigits[parseInt(d)]);
}

/**
 * Convert time to Persian format
 */
function toPersianTime(timeStr) {
    return timeStr.replace(/\d/g, d => toPersianNumber(d));
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING & PARSING
// ═══════════════════════════════════════════════════════════════

/**
 * Parse courses from text file content
 */
function parseCourses(text) {
    const courses = [];
    const blocks = text.split(/(?=# )/).filter(block => block.trim().startsWith('#'));
    
    for (const block of blocks) {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
        
        const course = {
            title: '',
            code: '',
            name: '',
            units: 0,
            professor: '',
            group: 1,
            color: '#1a1a1a',
            schedule: []
        };
        
        for (const line of lines) {
            if (line.startsWith('#')) {
                course.title = line.replace('#', '').trim();
            } else if (line.startsWith('کد:')) {
                course.code = line.replace('کد:', '').trim();
            } else if (line.startsWith('نام:')) {
                course.name = line.replace('نام:', '').trim();
            } else if (line.startsWith('واحد:')) {
                course.units = parseInt(line.replace('واحد:', '').trim()) || 0;
            } else if (line.startsWith('استاد:')) {
                course.professor = line.replace('استاد:', '').trim();
            } else if (line.startsWith('گروه:')) {
                course.group = parseInt(line.replace('گروه:', '').trim()) || 1;
            } else if (line.startsWith('رنگ:')) {
                course.color = line.replace('رنگ:', '').trim();
            } else if (line.includes(';')) {
                const [day, start, end] = line.split(';').map(s => s.trim());
                if (day && start && end) {
                    course.schedule.push({ day, start, end });
                }
            }
        }
        
        if (course.code && course.name) {
            courses.push(course);
        }
    }
    
    return courses;
}

/**
 * Load courses from file
 */
async function loadCourses() {
    try {
        const response = await fetch(CONFIG.COURSES_FILE);
        if (!response.ok) throw new Error('Failed to load courses');
        
        const text = await response.text();
        state.courses = parseCourses(text);
        
        console.log(`Loaded ${state.courses.length} courses`);
    } catch (error) {
        console.error('Error loading courses:', error);
        showToast('خطا در بارگذاری دروس', 'error');
        
        // Load fallback data
        loadFallbackCourses();
    }
}

/**
 * Fallback courses data if file fails to load
 */
function loadFallbackCourses() {
    state.courses = [
        {
            code: '312011',
            name: 'آزمایشگاه نرم افزارهای گرافیکی',
            units: 1,
            professor: 'فاطمه نعمتی',
            group: 1,
            color: '#1a1a1a',
            schedule: [{ day: 'چهارشنبه', start: '10:00', end: '12:00' }]
        },
        {
            code: '312045',
            name: 'پایگاه داده',
            units: 3,
            professor: 'دکتر محمدرضا شعبانعلی',
            group: 1,
            color: '#2d2d2d',
            schedule: [
                { day: 'شنبه', start: '08:00', end: '10:00' },
                { day: 'دوشنبه', start: '08:00', end: '10:00' }
            ]
        },
        {
            code: '312067',
            name: 'هوش مصنوعی',
            units: 3,
            professor: 'دکتر سعید شیری',
            group: 1,
            color: '#3d3d3d',
            schedule: [
                { day: 'یکشنبه', start: '10:00', end: '12:00' },
                { day: 'سه‌شنبه', start: '10:00', end: '12:00' }
            ]
        }
    ];
}

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════

/**
 * Save selected courses to localStorage
 */
function saveToStorage() {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.selectedCourses));
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

/**
 * Load selected courses from localStorage
 */
function loadFromStorage() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            state.selectedCourses = JSON.parse(saved);
            updateSummary();
            renderSchedule();
        }
    } catch (error) {
        console.error('Error loading from storage:', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// SEARCH FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════

/**
 * Filter courses based on search query
 * Returns all matching courses (no limit when searching)
 */
function filterCourses(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    if (!normalizedQuery) {
        // Return first N courses when no query (for initial display)
        return state.courses.slice(0, CONFIG.INITIAL_COURSE_COUNT);
    }
    
    return state.courses.filter(course => {
        const nameMatch = course.name.toLowerCase().includes(normalizedQuery);
        const professorMatch = course.professor.toLowerCase().includes(normalizedQuery);
        const codeMatch = course.code.includes(normalizedQuery);
        return nameMatch || professorMatch || codeMatch;
    });
}

/**
 * Render search results
 */
function renderSearchResults(courses, isInitial = false) {
    if (courses.length === 0) {
        elements.resultsCount.textContent = 'نتیجه‌ای یافت نشد';
        elements.resultsList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>درسی با این مشخصات یافت نشد</p>
            </div>
        `;
        return;
    }
    
    const countText = isInitial 
        ? `${toPersianNumber(courses.length)} درس اول` 
        : `${toPersianNumber(courses.length)} نتیجه`;
    elements.resultsCount.textContent = countText;
    
    elements.resultsList.innerHTML = courses.map(course => {
        const courseId = getCourseId(course);
        const isSelected = state.selectedCourses.includes(courseId);
        
        const scheduleHtml = course.schedule.map(s => 
            `<span class="schedule-tag">${s.day} ${toPersianTime(s.start)}-${toPersianTime(s.end)}</span>`
        ).join('');
        
        return `
            <div class="course-result" data-course-id="${courseId}">
                <div class="course-result-header">
                    <span class="course-result-name">${course.name}</span>
                    <span class="course-result-code">${course.code}</span>
                </div>
                <div class="course-result-meta">
                    <span>استاد: ${course.professor}</span>
                    <span>${toPersianNumber(course.units)} واحد</span>
                    <span>گروه ${toPersianNumber(course.group)}</span>
                </div>
                <div class="course-result-schedule">
                    ${scheduleHtml}
                </div>
                <button class="btn-add-course" ${isSelected ? 'disabled' : ''} data-course-id="${courseId}">
                    ${isSelected ? '✓ اضافه شده' : '+ افزودن به برنامه'}
                </button>
            </div>
        `;
    }).join('');
    
    // Add event listeners to add buttons
    elements.resultsList.querySelectorAll('.btn-add-course').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const courseId = btn.dataset.courseId;
            addCourse(courseId);
        });
    });
}

/**
 * Show search results dropdown
 * @param {boolean} isInitial - Whether this is initial load (show first 10)
 */
function showSearchResults(isInitial = false) {
    const query = elements.searchInput.value;
    const filtered = filterCourses(query);
    renderSearchResults(filtered, isInitial && !query.trim());
    elements.searchResults.classList.add('active');
    elements.searchClear.classList.add('visible');
}

/**
 * Hide search results dropdown
 */
function hideSearchResults() {
    setTimeout(() => {
        elements.searchResults.classList.remove('active');
    }, 200);
}

// ═══════════════════════════════════════════════════════════════
// COURSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Add a course to the schedule
 */
function addCourse(courseId) {
    const course = findCourseById(courseId);
    if (!course) return;
    
    // Check if already selected
    if (state.selectedCourses.includes(courseId)) {
        showToast('این درس قبلاً اضافه شده است', 'warning');
        return;
    }
    
    // Check for conflicts with existing courses
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
    
    // Add course
    state.selectedCourses.push(courseId);
    saveToStorage();
    updateSummary();
    renderSchedule();
    renderSearchResults(filterCourses(elements.searchInput.value), !elements.searchInput.value.trim());
    
    showToast(`درس "${course.name}" اضافه شد`, 'success');
}

/**
 * Remove a course from the schedule
 */
function removeCourse(courseId) {
    const index = state.selectedCourses.indexOf(courseId);
    if (index === -1) return;
    
    const course = findCourseById(courseId);
    
    state.selectedCourses.splice(index, 1);
    saveToStorage();
    updateSummary();
    renderSchedule();
    
    // Update search results if visible
    if (elements.searchResults.classList.contains('active')) {
        renderSearchResults(filterCourses(elements.searchInput.value), !elements.searchInput.value.trim());
    }
    
    // Update list modal if open
    if (elements.listModal.classList.contains('active')) {
        renderSelectedList();
    }
    
    closeAllModals();
    
    if (course) {
        showToast(`درس "${course.name}" حذف شد`, 'info');
    }
}

/**
 * Reset all selected courses
 */
function resetSchedule() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }
    
    if (confirm('آیا مطمئن هستید که می‌خواهید تمام دروس را حذف کنید؟')) {
        state.selectedCourses = [];
        saveToStorage();
        updateSummary();
        renderSchedule();
        
        if (elements.searchResults.classList.contains('active')) {
            renderSearchResults(filterCourses(elements.searchInput.value), !elements.searchInput.value.trim());
        }
        
        showToast('برنامه ریست شد', 'info');
    }
}

/**
 * Update summary display
 */
function updateSummary() {
    const totalCourses = state.selectedCourses.length;
    const totalUnits = state.selectedCourses.reduce((sum, courseId) => {
        const course = findCourseById(courseId);
        return sum + (course ? course.units : 0);
    }, 0);
    
    elements.selectedCount.textContent = toPersianNumber(totalCourses);
    elements.totalUnits.textContent = toPersianNumber(totalUnits);
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE RENDERING - WITH MULTI-HOUR SPANNING
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize schedule table structure
 */
function initializeScheduleTable() {
    elements.scheduleBody.innerHTML = '';
    
    CONFIG.DAYS.forEach(day => {
        const row = document.createElement('tr');
        row.className = 'day-row';
        row.dataset.day = day;
        
        // Day header cell
        const dayCell = document.createElement('th');
        dayCell.textContent = day;
        row.appendChild(dayCell);
        
        // Hour cells
        CONFIG.HOURS.forEach(hour => {
            const cell = document.createElement('td');
            cell.dataset.hour = hour;
            cell.dataset.day = day;
            row.appendChild(cell);
        });
        
        elements.scheduleBody.appendChild(row);
    });
}

/**
 * Render course blocks on schedule
 */
function renderSchedule() {
    // Clear all existing blocks
    elements.scheduleBody.querySelectorAll('.course-block').forEach(el => el.remove());
    
    // Track occupied cells to avoid overlapping
    const occupiedCells = new Set();
    
    // Render each selected course
    state.selectedCourses.forEach(courseId => {
        const course = findCourseById(courseId);
        if (!course) return;
        
        course.schedule.forEach(slot => {
            renderCourseBlock(course, slot, occupiedCells);
        });
    });
}

/**
 * Render a single course block with proper multi-hour spanning
 */
function renderCourseBlock(course, slot, occupiedCells) {
    const startTime = parseTime(slot.start);
    const endTime = parseTime(slot.end);
    const startHour = Math.floor(startTime);
    const duration = endTime - startTime;
    
    // Find the starting cell
    const startCell = elements.scheduleBody.querySelector(
        `tr[data-day="${slot.day}"] td[data-hour="${startHour}"]`
    );
    
    if (!startCell) return;
    
    // Check if this cell is already occupied
    const cellKey = `${slot.day}-${startHour}`;
    if (occupiedCells.has(cellKey)) {
        console.warn(`Cell ${cellKey} is already occupied`);
        return;
    }
    
    // Mark cells as occupied for the duration of this course
    for (let h = startHour; h < endTime; h++) {
        occupiedCells.add(`${slot.day}-${h}`);
    }
    
    // Create the block
    const block = document.createElement('div');
    block.className = 'course-block';
    block.style.backgroundColor = course.color;
    block.dataset.courseId = getCourseId(course);
    
    // Calculate position and size
    // Each hour cell is treated as 1 unit
    // The block spans from startTime to endTime within the row
    const cellWidth = startCell.offsetWidth;
    const cellHeight = startCell.offsetHeight;
    
    // Position relative to the starting cell
    const offsetMinutes = (startTime - startHour) * 60;
    const offsetPercent = offsetMinutes / 60 * 100;
    
    block.style.cssText = `
        position: absolute;
        left: ${offsetPercent}%;
        width: ${duration * 100}%;
        top: 2px;
        height: calc(100% - 4px);
        background-color: ${course.color};
        border-radius: 4px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 4px;
        cursor: pointer;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    
    block.innerHTML = `
        <span class="course-block-name" style="font-size: 11px; font-weight: 600; color: white; text-align: center; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${course.name}</span>
        <span class="course-block-time" style="font-size: 10px; color: rgba(255,255,255,0.8);">${toPersianTime(slot.start)}-${toPersianTime(slot.end)}</span>
        <span class="course-block-group" style="font-size: 9px; color: rgba(255,255,255,0.7); background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 2px;">گروه ${toPersianNumber(course.group)}</span>
    `;
    
    block.addEventListener('click', () => {
        showCourseModal(course);
    });
    
    // Make the cell position relative to contain the absolute block
    startCell.style.position = 'relative';
    startCell.appendChild(block);
}

// ═══════════════════════════════════════════════════════════════
// MODAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Show course info modal
 */
function showCourseModal(course) {
    state.currentModalCourse = course;
    
    const scheduleHtml = course.schedule.map(s => `
        <div class="schedule-item">
            <span class="schedule-item-day">${s.day}</span>
            <span class="schedule-item-time">${toPersianTime(s.start)} - ${toPersianTime(s.end)}</span>
        </div>
    `).join('');
    
    elements.courseModalBody.innerHTML = `
        <div class="course-info-grid">
            <div class="course-info-item">
                <span class="course-info-label">نام درس</span>
                <span class="course-info-value">${course.name}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">کد درس</span>
                <span class="course-info-value">${course.code}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">استاد</span>
                <span class="course-info-value">${course.professor}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">تعداد واحد</span>
                <span class="course-info-value">${toPersianNumber(course.units)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">گروه</span>
                <span class="course-info-value">${toPersianNumber(course.group)}</span>
            </div>
            <div class="course-info-item">
                <span class="course-info-label">برنامه هفتگی</span>
                <div class="course-schedule-list">
                    ${scheduleHtml}
                </div>
            </div>
        </div>
    `;
    
    elements.courseModal.classList.add('active');
}

/**
 * Show conflict modal
 */
function showConflictModal(newCourse, existingCourse, conflict) {
    elements.conflictMessage.innerHTML = `
        درس "<strong>${newCourse.name}</strong>" با درس "<strong>${existingCourse.name}</strong>"
        تداخل زمانی دارد:<br><br>
        روز <strong>${conflict.day}</strong> - ساعت ${toPersianTime(conflict.time1)}
    `;
    elements.conflictModal.classList.add('active');
}

/**
 * Render selected courses list in modal
 */
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
            </div>
        `;
        return;
    }
    
    elements.selectedList.innerHTML = state.selectedCourses.map(courseId => {
        const course = findCourseById(courseId);
        if (!course) return '';
        
        const scheduleText = course.schedule.map(s => `${s.day} ${toPersianTime(s.start)}-${toPersianTime(s.end)}`).join('، ');
        
        return `
            <div class="selected-item">
                <div class="selected-item-info">
                    <span class="selected-item-name">${course.name}</span>
                    <span class="selected-item-meta">
                        ${course.professor} | ${toPersianNumber(course.units)} واحد | گروه ${toPersianNumber(course.group)}<br>
                        ${scheduleText}
                    </span>
                </div>
                <button class="selected-item-remove" data-course-id="${courseId}" title="حذف">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
    
    // Add event listeners to remove buttons
    elements.selectedList.querySelectorAll('.selected-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const courseId = btn.dataset.courseId;
            removeCourse(courseId);
        });
    });
}

/**
 * Close all modals
 */
function closeAllModals() {
    elements.courseModal.classList.remove('active');
    elements.listModal.classList.remove('active');
    elements.conflictModal.classList.remove('active');
    state.currentModalCourse = null;
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS - FIXED PDF WITH PERSIAN SUPPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Export schedule as PDF using image capture (supports Persian)
 */
async function exportPDF() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }
    
    try {
        showToast('در حال تهیه PDF...', 'info');
        
        const { jsPDF } = window.jspdf;
        
        // Create a temporary container for PDF content
        const pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 1200px;
            padding: 30px;
            background: white;
            font-family: 'Vazirmatn', sans-serif;
            direction: rtl;
        `;
        document.body.appendChild(pdfContainer);
        
        // Build PDF content HTML
        let coursesListHtml = '';
        state.selectedCourses.forEach((courseId, index) => {
            const course = findCourseById(courseId);
            if (!course) return;
            const scheduleText = course.schedule.map(s => `${s.day} ${s.start}-${s.end}`).join('، ');
            coursesListHtml += `
                <div style="margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 5px;">${index + 1}. ${course.name}</div>
                    <div style="font-size: 12px; color: #666;">
                        کد: ${course.code} | استاد: ${course.professor} | ${course.units} واحد | گروه ${course.group}
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 3px;">${scheduleText}</div>
                </div>
            `;
        });
        
        const totalUnits = state.selectedCourses.reduce((sum, id) => sum + (findCourseById(id)?.units || 0), 0);
        
        pdfContainer.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 24px; margin-bottom: 10px;">برنامه هفتگی</h1>
                <p style="font-size: 12px; color: #666;">تاریخ: ${new Date().toLocaleDateString('fa-IR')}</p>
            </div>
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 5px;">دروس انتخاب شده</h2>
                ${coursesListHtml}
            </div>
            <div style="text-align: left; font-weight: bold; font-size: 14px; margin-top: 20px; padding-top: 10px; border-top: 2px solid #333;">
                جمع واحد: ${totalUnits}
            </div>
        `;
        
        // Capture the content as image
        const canvas = await html2canvas(pdfContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            allowTaint: true
        });
        
        // Remove temporary container
        document.body.removeChild(pdfContainer);
        
        // Create PDF
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = 210; // A4 width in mm
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('schedule.pdf');
        
        showToast('PDF با موفقیت دانلود شد', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showToast('خطا در تهیه PDF', 'error');
    }
}

/**
 * Copy schedule to clipboard
 */
async function copyToClipboard() {
    if (state.selectedCourses.length === 0) {
        showToast('برنامه خالی است', 'warning');
        return;
    }
    
    try {
        let text = 'برنامه هفتگی\n';
        text += '═══════════════\n\n';
        
        state.selectedCourses.forEach((courseId, index) => {
            const course = findCourseById(courseId);
            if (!course) return;
            
            text += `${index + 1}. ${course.name}\n`;
            text += `   کد: ${course.code}\n`;
            text += `   استاد: ${course.professor}\n`;
            text += `   واحد: ${course.units}\n`;
            text += `   گروه: ${course.group}\n`;
            text += `   برنامه: ${course.schedule.map(s => `${s.day} ${s.start}-${s.end}`).join('، ')}\n`;
            text += '\n';
        });
        
        text += `═══════════════\n`;
        text += `جمع واحد: ${state.selectedCourses.reduce((sum, id) => sum + (findCourseById(id)?.units || 0), 0)}\n`;
        
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

/**
 * Show toast notification
 */
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
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, CONFIG.TOAST_DURATION);
}

// ═══════════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Toggle between dark and light mode
 */
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

/**
 * Load saved theme preference
 */
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    
    if (savedTheme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
    // Search input - show results while typing
    elements.searchInput.addEventListener('input', () => {
        const query = elements.searchInput.value;
        if (query.trim()) {
            // When typing, show all matching results
            showSearchResults(false);
        } else {
            // When empty, show initial 10 courses
            showSearchResults(true);
        }
    });
    
    // Search focus - show first 10 courses
    elements.searchInput.addEventListener('focus', () => {
        const query = elements.searchInput.value;
        // Show initial courses when focused (even if empty)
        showSearchResults(!query.trim());
    });
    
    elements.searchInput.addEventListener('blur', hideSearchResults);
    
    // Clear search button
    elements.searchClear.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.searchResults.classList.remove('active');
        elements.searchClear.classList.remove('visible');
        elements.searchInput.focus();
    });
    
    // Control buttons
    elements.btnViewList.addEventListener('click', () => {
        renderSelectedList();
        elements.listModal.classList.add('active');
    });
    
    elements.btnCopyTable.addEventListener('click', copyToClipboard);
    elements.btnExportPDF.addEventListener('click', exportPDF);
    elements.btnReset.addEventListener('click', resetSchedule);
    
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // Modal close buttons
    elements.closeCourseModal.addEventListener('click', closeAllModals);
    elements.btnCloseCourseModal.addEventListener('click', closeAllModals);
    elements.closeListModal.addEventListener('click', closeAllModals);
    elements.btnCloseListModal.addEventListener('click', closeAllModals);
    elements.closeConflictModal.addEventListener('click', closeAllModals);
    elements.btnCloseConflictModal.addEventListener('click', closeAllModals);
    
    // Remove course button
    elements.btnRemoveCourse.addEventListener('click', () => {
        if (state.currentModalCourse) {
            removeCourse(getCourseId(state.currentModalCourse));
        }
    });
    
    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize footer content
 */
function initializeFooter() {
    elements.footerText.textContent = CONFIG.FOOTER_TEXT;
    elements.footerLink.textContent = CONFIG.FOOTER_LINK_TEXT;
    elements.footerLink.href = CONFIG.FOOTER_LINK;
}

/**
 * Main initialization
 */
async function init() {
    console.log('Initializing University Course Scheduler...');
    
    // Initialize UI
    initializeScheduleTable();
    initializeFooter();
    loadTheme();
    
    // Load data
    await loadCourses();
    loadFromStorage();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('Initialization complete!');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
