/**
 * ═══════════════════════════════════════════════════════════════
 * MOTION — presentation-layer animation helpers (GSAP)
 * ═══════════════════════════════════════════════════════════════
 * Rules of this module:
 *  - NEVER holds or mutates app state; purely visual.
 *  - Every function is a safe no-op when GSAP failed to load (offline)
 *    or the user prefers reduced motion — CSS fallbacks stay intact.
 *  - Only transform/opacity are animated (compositor-friendly).
 *  - Durations are short (≤ 400ms) and easing is purposeful.
 */
(function () {
    'use strict';

    var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    function reduced() { return reducedQuery.matches; }
    function hasGsap() { return typeof window.gsap !== 'undefined'; }
    function can() { return hasGsap() && !reduced(); }

    // Tune GSAP once: no layout-thrashing properties, precise timing
    if (hasGsap()) {
        window.gsap.defaults({ overwrite: 'auto' });
    }

    var Motion = {};

    /** Springy pop for freshly added schedule blocks (+ optional stagger) */
    Motion.blocksIn = function (els) {
        if (!can() || !els || !els.length) return;
        window.gsap.fromTo(els,
            { scale: 0.88, y: 6, opacity: 0 },
            {
                scale: 1, y: 0, opacity: 1,
                duration: 0.38,
                ease: 'back.out(1.7)',
                stagger: 0.05,
                clearProps: 'transform,opacity'
            });
    };

    /** FLIP: slide existing toasts out of the way when a new one stacks in */
    Motion.toastsShift = function (container, exceptEl) {
        if (!can() || !container) return;
        var toasts = Array.prototype.slice.call(container.children)
            .filter(function (el) { return el !== exceptEl && !el.classList.contains('removing'); });
        if (!toasts.length) return;
        // First: current positions (column layout → only Y matters)
        var before = toasts.map(function (el) { return el.getBoundingClientRect().top; });
        // Then next frame: measure shift and play it backwards
        requestAnimationFrame(function () {
            toasts.forEach(function (el, i) {
                var delta = before[i] - el.getBoundingClientRect().top;
                if (!delta) return;
                window.gsap.fromTo(el, { y: delta }, {
                    y: 0, duration: 0.3, ease: 'power3.out', clearProps: 'transform'
                });
            });
        });
    };

    /** Toast entrance: slide + settle (replaces the pure-CSS entrance) */
    Motion.toastIn = function (el) {
        if (!can() || !el) return;
        window.gsap.fromTo(el,
            { x: -40, opacity: 0, scale: 0.96 },
            { x: 0, opacity: 1, scale: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity' });
    };

    /** Tween a summary counter; returns false when it will NOT animate
     *  (no GSAP / reduced motion / same value) so callers can instant-set. */
    Motion.countTo = function (el, from, to, fmt) {
        if (!can() || !el || from === to) return false;
        var obj = { v: from };
        window.gsap.to(obj, {
            v: to,
            duration: 0.35,
            ease: 'power2.out',
            onUpdate: function () { el.textContent = fmt(Math.round(obj.v)); }
        });
        return true;
    };

    /** Entrance for NEW schedule blocks (single or staggered list) */
    Motion.blockIn = function (el) {
        if (!can() || !el) return;
        window.gsap.fromTo(el,
            { scale: 0.88, y: 6, opacity: 0 },
            { scale: 1, y: 0, opacity: 1, duration: 0.34, ease: 'back.out(1.7)', clearProps: 'transform,opacity' });
    };

    /** Reverse exit for REMOVED blocks: plays on clones appended to the
     *  table wrapper (blocks themselves are destroyed by the rebuild). */
    Motion.blockOut = function (clones) {
        if (!can() || !clones || !clones.length) return;
        window.gsap.to(clones, {
            scale: 0.88, y: 6, opacity: 0,
            duration: 0.2, ease: 'power2.in',
            onComplete: function () {
                clones.forEach(function (el) { el.remove(); });
            }
        });
    };

    /** Quick crossfade for the schedule body on tab switch */
    Motion.tabSwap = function (body) {
        if (!can() || !body) return;
        window.gsap.fromTo(body,
            { opacity: 0.35, y: 8 },
            { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
    };

    /** Soft attention pulse on the conflict modal content */
    Motion.conflictAlert = function (content) {
        if (!can() || !content) return;
        window.gsap.fromTo(content,
            { x: 0 },
            {
                keyframes: [{ x: -5 }, { x: 5 }, { x: -3 }, { x: 3 }, { x: 0 }],
                duration: 0.36,
                ease: 'power1.inOut',
                clearProps: 'transform'
            });
    };

    window.Motion = Motion;
})();
