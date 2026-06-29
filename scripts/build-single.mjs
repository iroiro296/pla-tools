// index.html に pla-data.js をインライン展開して、配布用の単一HTMLを生成
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const data = readFileSync(resolve(root, 'pla-data.js'), 'utf8')
const route = readFileSync(resolve(root, 'pla-rta-route.js'), 'utf8')
const catchr = readFileSync(resolve(root, 'pla-catchrate.js'), 'utf8')
const icons = readFileSync(resolve(root, 'pla-icons.js'), 'utf8')
const food = readFileSync(resolve(root, 'pla-food.js'), 'utf8')

let out = html.replace(
  '<script src="pla-data.js"></script>',
  '<script>\n/* ==== pla-data.js (inlined) ==== */\n' + data + '\n</script>'
)
out = out.replace(
  '<script src="pla-rta-route.js"></script>',
  '<script>\n/* ==== pla-rta-route.js (inlined) ==== */\n' + route + '\n</script>'
)
out = out.replace(
  '<script src="pla-catchrate.js"></script>',
  '<script>\n/* ==== pla-catchrate.js (inlined) ==== */\n' + catchr + '\n</script>'
)
out = out.replace(
  '<script src="pla-icons.js"></script>',
  '<script>\n/* ==== pla-icons.js (inlined) ==== */\n' + icons + '\n</script>'
)
out = out.replace(
  '<script src="pla-food.js"></script>',
  '<script>\n/* ==== pla-food.js (inlined) ==== */\n' + food + '\n</script>'
)
if (out === html) { console.error('!! script tag not found — abort'); process.exit(1) }

const dest = resolve(root, 'legends-arceus-damage-calc.html')
writeFileSync(dest, out)
console.log('WROTE single-file:', dest, '(' + Math.round(out.length / 1024) + ' KB)')
