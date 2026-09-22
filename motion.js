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

    /* ── View push (mobile tab switch) ─────────────────────────────
       Seamless directional push: the outgoing page is pinned pixel-exact
       where it currently is, the scroll resets BEHIND it, the incoming
       page is pinned at its final spot and enters from the off-screen
       side. Only transforms animate → zero layout jump.
       dir 'fwd'  : schedule exits LEFT,  courses enters from RIGHT
       dir 'back' : the exact reverse.
       `opts.midway` runs after the outgoing page is pinned, so the caller
       can relayout safely while the screen is visually frozen.
       Only transforms animate → zero layout jump.
       Returns true when the push plays, false → caller instant-swaps. */
    Motion.viewPush = function (opts) {
        if (!can() || !opts || !opts.outgoing || !opts.incoming) return false;
        var out = opts.outgoing, inc = opts.incoming;
        if (out === inc) return false;
        var fwd = opts.dir !== 'back';
        var vw = window.innerWidth;

        // 1) Pin the outgoing page exactly where the user sees it right now
        //    (BEFORE any relayout — this is what kills the "jump" feel)
        var r = out.getBoundingClientRect();
        window.gsap.set(out, {
            position: 'fixed', top: r.top, left: r.left,
            width: r.width, height: r.height, margin: 0,
            zIndex: 40, overflow: 'hidden'
        });

        // 2) Caller may now safely relayout (unhide incoming, body class…)
        //    — the pinned overlay keeps the screen visually frozen.
        if (opts.midway) opts.midway();

        // 3) Reset scroll behind the pinned overlay (invisible to the user)
        window.scrollTo(0, 0);

        // 4) Pin the incoming page at its final flow position (scroll is 0)
        var r2 = inc.getBoundingClientRect();
        window.gsap.set(inc, {
            position: 'fixed', top: r2.top, left: r2.left,
            width: r2.width, height: r2.height, margin: 0,
            zIndex: 41, overflow: 'hidden',
            x: fwd ? vw : -vw
        });

        var tl = window.gsap.timeline({
            onComplete: function () {
                Motion.viewPushClear(out, inc);
                if (opts.onDone) opts.onDone();
            }
        });
        // Smooth, clean push: a matched-velocity slide with a slow-in/slow-out
        // curve, plus a whisper of opacity so the swap never reads as a hard
        // cut. The two pages move as one connected surface.
        var D = 0.44;
        var E = 'power2.inOut';
        tl.set(inc, { opacity: 0 });
        tl.to(out, { x: fwd ? -vw : vw, opacity: 0.5, duration: D, ease: E }, 0);
        tl.to(inc, { x: 0, opacity: 1, duration: D, ease: E }, 0);
        tl.to(out, { opacity: 0, duration: 0.18, ease: 'power1.in' }, D - 0.18);
        Motion._viewPushTl = tl;
        Motion._viewPushEls = [out, inc];
        return true;
    };

    /** Strip every inline style the push applied (caller then hides the
     *  outgoing page with its normal mechanism). */
    Motion.viewPushClear = function (a, b) {
        [a, b].forEach(function (el) {
            if (!el) return;
            window.gsap.set(el, { clearProps: 'all' });
        });
        Motion._viewPushTl = null;
        Motion._viewPushEls = null;
    };

    /** Kill a running push (fast double-switch): freeze nothing, just
     *  hand control back to the caller's normal show/hide logic. */
    Motion.viewPushCancel = function () {
        if (Motion._viewPushTl) Motion._viewPushTl.kill();
        if (Motion._viewPushEls) Motion.viewPushClear(Motion._viewPushEls[0], Motion._viewPushEls[1]);
    };

    /** Move the dock's selection pill. Instant → set, else tween with the
     *  same easing family as the page push. */
    Motion.dockPill = function (el, x, w, instant) {
        if (!el) return;
        if (!can()) { el.style.transform = 'translateX(' + x + 'px)'; el.style.width = w + 'px'; return; }
        if (instant) {
            window.gsap.set(el, { x: x, width: w });
        } else {
            window.gsap.to(el, { x: x, width: w, duration: 0.34, ease: 'power2.inOut', overwrite: 'auto' });
        }
    };

    /** Soft attention pulse on the conflict modal content */
    Motion.conflictAlert = function (content) {
        if (!can() || !content) return;
        // Wait out the sheet's 300ms enter transition first: running the shake
        // mid-entry makes GSAP capture (and freeze) the half-applied scale,
        // stalling the modal's rise until the shake ends.
        var delay = (window.Motion && Motion.MODAL_ENTER_MS) || 320;
        window.gsap.delayedCall(delay / 1000, function () {
            window.gsap.fromTo(content,
                { x: 0 },
                {
                    keyframes: [{ x: -5 }, { x: 5 }, { x: -3 }, { x: 3 }, { x: 0 }],
                    duration: 0.36,
                    ease: 'power1.inOut',
                    // Keyframe tweens can skip vars-level clearProps; clear on
                    // completion too so no stale inline transform is left behind.
                    onComplete: function () { window.gsap.set(content, { clearProps: 'transform' }); }
                });
        });
    };

    window.Motion = Motion;
})();
