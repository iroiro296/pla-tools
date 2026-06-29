// チェックリスト用アイコン: PLA_DEXの各 en スラッグ → 全国図鑑ID(フォルム対応) を PokeAPI から取得し、
// pla-icons.js（{ hisuiNo: pokeApiId }）を生成する。アイコン画像は jsDelivr の PokeAPI/sprites から ID で引く。
// 実行: node scripts/fetch-icon-ids.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const ctx = {}; vm.createContext(ctx)
vm.runInContext(readFileSync(resolve(root, 'pla-data.js'), 'utf8').replace(/^const /gm, 'var '), ctx)
const DEX = ctx.PLA_DEX

const map = {}, miss = []
const CONC = 8
async function one(d) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${d.en}`)
    if (res.ok) { const j = await res.json(); map[d.no] = j.id }
    else miss.push(`${d.no}:${d.en}(${res.status})`)
  } catch (e) { miss.push(`${d.no}:${d.en}(${e.message})`) }
}
for (let i = 0; i < DEX.length; i += CONC) {
  await Promise.all(DEX.slice(i, i + CONC).map(one))
  process.stdout.write(`\r取得 ${Object.keys(map).length}/${DEX.length}`)
}
console.log('')
if (miss.length) console.log('未取得:', miss.join(', '))

writeFileSync(resolve(root, 'pla-icons.js'),
  '// チェックリスト用 アイコンID: ヒスイ図鑑No → 全国図鑑ID(PokeAPI)。アイコンは jsDelivr の PokeAPI/sprites から ID で取得。\n'
  + '// 再生成: node scripts/fetch-icon-ids.mjs\n'
  + 'const PLA_ICONS = ' + JSON.stringify(map) + ';\n')
console.log('WROTE pla-icons.js', Object.keys(map).length, '件')
