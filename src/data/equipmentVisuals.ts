/** Resolve older saved blueprints whose equipment predates the explicit visualKind field. */
export function legacyVisualKind(tag: string) {
  if (tag === 'KIT-123') return 'locker'
  if (tag === 'KIT-202') return 'kitchen'
  if (tag.startsWith('DIN-')) return 'dining-table'
  // B3/B4 plant series share a tag prefix across otherwise unrelated machines.
  if (/^[A-Z]+-[34]\d\d[AB]?$/.test(tag)) return tag.replace(/[AB]$/, '')
  return tag.split('-')[0]
}
