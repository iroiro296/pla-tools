// 捕獲率計算用: koro/datamine由来のcatch ratesテーブルを、自前のPLA_DEXに基礎値マッチで紐付け、
// pla-catchrate.js（{ dexNo: catchRate }）を生成する。
// 入力CSV: capture calculator スプシ "catch rates" シート → scripts/catchrates.csv
// 実行: node scripts/fetch-catchrate.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, '../pla-data.js')
const CSV = resolve(__dirname, 'catchrates.csv')
const OUT = resolve(__dirname, '../pla-catchrate.js')

// CSV行をパース（クォート対応）
function parseRow(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
  }
  out.push(cur); return out
}

const dctx = {}; vm.createContext(dctx)
vm.runInContext(readFileSync(DATA, 'utf8').replace(/^const /gm, 'var '), dctx)
const DEX = dctx.PLA_DEX

// catch ratesテーブル: 基礎値キー → catchRate
const lines = readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean)
const byStats = new Map()
for (let i = 1; i < lines.length; i++) {
  const c = parseRow(lines[i])
  const present = c[4] === 'TRUE'
  if (!present) continue
  const key = [c[10], c[11], c[12], c[13], c[14], c[15]].join(',')  // HP,ATK,DEF,SPA,SPD,SPE
  const cr = parseInt(c[19], 10)
  if (!byStats.has(key) && Number.isFinite(cr)) byStats.set(key, cr)
}

// 基礎値マッチで拾えない種の手動補正（自前dexの基礎値が誤っている等）
const NAME_OVERRIDE = { 'クレセリア': 45 }

const map = {}
const miss = []
for (const d of DEX) {
  const key = [d.base.h, d.base.a, d.base.b, d.base.c, d.base.d, d.base.s].join(',')
  const cr = byStats.get(key) ?? NAME_OVERRIDE[d.name]
  if (cr != null) map[d.no] = cr
  else miss.push(d.name)
}

console.log('catchRate付与:', Object.keys(map).length, '/', DEX.length)
if (miss.length) console.log('未一致:', miss.join(', '))
// サンプル
;['ピカチュウ', 'コイキング', 'ディアルガ', 'ムクホーク'].forEach(n => {
  const d = DEX.find(x => x.name === n); console.log(' ', n, '=>', d ? map[d.no] : '?')
})

writeFileSync(OUT,
  '// 種族別 捕獲率(catch_rate)。Legends Arceus capture calculatorスプシ由来。\n'
  + '// 再生成: node scripts/fetch-catchrate.mjs\n'
  + 'const PLA_CATCHRATE = ' + JSON.stringify(map) + ';\n')
console.log('WROTE', OUT)
