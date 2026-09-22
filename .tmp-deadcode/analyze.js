const fs = require('fs');
const path = require('path');

const JS_FILES = ['script.js', 'combo.js', 'motion.js'];
const jsSrc = {};
for (const f of JS_FILES) jsSrc[f] = fs.readFileSync(f, 'utf8');
const allJs = Object.values(jsSrc).join('\n');
const html = fs.readFileSync('index.html', 'utf8');
const cssFiles = ['style.css', 'combo.css', 'io.css', 'validations.css', 'features.css'];
const allCss = cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const corpus = allJs + '\n' + html;

function countUses(name, text) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp('(?<![\\w$])' + esc + '(?![\\w$])', 'g')) || []).length;
}

// --- 1. JS declarations (top-level functions, arrows, consts) ---
console.log('=== JS: declarations referenced only at declaration site ===');
const declRe = /^(?:export\s+)?(?:async\s+)?function\s*([A-Za-z_$][\w$]*)/gm;
const arrowRe = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
const constFnRe = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/m;
const names = new Set();
for (const [file, src] of Object.entries(jsSrc)) {
  for (const re of [declRe, arrowRe, constFnRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
  }
}
const deadJs = [];
for (const n of names) {
  const uses = countUses(n, corpus);
  if (uses <= 1) deadJs.push(n);
}
console.log(deadJs.sort().join('\n') || '(none)');

// --- 2. HTML ids: used in JS/CSS? ---
console.log('\n=== HTML ids never referenced in JS or CSS ===');
const idRe = /\bid=["']([^"']+)["']/g;
const htmlIds = new Set();
let m;
while ((m = idRe.exec(html))) htmlIds.add(m[1]);
const deadIds = [];
for (const id of htmlIds) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inJs = countUses(id, allJs);
  const inCss = (allCss.match(new RegExp('#' + esc + '(?![\\w-])', 'g')) || []).length;
  if (inJs === 0 && inCss === 0) deadIds.push(id);
}
console.log(deadIds.sort().join('\n') || '(none)');

// --- 3. CSS classes ---
console.log('\n=== CSS classes never appearing in HTML or JS ===');
const classRe = /\.([A-Za-z_][\w-]*)/g;
const perFile = {};
for (const f of cssFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const set = new Set();
  let cm;
  while ((cm = classRe.exec(src))) set.add(cm[1]);
  perFile[f] = set;
}
const jsClassLiteral = (allJs.match(/["'`][^"'`]*[a-zA-Z][^"'`]*["'`]/g) || []).join('\n');
for (const [f, set] of Object.entries(perFile)) {
  const unused = [];
  for (const cls of set) {
    const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inHtml = (html.match(new RegExp('["\'\\s]' + cls + '(?![\\w-])', 'g')) || []).length +
      (html.match(new RegExp('class="[^"]*\\b' + cls + '\\b', 'g')) || []).length;
    const inJs = countUses(cls, allJs) + (jsClassLiteral.includes(cls) ? 1 : 0);
    if (inHtml === 0 && inJs === 0) unused.push(cls);
  }
  perFile[f] = unused;
  console.log('--- ' + f + ' (' + unused.length + '): ' + unused.sort().join(', '));
}
