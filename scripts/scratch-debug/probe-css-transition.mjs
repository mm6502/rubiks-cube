// SCRATCH PROBE — not part of the app. Delete when done.
//
// Reproduces the app's ACTUAL animation path:
//   - CSS `transition: transform 0.25s`   (NOT WAAPI — the previous probe's flaw)
//   - the app's composite transform string
//       rotateX(-25deg) rotateY(-35deg) matrix3d(<basis>)
//   - transitions INTERRUPTED mid-flight (rapid repeat presses)
//
// Per case:
//   sweep    - cumulative angle swept (sum of |delta| between frames)
//   net      - realized rotation angle from first to last frame
//   minDet   - minimum determinant of the rotation block (0 => geometry collapses)
//   reversed - the sweep changes direction mid-flight ("unwinds" symptom)
//
// Run: node scripts/scratch-debug/probe-css-transition.mjs chromium
//      node scripts/scratch-debug/probe-css-transition.mjs firefox
import { chromium, firefox } from 'playwright';

const engineName = process.argv[2] ?? 'chromium';
const engine = engineName === 'firefox' ? firefox : chromium;

const BASE_X = -25;
const BASE_Y = -35;
const DURATION = 250; // matches `transition: transform 0.25s`
const SAMPLE_MS = 1000;

const IDENTITY = { vR: { x: 1, y: 0, z: 0 }, vU: { x: 0, y: 1, z: 0 }, vF: { x: 0, y: 0, z: 1 } };

// rotateViewRight: vF_new = -vR, vR_new = vF, vU unchanged
const rotRight = ({ vR, vU, vF }) => ({
    vF: { x: -vR.x, y: -vR.y, z: -vR.z },
    vR: { ...vF },
    vU: { ...vU },
});
const after = n => {
    let o = { vR: { ...IDENTITY.vR }, vU: { ...IDENTITY.vU }, vF: { ...IDENTITY.vF } };
    for (let i = 0; i < n; i++) o = rotRight(o);
    return o;
};

const basis = o =>
    `matrix3d(${o.vR.x},${o.vU.x},${o.vF.x},0, ${o.vR.y},${o.vU.y},${o.vF.y},0, ` +
    `${o.vR.z},${o.vU.z},${o.vF.z},0, 0,0,0,1)`;
const full = o => `rotateX(${BASE_X}deg) rotateY(${BASE_Y}deg) ${basis(o)}`;
const bare = o => basis(o);

// ---- metrics (Node side) ----
const toNums = str => {
    if (!str || str === 'none') return null;
    const n = str
        .slice(str.indexOf('(') + 1, -1)
        .split(',')
        .map(Number);
    return n.length === 16 ? n : null; // 2D collapse -> null
};
const det3 = n => {
    const [a, b, c] = [n[0], n[4], n[8]];
    const [d, e, f] = [n[1], n[5], n[9]];
    const [g, h, i] = [n[2], n[6], n[10]];
    return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
};
const quat = n => {
    const m00 = n[0],
        m01 = n[4],
        m02 = n[8];
    const m10 = n[1],
        m11 = n[5],
        m12 = n[9];
    const m20 = n[2],
        m21 = n[6],
        m22 = n[10];
    const tr = m00 + m11 + m22;
    let w, x, y, z, s;
    if (tr > 0) {
        s = Math.sqrt(tr + 1) * 2;
        w = 0.25 * s;
        x = (m21 - m12) / s;
        y = (m02 - m20) / s;
        z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }
    const len = Math.hypot(w, x, y, z) || 1;
    return [w / len, x / len, y / len, z / len];
};
const angleBetween = (qa, qb) => {
    const d = Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]));
    return (2 * Math.acos(d) * 180) / Math.PI;
};

const HEADED = process.env.PW_HEADED === '1';
const browser = await engine.launch({ headless: !HEADED });
const page = await browser.newPage();
console.log(`mode: ${HEADED ? 'HEADED' : 'headless'}`);
await page.setContent(`<!doctype html><html><body style="margin:0">
  <div id="host" style="width:100px;height:100px;transform-style:preserve-3d;
       transition: transform ${DURATION}ms;"></div>
</body></html>`);

