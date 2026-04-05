import { isolateSvgIds } from './index';

describe('isolateSvgIds', () => {
    it('should append a unique suffix to all id attributes and update references', () => {
        // Arrange
        const svg =
            '<svg><defs><linearGradient id="grad1"></linearGradient></defs><rect fill="url(#grad1)" id="rect1" href="#grad1"/></svg>';
        // Act
        const result = isolateSvgIds(svg);
        // Assert
        expect(result).toMatch(/id="grad1-i\d+"/);
        expect(result).toMatch(/id="rect1-i\d+"/);
        expect(result).toMatch(/url\(#grad1-i\d+\)/);
        expect(result).toMatch(/href="#grad1-i\d+"/);
    });

    it('should not change unrelated attributes', () => {
        // Arrange
        const svg = '<svg><circle cx="10" cy="10" r="5" fill="red"/></svg>';
        // Act
        const result = isolateSvgIds(svg);
        // Assert
        expect(result).toContain('fill="red"');
        expect(result).toContain('<circle');
    });

    it('should handle SVGs with no ids gracefully', () => {
        // Arrange
        const svg = '<svg><g><path d="M0 0L10 10"/></g></svg>';
        // Act
        const result = isolateSvgIds(svg);
        // Assert
        expect(result).toContain('<svg>');
        expect(result).toContain('<g>');
        expect(result).toContain('<path');
    });

    it('should keep unmapped href/url references unchanged', () => {
        // Arrange
        const svg =
            '<svg><defs><linearGradient id="grad1"></linearGradient></defs><rect fill="url(#missing)" href="#missing"/></svg>';

        // Act
        const result = isolateSvgIds(svg);

        // Assert
        expect(result).toContain('id="grad1-i');
        expect(result).toContain('fill="url(#missing)"');
        expect(result).toContain('href="#missing"');
    });
});
