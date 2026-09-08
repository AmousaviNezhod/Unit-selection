/* ═══════════════════════════════════════════════════════════════
   COMBO GENERATOR
   Mark desired courses (all groups = alternatives), mark passed
   courses (excluded from everything), enumerate conflict-free
   combinations, rank by fewest gaps then earliest finish.
   ═══════════════════════════════════════════════════════════════ */

// Storage keys
const COMBO_WANTED_KEY = 'university_scheduler_combo_wanted';
const COMBO_PASSED_KEY = 'university_scheduler_combo_passed';

const comboState = {
    wanted: [],          // course codes the student wants this term
    passed: [],          // course codes already passed (دروس پاس شده)
    lastCombos: null     // generated results (for re-render)
};

// ── Persistence ────────────────────────────────────────────────
function loadComboState() {
    try {
        comboState.wanted = JSON.parse(localStorage.getItem(COMBO_WANTED_KEY) || '[]');
        comboState.passed = JSON.parse(localStorage.getItem(COMBO_PASSED_KEY) || '[]');
    } catch (e) {
        comboState.wanted = [];
        comboState.passed = [];
    }
}

function saveComboState() {
    try {
        localStorage.setItem(COMBO_WANTED_KEY, JSON.stringify(comboState.wanted));
        localStorage.setItem(COMBO_PASSED_KEY, JSON.stringify(comboState.passed));
    } catch (e) { /* noop */ }
}

// ── Helpers ────────────────────────────────────────────────────

/** All groups of a course code (alternatives), excluding passed codes */
function getCourseVariants(code) {
    return getListCourses().filter(c => c.code === code);
}

/** Courses available in search: hide passed ones and already-wanted ones */
function getComboCandidates(query) {
    const q = query.trim().toLowerCase();
    const passedSet = new Set(comboState.passed);
    const wantedSet = new Set(comboState.wanted);
    return getListCourses().filter(c => {
        if (passedSet.has(c.code) || wantedSet.has(c.code)) return false;
        // Keep only the first group of each code so the picker shows one row per course
        return getCourseVariants(c.code)[0] === c;
    }).filter(c => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) ||
               c.professor.toLowerCase().includes(q) ||
               c.code.includes(q);
    }).slice(0, 12);
}

/** Courses available for the passed-marker search (hide already-passed) */
function getPassedCandidates(query) {
    const q = query.trim().toLowerCase();
    const passedSet = new Set(comboState.passed);
    return getListCourses().filter(c => {
        if (passedSet.has(c.code)) return false;
        return getCourseVariants(c.code)[0] === c;
    }).filter(c => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) ||
               c.professor.toLowerCase().includes(q) ||
               c.code.includes(q);
    }).slice(0, 12);
}

/** One representative course per wanted code (first group) — for chip display */
function getWantedRepresentatives() {
    return comboState.wanted
        .map(code => getCourseVariants(code)[0])
        .filter(Boolean);
}

// ── Rendering: wanted chips ────────────────────────────────────
function renderWantedChips() {
    const wrap = document.getElementById('comboWanted');
    if (!wrap) return;
    wrap.innerHTML = getWantedRepresentatives().map(c => `
        <span class="combo-chip">
            ${escapeHtml(c.name)}
            <span class="combo-chip-meta">(${getCourseVariants(c.code).length} گروه)</span>
            <button type="button" class="combo-chip-remove" data-code="${escapeHtml(c.code)}" title="حذف">✕</button>
        </span>`).join('');

    wrap.querySelectorAll('.combo-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            comboState.wanted = comboState.wanted.filter(code => code !== btn.dataset.code);
            saveComboState();
            renderWantedChips();
        });
    });
}

// ── Rendering: passed section ──────────────────────────────────
function renderPassedSection() {
    const count = document.getElementById('comboPassedCount');
    if (!count) return;
    const reps = comboState.passed
        .map(code => getCourseVariants(code)[0])
        .filter(Boolean);

    if (!reps.length) {
        count.textContent = 'هیچ درسی علامت نخورده';
        count.classList.remove('has-items');
        return;
    }
    count.classList.add('has-items');
    count.innerHTML = `<span class="combo-passed-chips">` + reps.map(c => `
        <span class="combo-chip passed">
            ${escapeHtml(c.name)}
            <button type="button" class="combo-chip-remove" data-code="${escapeHtml(c.code)}" title="حذف علامت">✕</button>
        </span>`).join('') + `</span>`;

    count.querySelectorAll('.combo-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            comboState.passed = comboState.passed.filter(code => code !== btn.dataset.code);
            saveComboState();
            renderPassedSection();
        });
    });
}

