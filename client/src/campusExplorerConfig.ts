import type { CampusCategory } from './campusLocations'

export const categoryLabels: Record<CampusCategory, string> = {
  microwave: 'Microwaves', outdoor_lounge: 'Outdoor lounges', study_spot: 'Study spots',
  printer: 'Printers', drinking_water: 'Drinking water',
}
export const categoryPaths: Record<CampusCategory, string> = {
  microwave: 'M3 6h18v13H3z M6 9h9v7H6z M18 10h.1 M18 14h.1 M5 19v2 M19 19v2',
  outdoor_lounge: 'M4 13h16 M6 13V8h12v5 M6 13v7 M18 13v7 M3 17h18 M9 4V2 M15 4V2',
  study_spot: 'M12 6C8 3 4 4 2 5v14c4-2 7-1 10 1 3-2 6-3 10-1V5c-2-1-6-2-10 1z M12 6v14',
  printer: 'M6 8V3h12v5 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 11h.1',
  drinking_water: 'M12 2C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-13z M9 15c0 2 1 3 3 3',
}
export const campusCenter: [number, number] = [40.9143, -73.1234]
export interface CampusViewport { center: [number, number]; zoom: number }
export const initialViewport: CampusViewport = { center: campusCenter, zoom: 16 }
export interface ExplorerConfig { key: string; mapId: string; feedback: string }
export const explorerConfig: ExplorerConfig = {
  key: import.meta.env.VITE_MAPTILER_API_KEY || '', mapId: import.meta.env.VITE_MAPTILER_MAP_ID || '', feedback: import.meta.env.VITE_CAMPUS_FEEDBACK_URL || '',
}
export function tilesConfigured(config: ExplorerConfig) {
  return !!config.key && !/YOUR_|REPLACE|PLACEHOLDER/i.test(config.key) && /^[a-zA-Z0-9_-]+$/.test(config.mapId) && !/YOUR_|REPLACE|PLACEHOLDER/i.test(config.mapId)
}
// Add authentication only to MapTiler HTTPS requests (style, TileJSON, glyphs,
// sprites and tiles). Never forward the key to another style/source host.
export function maptilerRequest(url: string, key: string) {
  try {
    const target = new URL(url)
    if (target.protocol === 'https:' && target.hostname === 'api.maptiler.com') {
      target.searchParams.set('key', key)
      return { url: target.toString() }
    }
  } catch { /* MapLibre may supply a relative or non-HTTP resource URL. */ }
  return { url }
}
export function feedbackLink(destination: string, location?: { id: string; name: string }) {
  try {
    const url = new URL(destination)
    if (!['https:', 'mailto:'].includes(url.protocol) || url.username || url.password || (url.protocol === 'https:' && !url.hostname) || /YOUR_|REPLACE|PLACEHOLDER/i.test(destination)) return null
    if (location) {
      if (url.protocol === 'mailto:') {
        url.searchParams.set('subject', 'Campus Explorer: report an issue')
        url.searchParams.set('body', `Location: ${location.name}\nID: ${location.id}\nIssue: `)
      } else url.searchParams.set('location', `${location.id}: ${location.name}`)
    }
    return url.toString()
  } catch { return null }
}
