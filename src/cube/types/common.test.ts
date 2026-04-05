import { describe, expect, it } from 'vitest';

import { Axis, Color, ColorMap, FACE_COLORS, Face, resolveCubeColor } from './common';

describe('Face', () => {
    it('should contain all six faces', () => {
        expect(Face.U).toBe('U');
        expect(Face.D).toBe('D');
        expect(Face.F).toBe('F');
        expect(Face.B).toBe('B');
        expect(Face.L).toBe('L');
        expect(Face.R).toBe('R');
    });
});

describe('Axis', () => {
    it('should contain all three axes', () => {
        expect(Axis.X).toBe('X');
        expect(Axis.Y).toBe('Y');
        expect(Axis.Z).toBe('Z');
    });
});

describe('Color', () => {
    it('should contain all standard colors', () => {
        expect(Color.WHITE).toBe('white');
        expect(Color.YELLOW).toBe('yellow');
        expect(Color.RED).toBe('red');
        expect(Color.ORANGE).toBe('orange');
        expect(Color.BLUE).toBe('blue');
        expect(Color.GREEN).toBe('green');
    });
});

describe('ColorMap', () => {
    it('should map all colors to hex codes', () => {
        expect(ColorMap[Color.WHITE]).toBe('#ffffff');
        expect(ColorMap[Color.YELLOW]).toBe('#ffd500');
        expect(ColorMap[Color.RED]).toBe('#c41e3a');
        expect(ColorMap[Color.ORANGE]).toBe('#ff5800');
        expect(ColorMap[Color.BLUE]).toBe('#0051ba');
        expect(ColorMap[Color.GREEN]).toBe('#009b48');
    });
});

describe('resolveCubeColor', () => {
    it('should resolve canonical color names', () => {
        expect(resolveCubeColor('white')).toBe('#ffffff');
        expect(resolveCubeColor('yellow')).toBe('#ffd500');
        expect(resolveCubeColor('red')).toBe('#c41e3a');
        expect(resolveCubeColor('orange')).toBe('#ff5800');
        expect(resolveCubeColor('blue')).toBe('#0051ba');
        expect(resolveCubeColor('green')).toBe('#009b48');
    });
    it('should resolve legacy uppercase color names', () => {
        expect(resolveCubeColor('WHITE')).toBe('#ffffff');
        expect(resolveCubeColor('YELLOW')).toBe('#ffd500');
    });
    it('should return white for undefined or empty', () => {
        expect(resolveCubeColor(undefined)).toBe('#ffffff');
        expect(resolveCubeColor('')).toBe('#ffffff');
        expect(resolveCubeColor('   ')).toBe('#ffffff');
    });
    it('should return raw CSS color strings if not mapped', () => {
        expect(resolveCubeColor('#123456')).toBe('#123456');
        expect(resolveCubeColor('rgb(1,2,3)')).toBe('rgb(1,2,3)');
        expect(resolveCubeColor('hsl(1,2%,3%)')).toBe('hsl(1,2%,3%)');
        expect(resolveCubeColor('pink')).toBe('pink');
    });
});

describe('FACE_COLORS', () => {
    it('should map each face to a color', () => {
        expect(FACE_COLORS[Face.U]).toBe(Color.WHITE);
        expect(FACE_COLORS[Face.D]).toBe(Color.YELLOW);
        expect(FACE_COLORS[Face.F]).toBe(Color.RED);
        expect(FACE_COLORS[Face.B]).toBe(Color.ORANGE);
        expect(FACE_COLORS[Face.L]).toBe(Color.GREEN);
        expect(FACE_COLORS[Face.R]).toBe(Color.BLUE);
    });
});
