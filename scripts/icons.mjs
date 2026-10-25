// Draws the app icon (a green coin with an ink "M") and renders the PNG sizes.
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'

const M = 'M156 346V166h50l50 80 50-80h50v180h-45V240l-45 70h-20l-45-70v106z'
const coin = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''}
  <circle cx="270" cy="270" r="200" fill="#111111"/>
  <circle cx="250" cy="250" r="200" fill="#00C26E" stroke="#111111" stroke-width="16"/>
  <circle cx="250" cy="250" r="160" fill="none" stroke="#111111" stroke-width="8" stroke-dasharray="4 18" stroke-linecap="round"/>
  <path d="${M}" transform="translate(-6 -6)" fill="#111111"/>
</svg>`

const scaled = (svg, s) => svg.replace('viewBox="0 0 512 512"', `viewBox="0 0 512 512" transform-origin="256 256"`).replace(/<circle cx="270"[\s\S]*<\/svg>/, (inner) =>
  `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">${inner.replace('</svg>', '')}</g></svg>`)

writeFileSync('public/icon.svg', coin(null))
const png = (svg, size, file) =>
  writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())
png(coin('#FFD23F'), 192, 'public/icon-192.png')
png(coin('#FFD23F'), 512, 'public/icon-512.png')
png(scaled(coin('#FFD23F'), 0.72), 512, 'public/icon-maskable-512.png')
png(scaled(coin('#FFD23F'), 0.86), 180, 'public/apple-touch-icon.png')
console.log('icons written')
