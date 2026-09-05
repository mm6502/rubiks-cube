// Family-scoped linked-rotation state for the Basic view family.
// When linked is true for a family, rotate-view-left/right/up/down applied in
// one view is also applied in the sibling view for that same family.
// State is persisted via BasicView.getState()/setState() — the ViewManager
// handles storage so this module stays free of direct localStorage access.
const linkedStates = new Map<string, boolean>();

function getFamilyKey(viewType: string): string {
    // Every Basic viewType (basic-front/basic-back) shares the single
    // 'basic' family, while any other viewType keeps its own key so
    // cross-family events stay distinct.
    return viewType.startsWith('basic-') ? 'basic' : viewType;
}

export function getFamilyKeyFromViewType(viewType?: string): string {
    if (!viewType) return 'basic';
    return getFamilyKey(viewType);
}

export function isSameFamily(viewTypeA?: string, viewTypeB?: string): boolean {
    return getFamilyKeyFromViewType(viewTypeA) === getFamilyKeyFromViewType(viewTypeB);
}

export function isLinked(viewType?: string): boolean {
    if (!viewType) return linkedStates.get('basic') ?? true;
    return linkedStates.get(getFamilyKey(viewType)) ?? true;
}

export function setLinked(value: boolean, viewType?: string): void {
    const familyKey = viewType ? getFamilyKey(viewType) : 'basic';
    linkedStates.set(familyKey, value);
}
