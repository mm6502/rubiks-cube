// Shared linked-rotation state for Basic Front and Basic Back views.
// When linked is true, rotate-view-left/right/up/down applied in one view
// is also applied in the other.
// State is persisted via BasicView.getState()/setState() — the ViewManager
// handles storage so this module stays free of direct localStorage access.
let linked: boolean = true;

export function isLinked(): boolean {
    return linked;
}

export function setLinked(value: boolean): void {
    linked = value;
}
