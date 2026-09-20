// SCRATCH ANALYSIS — not part of the app.
//
// For every reachable Basic-view orientation, work out the WORLD-space rotation
// R that maps the current basis to the next one, for each of the four view
// rotations. If R's axis is constant, a single pivot rotating about a fixed CSS
// axis can animate any view rotation. If it varies, the pivot's axis must be
// derived from state per rotation.
//
// R = M' * Mᵀ   (M is orthogonal, so M⁻¹ = Mᵀ)
// M has CSS columns (vR, vU, vF).

const IDENTITY = { vR: { x: 1, y: 0, z: 0 }, vU: { x: 0, y: 1, z: 0 }, vF: { x: 0, y: 0, z: 1 } };

// Mirrors src/views/basic/navigation.ts
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

const key = o => [o.vR, o.vU, o.vF].map(v => `${v.x},${v.y},${v.z}`).join('|');

// 3x3 as column-major arrays m[col][row] -> we store rows for easy multiply.
const toRows = ({ vR, vU, vF }) => [
    [vR.x, vU.x, vF.x],
    [vR.y, vU.y, vF.y],
    [vR.z, vU.z, vF.z],
];
const transpose = m => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
];
const mul = (a, b) =>
    a.map((row, i) => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

function axisAngle(r) {
    const tr = r[0][0] + r[1][1] + r[2][2];
    const angle = (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
    // axis from the skew part
    const ax = [r[2][1] - r[1][2], r[0][2] - r[2][0], r[1][0] - r[0][1]];
    const len = Math.hypot(...ax);
    if (len < 1e-9) return { angle, axis: null };
    return { angle, axis: ax.map(v => Math.round(v / len)) };
}

// Enumerate all reachable orientations (the 24 rotations of the cube).
const ops = { left: rotLeft, right: rotRight, up: rotUp, down: rotDown };
const seen = new Map([[key(IDENTITY), IDENTITY]]);
const queue = [IDENTITY];
while (queue.length) {
    const cur = queue.shift();
    for (const op of Object.values(ops)) {
        const next = op(cur);
        if (!seen.has(key(next))) {
            seen.set(key(next), next);
            queue.push(next);
        }
    }
}
console.log(`reachable orientations: ${seen.size} (expect 24)\n`);

const M = toRows;
const axes = { left: new Set(), right: new Set(), up: new Set(), down: new Set() };
const angles = { left: new Set(), right: new Set(), up: new Set(), down: new Set() };

for (const o of seen.values()) {
    for (const [name, op] of Object.entries(ops)) {
        const next = op(o);
        const R = mul(M(next), transpose(M(o)));
        const { angle, axis } = axisAngle(R);
        axes[name].add(axis ? axis.join(',') : 'IDENTITY');
        angles[name].add(angle.toFixed(1));
    }
}

for (const name of ['left', 'right', 'up', 'down']) {
    console.log(
        `${name.padEnd(6)} angles=${[...angles[name]].join('/')}deg  distinct axes=${axes[name].size}  ${[...axes[name]].join('  ')}`
    );
}

// Also: for a 2-step and 3-step burst, the net rotation must be about the SAME
// axis as one step (only then can a single pivot animation represent it).
console.log('\nburst composition (left x N from IDENTITY):');
let o = { ...IDENTITY };
let accum = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];
for (let n = 1; n <= 4; n++) {
    const next = rotLeft(o);
    const R = mul(M(next), transpose(M(o)));
    accum = mul(R, accum);
    const { angle, axis } = axisAngle(accum);
    console.log(
        `  left x${n}: net ${angle.toFixed(1)}deg about ${axis ? axis.join(',') : 'identity'}`
    );
    o = next;
}
