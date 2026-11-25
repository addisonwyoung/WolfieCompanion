import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cpSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDirectory = fileURLToPath(new URL('./public', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'exclude-original-library-photos',
    apply: 'build',
    writeBundle(options) {
      if (!options.dir) throw new Error('Expected a frontend output directory')
      // Publish optimized WebP images; preserve originals locally only.
      cpSync(publicDirectory, options.dir, { recursive: true,
        filter: source => {
          const asset = relative(publicDirectory, source).replaceAll('\\', '/')
          return !asset.startsWith('images/library/') || /^images\/library\/(north_reading_room|central_reading_room|health_sciences|music_library|third_floor)\.webp$/.test(asset)
        } })
    },
  }],
  build: { copyPublicDir: false },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
})