const runSchedule = async schedule => {
    return await page.evaluate(
        async ({ schedule, sampleMs }) => {
            const host = document.getElementById('host');
            // Reset without transitioning.
            host.style.transition = 'none';
            host.style.transform = schedule[0].transform;
            void host.offsetHeight;

            // Apply scheduled changes while sampling every frame.
            const start = performance.now();
            for (const step of schedule.slice(1)) {
                await new Promise(r =>
                    setTimeout(r, Math.max(0, step.at - (performance.now() - start)))
                );
                if (step.reflow) void host.offsetHeight;
                host.style.transition = `transform ${step.duration ?? 250}ms`;
                host.style.transform = step.transform;
            }

            const samples = [];
            const t0 = performance.now();
            await new Promise(resolve => {
                const tick = () => {
                    samples.push({
                        t: Math.round(performance.now() - t0),
                        m: getComputedStyle(host).transform,
                    });
                    if (performance.now() - t0 < sampleMs) requestAnimationFrame(tick);
                    else resolve();
                };
                requestAnimationFrame(tick);
            });
            return samples;
        },
        { schedule, sampleMs: SAMPLE_MS }
    );
};

const cases = [
    [
        'bare matrix3d      90',
        [
            { at: 0, transform: bare(after(0)) },
            { at: 0, transform: bare(after(1)) },
        ],
    ],
    [
        'bare matrix3d     180',
        [
            { at: 0, transform: bare(after(0)) },
            { at: 0, transform: bare(after(2)) },
        ],
    ],
    [
        'bare matrix3d     270',
        [
            { at: 0, transform: bare(after(0)) },
            { at: 0, transform: bare(after(3)) },
        ],
    ],
    [
        'composite          90',
        [
            { at: 0, transform: full(after(0)) },
            { at: 0, transform: full(after(1)) },
        ],
    ],
    [
        'composite         180',
        [
            { at: 0, transform: full(after(0)) },
            { at: 0, transform: full(after(2)) },
        ],
    ],
    [
        'composite         270',
        [
            { at: 0, transform: full(after(0)) },
            { at: 0, transform: full(after(3)) },
        ],
    ],
    [
        'composite 90 -> 180 (interrupted @120ms)',
        [
            { at: 0, transform: full(after(0)) },
            { at: 0, transform: full(after(1)) },
            { at: 120, transform: full(after(2)) },
        ],
    ],
    [
        'composite 90 -> 270 (interrupted @120ms)',
        [
            { at: 0, transform: full(after(0)) },
            { at: 0, transform: full(after(1)) },
            { at: 120, transform: full(after(3)) },
        ],
    ],
];

console.log(`\n=================== ${engineName} ===================`);
for (const [label, schedule] of cases) {
    const samples = await runSchedule(schedule);
    const frames = samples
        .map(s => ({ t: s.t, n: toNums(s.m), raw: s.m }))
        .filter(s => s.n !== null);

    if (frames.length < 2) {
        console.log(`\n${label}\n  <no 3D frames — ${samples.length} samples>`);
        continue;
    }
    const q = frames.map(f => quat(f.n));
    let sweep = 0;
    let reversals = 0;
    let lastSign = 0;
    for (let i = 1; i < q.length; i++) {
        const d = angleBetween(q[i - 1], q[i]);
        sweep += d;
        if (d > 0.5) {
            const sign = Math.sign(
                q[i][0] * q[i - 1][0] +
                    q[i][1] * q[i - 1][1] +
                    q[i][2] * q[i - 1][2] +
                    q[i][3] * q[i - 1][3]
            );
            if (lastSign && sign !== lastSign && d > 1) reversals++;
            lastSign = sign;
        }
    }
    const net = angleBetween(q[0], q[q.length - 1]);
    const dets = frames.map(f => Math.abs(det3(f.n)));
    const minDet = Math.min(...dets);
    const collapsed = samples.length - frames.length;

    console.log(`\n${label}`);
    console.log(
        `  frames=${frames.length}  collapsed2D=${collapsed}  sweep=${sweep.toFixed(1)}deg  net=${net.toFixed(1)}deg  minDet=${minDet.toFixed(3)}  reversals=${reversals}`
    );
}

await browser.close();
