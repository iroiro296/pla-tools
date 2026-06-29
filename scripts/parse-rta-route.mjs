// RTAルート表(Google Sheets CSV)を解析し、pla-data.jsのdexと突き合わせて
// ルート順のプリセット配列を生成する。
// 列: 0=トレーナー 1=ポケモン 2=Lv 3=注記 4-9=基礎HABCDS 11-16=実数値HABCDS
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, '../pla-data.js')
const CSV = process.argv[2] || resolve(__dirname, '../rta-sheet.csv')

const src = readFileSync(DATA, 'utf8')
const ctx = {}; vm.createContext(ctx)
vm.runInContext(src.replace(/^const /gm, 'var '), ctx)
const DEX = ctx.PLA_DEX

// 名前（フォルム接尾辞除去）でベース名を取り出す
const baseName = n => n.replace(/（.*）$/, '')

function resolveDex(name, sb) {
  // sb = [h,a,b,c,d,s] 基礎値（数値 or null）
  const cands = DEX.filter(d => baseName(d.name) === name)
  if (cands.length === 0) return { dex: null, reason: 'no-name-match' }
  if (cands.length === 1) {
    const d = cands[0]
    const anomaly = sb && !baseMatch(d, sb)
    return { dex: d, anomaly }
  }
  // 複数フォルム: 基礎値一致で選ぶ
  if (sb) {
    const hit = cands.find(d => baseMatch(d, sb))
    if (hit) return { dex: hit }
    // 一致なし → ヒスイ優先（PLA入手はヒスイ形が多い）でフォルム不明フラグ
    const hisui = cands.find(d => /（ヒスイ）/.test(d.name)) || cands[0]
    return { dex: hisui, anomaly: true, formGuess: true }
  }
  // 基礎値なし → ヒスイ優先
  const hisui = cands.find(d => /（ヒスイ）/.test(d.name)) || cands[0]
  return { dex: hisui, formGuess: true }
}
function baseMatch(d, sb) {
  const b = d.base
  return b.h === sb[0] && b.a === sb[1] && b.b === sb[2] && b.c === sb[3] && b.d === sb[4] && b.s === sb[5]
}

const lines = readFileSync(CSV, 'utf8').split(/\r?\n/)
const num = v => { const n = parseInt((v || '').trim(), 10); return Number.isFinite(n) ? n : null }

// メインルートはスプレッドシート行2〜64。それ以降(66〜)は重複名/異常値のスクラッチ計算なので除外
const MAX_ROW = 64
// このルートの野生オヤブン(アルファ)。col0(場所/空欄)に関わらずポケモン名で単独グループ化する
const OYABUN_MONS = new Set(['コロトック', 'ヌメルゴン', 'ゾロアーク', 'ハリーマン'])
// グループ化: オヤブン=単独グループ(ポケモン名)、col0非空=新グループ、空欄=直前グループに手持ち追加
const groups = []
const report = []
for (let i = 1; i < lines.length; i++) {
  if (i + 1 > MAX_ROW) break
  const c = lines[i].split(',')
  const name = (c[1] || '').trim()
  const lv = num(c[2])
  const note = (c[3] || '').trim()
  const sb = [4,5,6,7,8,9].map(j => num(c[j]))
  const act = { h: num(c[11]), a: num(c[12]), b: num(c[13]), c: num(c[14]), d: num(c[15]), s: num(c[16]) }
  // ポケモン名＋Lv＋実数値Hが揃う行のみ採用（ノーブル等の空欄行は除外）
  if (!name || lv === null || act.h === null) { continue }
  const hasBase = sb.every(x => x !== null)
  const r = resolveDex(name, hasBase ? sb : null)
  const trainer = (c[0] || '').trim()
  // 「W」「N体同時」は別トレーナーでなく "上のトレーナーが同時に出す" マーカー → 手持ち扱い
  const isSimulMarker = trainer === 'W' || /体同時$/.test(trainer)
  const isWildAlpha = OYABUN_MONS.has(name) || /オヤブン/.test(note)
  const mon = { n: name, no: r.dex ? r.dex.no : null, lv, H: act.h, A: act.a, B: act.b, C: act.c, D: act.d, note: isWildAlpha ? 'オヤブン' : note }

  if (isWildAlpha) {
    groups.push({ trainer: name + '(オヤブン)', wild: true, mons: [mon] })   // 野生アルファは単独・ポケモン名
  } else if (trainer && !isSimulMarker) {
    groups.push({ trainer, wild: false, mons: [mon] })
  } else if (groups.length === 0) {
    groups.push({ trainer: name, wild: true, mons: [mon] })
  } else {
    groups[groups.length - 1].mons.push(mon)                  // 空欄/同時マーカー → 直前トレーナーの手持ち
  }
  report.push(`row${i+1} ${(c[0]||'').padEnd(6)} ${name}(Lv${lv})${note?'['+note+']':''} → ${r.dex?r.dex.name:'??'} ${r.anomaly?'⚠基礎値不一致':''}${r.formGuess?'?フォルム推定':''}`)
}

// 同名トレーナーが複数バトル → ショウ1/ショウ2… と連番。1回のみは無印
const counts = {}
for (const g of groups) if (!g.wild) counts[g.trainer] = (counts[g.trainer] || 0) + 1
const running = {}
for (const g of groups) {
  if (!g.wild && counts[g.trainer] > 1) {
    running[g.trainer] = (running[g.trainer] || 0) + 1
    g.label = g.trainer + running[g.trainer]
  } else {
    g.label = g.trainer
  }
}

console.log('=== グループ ===')
groups.forEach((g, i) => console.log(`${String(i+1).padStart(2)} [${g.label}]${g.wild?'(野生)':''} ${g.mons.map(m=>m.n+'Lv'+m.lv+(m.note?'('+m.note+')':'')).join(' / ')}`))
console.log('\nグループ数:', groups.length, '/ 総ポケモン:', groups.reduce((s,g)=>s+g.mons.length,0))
const noMatch = []
groups.forEach(g => g.mons.forEach(m => { if (m.no === null) noMatch.push(m.n) }))
if (noMatch.length) console.log('!! 名前未解決:', noMatch.join(', '))

// pla-rta-route.js を書き出し
const route = groups.map(g => ({ label: g.label, wild: g.wild, mons: g.mons }))
const OUT = resolve(__dirname, '../pla-rta-route.js')
const body = '// PLA アルセウスRTAルート順の対戦相手データ（Google Sheets由来・実数値H/B/D埋め込み）\n'
  + '// トレーナー単位でグループ化（mons=手持ち）。再生成: node scripts/parse-rta-route.mjs <csv>\n'
  + 'const PLA_RTA_ROUTE = ' + JSON.stringify(route) + ';\n'
const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, body)
console.log('\nWROTE', OUT)