// ── Search dropdowns ───────────────────────────────────────────
function comboRenderSearch(containerId, candidates, mode) {
    const box = document.getElementById(containerId);
    if (!box) return;

    if (!candidates.length) {
        box.innerHTML = '<div class="combo-search-empty">نتیجه‌ای پیدا نشد</div>';
        box.hidden = false;
        return;
    }

    box.innerHTML = candidates.map(c => `
        <div class="combo-search-item" data-code="${escapeHtml(c.code)}">
            <span>${escapeHtml(c.name)} <span class="combo-item-meta">${escapeHtml(c.professor)}</span></span>
            <span class="combo-item-meta">${toPersianNumber(c.units)} واحد • ${getCourseVariants(c.code).length} گروه</span>
        </div>`).join('');
    box.hidden = false;

    box.querySelectorAll('.combo-search-item').forEach(item => {
        item.addEventListener('click', () => {
            const code = item.dataset.code;
            if (mode === 'wanted') {
                if (!comboState.wanted.includes(code)) comboState.wanted.push(code);
                renderWantedChips();
            } else {
                if (!comboState.passed.includes(code)) comboState.passed.push(code);
                renderPassedSection();
            }
            saveComboState();
            box.hidden = true;
            const input = box.previousElementSibling;
            if (input && input.classList.contains('combo-search')) input.value = '';
        });
    });
}

// ── Combo generation ───────────────────────────────────────────

/**
 * All conflict-free combinations: pick one group per wanted code such that
 * no two chosen courses conflict. Backtracking over per-code group lists.
 * Hard cap to keep the demo responsive.
 */
function generateCombos() {
    const perCode = comboState.wanted
        .map(code => getCourseVariants(code))
        .filter(variants => variants.length);

    if (!perCode.length) return { combos: [], blockers: [] };

    const MAX_COMBOS = 500;
    const combos = [];
    const chosen = [];

    /** conflicts with an already chosen course? */
    const ok = (course) => chosen.every(sel => !checkConflict(sel, course).hasConflict);

    let truncated = false;
    (function backtrack(i) {
        if (combos.length >= MAX_COMBOS) { truncated = true; return; }
        if (i === perCode.length) {
            combos.push([...chosen]);
            return;
        }
        for (const variant of perCode[i]) {
            if (!ok(variant)) continue;
            chosen.push(variant);
            backtrack(i + 1);
            chosen.pop();
            if (combos.length >= MAX_COMBOS) { truncated = true; return; }
        }
    })(0);

    return { combos, blockers: truncated ? ['بیش از ۵۰۰ ترکیب — فقط ۵۰۰ تای اول نمایش داده می‌شود'] : [] };
}

/** Compactness score: total idle hours between classes + latest finish hour */
function scoreCombo(combo) {
    const byDay = {};
    combo.forEach(course => course.schedule.forEach(s => {
        const day = s.day;
        (byDay[day] = byDay[day] || []).push([parseTime(s.start), parseTime(s.end)]);
    }));

    let gaps = 0, latestFinish = 0, busiest = 0;
    Object.values(byDay).forEach(ranges => {
        ranges.sort((a, b) => a[0] - b[0]);
        // merge for gap counting (weekly slots only appear once per day)
        let spanStart = ranges[0][0], spanEnd = ranges[0][1], dayGaps = 0;
        for (let i = 1; i < ranges.length; i++) {
            if (ranges[i][0] <= spanEnd) {
                spanEnd = Math.max(spanEnd, ranges[i][1]);
            } else {
                dayGaps += ranges[i][0] - spanEnd;
                spanStart = ranges[i][0];
                spanEnd = ranges[i][1];
            }
        }
        gaps += dayGaps;
        busiest = Math.max(busiest, ranges.length);
        latestFinish = Math.max(latestFinish, spanEnd);
    });

    return { gaps, latestFinish, days: Object.keys(byDay).length };
}

