import { Face } from '@/cube/types';

import { FACE_TOP_DIRECTION_HINTS, tiltAngleFromHint } from './direction-mapping';

const FACE_LABEL_RESET_MS = 1500;

/**
 * Manages face-label tilt animations on the circular SVG.
 * Tilts labels on keyboard activity and resets after idle.
 */
export class FaceLabelTiltController {
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly getSvgRoot: () => SVGSVGElement | undefined | null) {}

    /** Tilt all face labels and schedule a reset after idle. */
    flash(): void {
        this.setRotations(true);
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.setRotations(false), FACE_LABEL_RESET_MS);
    }

    /** Clear any pending reset timer. */
    destroy(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    /** Apply or remove tilt rotation on every face label element. */
    private setRotations(tilted: boolean): void {
        const svg = this.getSvgRoot();
        if (!svg) return;

        for (const face in Face) {
            // Get the label element for this face.
            const el = svg.getElementById(`face-label-${face}`);
            if (!el) continue;

            // Parse out its center coordinates from the transform attribute.
            const [tx, ty] =
                el
                    .getAttribute('transform')
                    ?.match(/translate\(([-\d.]+),([-\d.]+)\)/)
                    ?.slice(1, 3)
                    .map(Number) ?? [];
            if (tx === undefined || ty === undefined) continue;

            // Get the tilt angle and apply it if tilted, or reset to 0 if not.
            const angle = tiltAngleFromHint(
                FACE_TOP_DIRECTION_HINTS[Face[face as keyof typeof Face]]
            );
            el.setAttribute(
                'transform',
                tilted ? `translate(${tx},${ty}) rotate(${angle})` : `translate(${tx},${ty})`
            );
        }
    }
}
