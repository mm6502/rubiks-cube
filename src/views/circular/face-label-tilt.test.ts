import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import { FaceLabelTiltController } from './face-label-tilt';

function createMockSvg(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    for (const face of Object.values(Face)) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.id = `face-label-${face}`;
        el.setAttribute('transform', `translate(${100},${200})`);
        svg.appendChild(el);
    }

    return svg as SVGSVGElement;
}

describe('FaceLabelTiltController', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should apply tilt rotations on flash()', () => {
        const svg = createMockSvg();
        const controller = new FaceLabelTiltController(() => svg);

        controller.flash();

        // Check that at least one face label got a rotation
        const el = svg.getElementById(`face-label-${Face.F}`);
        const transform = el?.getAttribute('transform') ?? '';
        expect(transform).toContain('rotate(');
    });

    it('should remove tilt rotations after timeout', () => {
        const svg = createMockSvg();
        const controller = new FaceLabelTiltController(() => svg);

        controller.flash();

        // Fast-forward past the reset timeout (1500ms)
        vi.advanceTimersByTime(1600);

        const el = svg.getElementById(`face-label-${Face.F}`);
        const transform = el?.getAttribute('transform') ?? '';
        expect(transform).not.toContain('rotate(');
    });

    it('should reset previous timer on rapid consecutive flash() calls', () => {
        const svg = createMockSvg();
        const controller = new FaceLabelTiltController(() => svg);

        controller.flash();
        vi.advanceTimersByTime(1000); // 1s into first flash
        controller.flash(); // restart timer

        vi.advanceTimersByTime(1000); // 1s after second flash — still tilted
        const el = svg.getElementById(`face-label-${Face.F}`);
        expect(el?.getAttribute('transform')).toContain('rotate(');

        vi.advanceTimersByTime(600); // now 1.6s after second flash — reset
        expect(el?.getAttribute('transform')).not.toContain('rotate(');
    });

    it('should handle missing SVG root gracefully', () => {
        const controller = new FaceLabelTiltController(() => undefined);
        // Should not throw
        controller.flash();
        vi.advanceTimersByTime(1600);
    });

    it('should handle null SVG root gracefully', () => {
        const controller = new FaceLabelTiltController(() => null);
        controller.flash();
        vi.advanceTimersByTime(1600);
    });

    it('destroy() should clear pending timer', () => {
        const svg = createMockSvg();
        const controller = new FaceLabelTiltController(() => svg);

        controller.flash();
        controller.destroy();

        // Advancing time should NOT reset rotations since timer was cleared
        // Actually, destroy just clears the timer; the rotations stay as-is
        vi.advanceTimersByTime(2000);

        // Verify no errors and rotations remain (timer was cleared)
        const el = svg.getElementById(`face-label-${Face.F}`);
        expect(el?.getAttribute('transform')).toContain('rotate(');
    });

    it('should skip elements with missing transform attribute', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // Create a face label without transform attribute
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.id = `face-label-${Face.F}`;
        // No transform attribute set
        svg.appendChild(el);

        const controller = new FaceLabelTiltController(() => svg as SVGSVGElement);
        // Should not throw
        controller.flash();
    });

    it('should skip elements with invalid transform format', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.id = `face-label-${Face.F}`;
        el.setAttribute('transform', 'scale(2)'); // No translate()
        svg.appendChild(el);

        const controller = new FaceLabelTiltController(() => svg as SVGSVGElement);
        // Should not throw
        controller.flash();
    });
});
