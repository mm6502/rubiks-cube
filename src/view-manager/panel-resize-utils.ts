/**
 * Adds resize handles to a panel element for user interaction
 * @param panel - The panel element to add resize handles to
 * @param styles - CSS class names for styling the resize handles
 */
export function addResizeHandles(panel: HTMLElement, styles: Record<string, string>): void {
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];

    handles.forEach(direction => {
        const handle = document.createElement('div');
        handle.className = `${styles['resize-handle']} ${styles[direction]}`;
        handle.setAttribute('data-resize-direction', direction);
        panel.appendChild(handle);
    });
}

export default addResizeHandles;
