// ポケモンの好物(エサ5種): 攻略大百科(gamepedia)の各ポケモン個別ページ「好きなエサ」から取得し、
// pla-food.js（{ ヒスイ図鑑No: [好物カテゴリ...] }）を生成する。
// 図鑑一覧(archives/3792)で 図鑑No→monsterID を引き、各monsterページの「好きなエサ」欄をパース。
// 実行: node scripts/fetch-food.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const BASE = 'https://gamepedia.jp/pokemon-legends-arceus'
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (research; pla-calc)' } }

const FULL2SHORT = { 'きらきらミツ': 'ミツ', 'いきいきイナホ': 'イナホ', 'ころころマメ': 'マメ', 'もちもちキノコ': 'キノコ', 'ごりごりミネラル': 'ミネラル' }
const ORDER = ['キノコ', 'ミネラル', 'ミツ', 'イナホ', 'マメ']  // 表示用の正規順

async function get(url) { const r = await fetch(url, UA); if (!r.ok) throw new Error(r.status); return r.text() }

// 1) 図鑑一覧 → No→monsterID（フォルム重複は先頭採用）
const idxHtml = await get(BASE + '/archives/3792')
const re = /monsters\/(\d+)"><div class="label label-number">No\.(\d+)<\/div><br><img[^>]*><div class="text-black">([^<]+)<\/div>/g
const byNo = new Map()
for (const m of idxHtml.matchAll(re)) { const no = +m[2]; if (!byNo.has(no)) byNo.set(no, { id: +m[1], name: m[3].trim() }) }
console.log('図鑑インデックス:', byNo.size, '種')

// 2) 各ページの「好きなエサ」をパース
function parseFoods(html) {
  const s = html.indexOf('好きなエサ'); if (s < 0) return []
  const after = html.slice(s)
  const end = after.indexOf('inner_th', 10)
  const block = after.slice(0, end > 0 ? end : 1800)
  const found = new Set()
  for (const m of block.matchAll(/<span>([^<]+)<\/span>/g)) { const sh = FULL2SHORT[m[1].trim()]; if (sh) found.add(sh) }
  return ORDER.filter(f => found.has(f))
}

const map = {}, none = []
const entries = [...byNo.entries()]
const CONC = 6
for (let i = 0; i < entries.length; i += CONC) {
  await Promise.all(entries.slice(i, i + CONC).map(async ([no, { id, name }]) => {
    for (let t = 0; t < 2; t++) {
      try { const html = await get(`${BASE}/monsters/${id}`); const foods = parseFoods(html); map[no] = foods; if (!foods.length) none.push(`${no}:${name}`); return }
      catch (e) { if (t === 1) { map[no] = []; none.push(`${no}:${name}(err)`) } }
    }
  }))
  process.stdout.write(`\r取得 ${Object.keys(map).length}/${byNo.size}`)
}
console.log('')
if (none.length) console.log('好物なし/失敗:', none.join(', '))

// No順に並べて出力
const ordered = {}; for (const no of [...Object.keys(map)].map(Number).sort((a, b) => a - b)) ordered[no] = map[no]
writeFileSync(resolve(root, 'pla-food.js'),
  '// ポケモンの好物(エサ): ヒスイ図鑑No → [キノコ/ミネラル/ミツ/イナホ/マメ]。攻略大百科(gamepedia)由来。\n'
  + '// 再生成: node scripts/fetch-food.mjs\n'
  + 'const PLA_FOOD = ' + JSON.stringify(ordered) + ';\n')
console.log('WROTE pla-food.js', Object.keys(ordered).length, '件')
// 統計
const cnt = {}; ORDER.forEach(f => cnt[f] = 0); Object.values(ordered).forEach(a => a.forEach(f => cnt[f]++))
console.log('食物別の数:', JSON.stringify(cnt))
