// Small inline SVG icons for gear, drawn beside the hero.

const OUTLINE = '#1e1f21';

export const SWORD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3h4v4L10 18l-4-4Z" fill="#d4d7dc" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/><path d="m5 13 6 6M7 17l-3 3" stroke="#ffc24a" stroke-width="2.5" stroke-linecap="round"/></svg>`;

// The same sword snapped off halfway, with a jagged break.
export const SWORD_BROKEN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 6.5 15 9l-1.5.5 1 1.5L10 18l-4-4Z" fill="#b9bcc2" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/><path d="m5 13 6 6M7 17l-3 3" stroke="#ffc24a" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export const SHIELD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5Z" fill="#3a86ff" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5v14" stroke="#9cc2ff" stroke-width="2"/></svg>`;

/** A key in the given CSS colour, for the HUD key slots. */
export const keyIcon = (color) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="12" r="4.5" fill="${color}" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="7.5" cy="12" r="1.6" fill="${OUTLINE}"/><path d="M12 10.5h9.5v3H20v3h-2.5v-3H12Z" fill="${color}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
