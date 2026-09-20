// SCRATCH ANALYSIS — not part of the app.
//
// Does a pivot rotating about a FIXED CSS axis reproduce the app's expected
// transform for every view rotation? Checked exactly, for all 24 reachable
// orientations x 4 rotations (endpoint correctness).
//
// App transform: T = B * M      (B = base tilt, M = basis columns vR,vU,vF)
// Expected:      T' = B * M'    (M' = basis after the rotation)
//
// Candidate structures (P = pivot animation):
//   (i)   outer pivot, fixed world-Y : T' ?= Ry(theta) * B * M
//   (ii)  outer pivot, exact P       : T' ?= P * B * M  where P = B*R*B^-1
//   (iii) inner pivot, exact P = R   : T' ?= B * R * M
// where R = M' * M^T.
const IDENTITY = { vR: { x: 1, y: 0, z: 0 }, vU: { x: 0, y: 1, z: 0 }, vF: { x: 0, y: 0, z: 1 } };
const rotLeft = ({ vR, vU, vF }) => ({
    vF: { ...vR },
    vR: { x: -vF.x, y: -vF.y, z: -vF.z },
    vU: { ...vU },
});
const rotRight = ({ vR, vU, vF }) => ({
    vF: { x: -vR.x, y: -vR.y, z: -vR.z },
    vR: { ...vF },
    vU: { ...vU },
});
const rotUp = ({ vR, vU, vF }) => ({
    vF: { ...vU },
    vU: { x: -vF.x, y: -vF.y, z: -vF.z },
    vR: { ...vR },
});
const rotDown = ({ vR, vU, vF }) => ({
    vF: { x: -vU.x, y: -vU.y, z: -vU.z },
    vU: { ...vF },
    vR: { ...vR },
});
const ops = { left: rotLeft, right: rotRight, up: rotUp, down: rotDown };
const okey = o => [o.vR, o.vU, o.vF].map(v => `${v.x},${v.y},${v.z}`).join('|');

// 3x3 rows
const Mrows = ({ vR, vU, vF }) => [
    [vR.x, vU.x, vF.x],
    [vR.y, vU.y, vF.y],
    [vR.z, vU.z, vF.z],
];
const T = m => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
];
const mul = (a, b) =>
    a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const ident = () => [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];
const maxDiff = (a, b) => Math.max(...a.flatMap((r, i) => r.map((v, j) => Math.abs(v - b[i][j]))));

const deg = d => (d * Math.PI) / 180;
const Rx = d => [
    [1, 0, 0],
    [0, Math.cos(deg(d)), -Math.sin(deg(d))],
    [0, Math.sin(deg(d)), Math.cos(deg(d))],
];
const Ry = d => [
    [Math.cos(deg(d)), 0, Math.sin(deg(d))],
    [0, 1, 0],
    [-Math.sin(deg(d)), 0, Math.cos(deg(d))],
];
const BASE_X = -25;
const BASE_Y = -35;
const B = mul(Rx(BASE_X), Ry(BASE_Y));

// Enumerate 24 orientations.
const seen = new Map([[okey(IDENTITY), IDENTITY]]);
const queue = [IDENTITY];
while (queue.length) {
    const cur = queue.shift();
    for (const op of Object.values(ops)) {
        const nx = op(cur);
        if (!seen.has(okey(nx))) {
            seen.set(okey(nx), nx);
            queue.push(nx);
        }
    }
}

const eps = 1e-9;
const results = { fixedWorldY: [], exactOuter: [], exactInner: [] };

for (const o of seen.values()) {
    const M = Mrows(o);
    for (const [name, op] of Object.entries(ops)) {
        const nx = op(o);
        const Mx = Mrows(nx);
        const expected = mul(B, Mx);

        // (i) outer pivot about world Y by +90 (a fixed, plausible choice)
        const candI = mul(mul(Ry(90), B), M);
        results.fixedWorldY.push({ name, diff: maxDiff(candI, expected) });

        // (ii) outer pivot with the exact P = B R B^-1
        const R = mul(Mx, T(M));
        const P = mul(mul(B, R), T(B));
        const candII = mul(mul(P, B), M);
        results.exactOuter.push({ name, diff: maxDiff(candII, expected) });

        // (iii) inner pivot with P = R
        const candIII = mul(B, mul(R, M));
        results.exactInner.push({ name, diff: maxDiff(candIII, expected) });
    }
}

const summarise = (label, arr) => {
    const worst = arr.reduce((a, b) => (b.diff > a.diff ? b : a));
    const bad = arr.filter(r => r.diff > 1e-6).length;
    console.log(
        `${label.padEnd(34)} wrong=${String(bad).padStart(3)}/${arr.length}  worstDiff=${worst.diff.toFixed(4)}  (${worst.name})`
    );
};

console.log(`cases: ${seen.size} orientations x 4 rotations = ${results.fixedWorldY.length}\n`);
summarise('(i)   outer pivot, fixed world-Y', results.fixedWorldY);
summarise('(ii)  outer pivot, exact P=B R B^-1', results.exactOuter);
summarise('(iii) inner pivot, exact P=R', results.exactInner);

// For the exact structures, report the required axis spread (what the pivot
// must be aimed at), to see whether it is a fixed axis.
console.log('\nrequired axis for exact inner pivot (P = R), across all cases:');
const axes = new Set();
const angles = new Set();
for (const o of seen.values()) {
    const M = Mrows(o);
    for (const op of Object.values(ops)) {
        const Mx = Mrows(op(o));
        const R = mul(Mx, T(M));
        // angle
        const tr = R[0][0] + R[1][1] + R[2][2];
        angles.add(
            ((Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI).toFixed(1)
        );
        // axis: from skew, or from (R+I) for the 180-degree case
        const sk = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
        const L = Math.hypot(...sk);
        if (L > 1e-6) {
            axes.add(sk.map(v => Math.round(v / L)).join(','));
        } else {
            // 180 degrees: axis is a column of (R+I) with the largest norm
            const cand = [0, 1, 2].map(j => [0, 1, 2].map(i => R[i][j] + (i === j ? 1 : 0)));
            const best = cand.reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a));
            const n = Math.hypot(...best);
            axes.add(`${best.map(v => Math.round(v / n)).join(',')} (180deg)`);
        }
    }
}
console.log(`  angles: ${[...angles].join(' / ')}`);
console.log(`  distinct axes: ${axes.size}`);
[...axes].forEach(a => console.log(`    ${a}`));
