/** Fixed slots for custom countries (the measuring grid's size never changes). */
export const CUSTOM_SLOT_COUNT = 24;
export const CUSTOM_SLOT_IDS = Array.from({ length: CUSTOM_SLOT_COUNT }, (_, i) => `custom-${i + 1}`);
export const isCustomId = (id: string) => id.startsWith('custom-');
