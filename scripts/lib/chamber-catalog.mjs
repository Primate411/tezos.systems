import fs from 'node:fs/promises';

// Browser ES module in a CommonJS package: load the pure canonical metadata
// without changing runtime packaging or maintaining a second topic/room list.
const source = await fs.readFile(new URL('../../js/core/site-map.js', import.meta.url), 'utf8');
const { CHAMBER_CATEGORY_META } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

/** Independent snapshots keep measurement and smoke consumers from mutating
 * each other's expectations while sharing the site's category membership. */
export function getChamberCategories() {
  return CHAMBER_CATEGORY_META.map(category => ({ ...category, entryIds: [...category.entryIds] }));
}
