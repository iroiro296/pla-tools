// koro-pokemon のトレーナーページから「使用技」を取得し、pla-rta-route.js の各ポケモンに moves を付与する。
// ストーリーRTA用＝ルート(スプシ範囲)に載っているポケモンの技だけを紐付ける。
// 実行: node scripts/fetch-trainer-moves.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROUTE = resolve(__dirname, '../pla-rta-route.js')
const DATA = resolve(__dirname, '../pla-data.js')
const BASE = 'https://pente.koro-pokemon.com/legendsarceus/'

// ルートのトレーナー名(連番/接尾辞なし) → koroページ
const TRAINER_URL = {
  'ウォロ': 'trainer-woro.shtml',
  'ショウ': 'trainer-teru-shou.shtml',
  'ヨネ': 'trainer-yone.shtml',
  'キクイ': 'trainer-kikui.shtml',
  'カイ': 'trainer-kai.shtml',
  'オウメ': 'trainer-oume.shtml',
  'オタケ': 'trainer-otake.shtml',
  'オマツ': 'trainer-omatsu.shtml',
  'セキ': 'trainer-seki.shtml',
  'ツバキ': 'trainer-tsubaki.shtml',
  'ノボリ': 'trainer-nobori.shtml',
  'ハマレンゲ': 'trainer-hamarenge.shtml',
  'ワサビ': 'trainer-wasabi.shtml',
  'ムベ': 'trainer-mube.shtml',
  'デンボク': 'trainer-denboku.shtml',
}

async function fetchHTML(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return new TextDecoder('utf-8').decode(Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      if (t === tries - 1) throw e
      await new Promise(s => setTimeout(s, 500 * (t + 1)))
    }
  }
}

// 1ページ分のテーブルを解析 → { ベース名: [{lo,hi,moves}] }（Lvは範囲表記 Lv.38～41 にも対応）
function parseTrainerPage(html) {
  const map = {}
  html = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  for (const tm of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    for (const rm of tm[0].matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const cells = [...rm[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      const nameCell = cells.find(c => /Lv\./.test(c))
      if (!nameCell) continue
      const lvm = nameCell.match(/Lv\.(\d+)(?:[~～](\d+))?/)
      const lo = parseInt(lvm[1], 10), hi = lvm[2] ? parseInt(lvm[2], 10) : lo
      const name = nameCell.split(/\s*\(/)[0].trim()          // フォルム括弧の手前＝ベース名
      const moves = (cells[cells.length - 1] || '').split(/\s+/).filter(x => x && x !== '-')
      ;(map[name] = map[name] || []).push({ lo, hi, moves })
    }
  }
  return map
}

// 名前一致のうち、Lvが範囲内→なければ最も近いエントリの技を返す
function lookupMoves(page, name, lv) {
  const list = page && page[name]
  if (!list || !list.length) return null
  const inRange = list.find(e => lv >= e.lo && lv <= e.hi)
  if (inRange) return inRange.moves
  let best = null, bestD = Infinity
  for (const e of list) {
    const d = lv < e.lo ? e.lo - lv : lv - e.hi
    if (d < bestD) { bestD = d; best = e }
  }
  return bestD <= 4 ? best.moves : null                       // 4Lv以上離れていたら別個体とみなす
}

function baseTrainer(label) {
  return label.replace(/\d+$/, '')                            // ショウ2 → ショウ
}

async function main() {
  // PLA_MOVES を読み込み（技名検証用）
  const dctx = {}; vm.createContext(dctx)
  vm.runInContext(readFileSync(DATA, 'utf8').replace(/^const /gm, 'var '), dctx)
  const validMoves = new Set(Object.keys(dctx.PLA_MOVES))

  // 必要なトレーナーページのみ取得
  const pages = {}
  for (const [name, file] of Object.entries(TRAINER_URL)) {
    try {
      const html = await fetchHTML(BASE + file)
      pages[name] = parseTrainerPage(html)
      process.stdout.write(`  ${name}: ${Object.keys(pages[name]).length} 体  \r`)
    } catch (e) {
      console.warn('\n  fetch失敗:', name, file, e.message)
      pages[name] = {}
    }
  }
  process.stdout.write('\n')

  // ルートを読み込んで moves を付与
  const rctx = {}; vm.createContext(rctx)
  vm.runInContext(readFileSync(ROUTE, 'utf8').replace(/^const /gm, 'var '), rctx)
  const route = rctx.PLA_RTA_ROUTE

  const unmatched = [], badMoves = new Set()
  let hit = 0
  for (const g of route) {
    if (g.wild) continue                                       // 野生オヤブンはトレーナーでない
    const tr = baseTrainer(g.label)
    const page = pages[tr]
    for (const m of g.mons) {
      const moves = lookupMoves(page, m.n, m.lv)
      if (moves && moves.length) {
        moves.forEach(mv => { if (!validMoves.has(mv)) badMoves.add(mv) })
        m.moves = moves.filter(mv => validMoves.has(mv))
        hit++
      } else {
        unmatched.push(`${g.label} ${m.n} Lv${m.lv}`)
      }
    }
  }

  console.log(`技付与: ${hit} 体`)
  if (unmatched.length) console.log('未一致(技なし→learnsetのまま):\n  ' + unmatched.join('\n  '))
  if (badMoves.size) console.log('!! PLA_MOVESに無い技名:', [...badMoves].join(', '))

  const body = '// PLA アルセウスRTAルート順の対戦相手データ（Google Sheets由来・実数値H/B/D埋め込み）\n'
    + '// トレーナー単位でグループ化（mons=手持ち, moves=使用技/koro由来）。\n'
    + '// 再生成: node scripts/parse-rta-route.mjs <csv> → node scripts/fetch-trainer-moves.mjs\n'
    + 'const PLA_RTA_ROUTE = ' + JSON.stringify(route) + ';\n'
  writeFileSync(ROUTE, body)
  console.log('WROTE', ROUTE)
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