function renderCombos() {
    const wrap = document.getElementById('comboResults');
    if (!wrap) return;

    if (!comboState.lastCombos) { wrap.innerHTML = ''; return; }
    const { combos, blockers } = comboState.lastCombos;

    if (!combos.length) {
        wrap.innerHTML = `
            <div class="combo-no-results">
                هیچ ترکیب بدون تداخلی پیدا نشد.
                <ul><li>تعداد دروس مطلوب را کمتر کنید</li><li>دروس وابسته (پیش‌نیاز زمانی) را جدا انتخاب کنید</li></ul>
            </div>`;
        return;
    }

    // Rank: fewest gap hours, then earliest finish, then fewest days
    const scored = combos
        .map(combo => ({ combo, score: scoreCombo(combo) }))
        .sort((a, b) =>
            a.score.gaps - b.score.gaps ||
            a.score.latestFinish - b.score.latestFinish ||
            a.score.days - b.score.days);

    const best = scored[0];
    wrap.innerHTML = (blockers.length
        ? `<div class="combo-no-results">${blockers.map(escapeHtml).join('<br>')}</div>` : '') +
        scored.slice(0, 20).map((entry, i) => {
            const units = entry.combo.reduce((s, c) => s + c.units, 0);
            const s = entry.score;
            const isBest = entry === best;
            return `
            <div class="combo-result ${isBest ? 'best' : ''}">
                <div class="combo-result-header">
                    <span class="combo-result-title">
                        ترکیب ${toPersianNumber(i + 1)}
                        ${isBest ? '<span class="combo-best-badge">★ بهترین</span>' : ''}
                    </span>
                    <span class="combo-result-stats">
                        ${toPersianNumber(units)} واحد • ${toPersianNumber(s.days)} روز در هفته •
                        ${s.gaps ? toPersianNumber(s.gaps) + ' ساعت فاصله' : 'بدون فاصله'} • پایان ${toPersianTime(minutesToTime(Math.round(s.latestFinish * 60)))}
                    </span>
                </div>
                <div class="combo-result-courses">
                    ${entry.combo.map(c => `
                        <div class="combo-result-course">
                            <span>${escapeHtml(c.name)} <span class="combo-course-meta">گروه ${toPersianNumber(c.group)} • ${escapeHtml(c.professor)}</span></span>
                            <span class="combo-course-meta">${c.schedule.map(sl => `${escapeHtml(sl.day)} ${toPersianTime(sl.start)}-${toPersianTime(sl.end)}${slotParityLabel(sl) ? ' (' + slotParityLabel(sl) + ')' : ''}`).join('، ')}</span>
                        </div>`).join('')}
                </div>
                <div class="combo-result-actions">
                    <button type="button" class="combo-apply-btn" data-ids='${entry.combo.map(getCourseId).join(',')}'>انتخاب این ترکیب در جدول</button>
                </div>
            </div>`;
        }).join('');

    wrap.querySelectorAll('.combo-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ids = btn.dataset.ids.split(',');
            applyCombo(ids, btn);
        });
    });
}

/** Replace the main selection with this combo (bypassing per-add toasts) */
function applyCombo(ids, btn) {
    state.selectedCourses = ids.filter(id => findCourseById(id));
    // saveSchedules (script.js) keeps the active tab in sync when tabs exist;
    // falls back to the legacy key on older builds
    if (typeof saveSchedules === 'function') saveSchedules();
    else saveToStorage();
    state.unitsWarned = false;
    updateSummary();
    refreshLists();
    renderSchedule();
    btn.textContent = '✔ انتخاب شد';
    btn.classList.add('applied');
    showToast(`ترکیب انتخاب شد (${toPersianNumber(state.selectedCourses.length)} درس)`, 'success');
}

// ── Modal open/close ───────────────────────────────────────────
function openComboModal() {
    renderWantedChips();
    renderPassedSection();
    document.getElementById('comboModal').classList.add('active');
}

// ── Setup ──────────────────────────────────────────────────────
function setupComboGenerator() {
    loadComboState();

    const open = () => openComboModal();
    const btnDesktop = document.getElementById('btnComboGen');
    const btnMobile = document.getElementById('btnComboGenM');
    if (btnDesktop) btnDesktop.addEventListener('click', open);
    if (btnMobile) btnMobile.addEventListener('click', open);

    const close = () => document.getElementById('comboModal').classList.remove('active');
    document.getElementById('closeComboModal').addEventListener('click', close);
    document.getElementById('btnCloseComboFooter').addEventListener('click', close);
    document.getElementById('comboModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) close();
    });

    // Wanted-course search
    const wantedInput = document.getElementById('comboSearch');
    wantedInput.addEventListener('input', () => {
        const q = wantedInput.value;
        if (!q.trim()) { document.getElementById('comboSearchResults').hidden = true; return; }
        comboRenderSearch('comboSearchResults', getComboCandidates(q), 'wanted');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.combo-picker')) document.getElementById('comboSearchResults').hidden = true;
        if (!e.target.closest('.combo-passed-tools')) document.getElementById('comboPassedResults').hidden = true;
    });

    // Passed-course search
    const passedInput = document.getElementById('comboPassedSearch');
    passedInput.addEventListener('input', () => {
        const q = passedInput.value;
        if (!q.trim()) { document.getElementById('comboPassedResults').hidden = true; return; }
        comboRenderSearch('comboPassedResults', getPassedCandidates(q), 'passed');
    });

    // Generate / clear
    document.getElementById('btnGenerateCombos').addEventListener('click', () => {
        if (!comboState.wanted.length) {
            showToast('اول دروس مطلوب را علامت بزنید', 'warning');
            return;
        }
        comboState.lastCombos = generateCombos();
        renderCombos();
        const n = comboState.lastCombos.combos.length;
        showToast(n ? `${toPersianNumber(n)} ترکیب بدون تداخل پیدا شد` : 'ترکیب بدون تداخلی پیدا نشد', n ? 'success' : 'warning');
    });
    document.getElementById('btnClearCombo').addEventListener('click', () => {
        comboState.wanted = [];
        comboState.passed = [];
        comboState.lastCombos = null;
        saveComboState();
        renderWantedChips();
        renderPassedSection();
        renderCombos();
        showToast('همه‌چیز پاک شد', 'info');
    });
}
