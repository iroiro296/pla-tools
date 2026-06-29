// PLA覚え技データをkoro-pokemonから取得してpla-data.jsを更新する
// koro-pokemonはPLA全技（レベルわざ+おしえわざ）を日本語名で収録
// 実行: node scripts/fetch-learnsets.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, '../pla-data.js')
const KORO = 'https://pente.koro-pokemon.com/zukan/'

// PokeAPI en_slug → koro-pokemon URLパス（特殊ケース）
const SPECIAL_MAP = {
  // PLA新規
  'wyrdeer':              'legendsarceus/ayashishi.shtml',
  'kleavor':              'legendsarceus/basagiri.shtml',
  'ursaluna':             'legendsarceus/ursaluna.shtml',
  'sneasler':             'legendsarceus/sneasler.shtml',
  'overqwil':             'legendsarceus/overqwil.shtml',
  'basculegion':          'legendsarceus/idaitou.shtml',
  'enamorus-incarnate':   'legendsarceus/enamorus.shtml',
  'enamorus-therian':     'legendsarceus/enamorusr.shtml',
  // ヒスイのすがた
  'decidueye-hisui':      'legendsarceus/junaipaah.shtml',
  'typhlosion-hisui':     'legendsarceus/bakufuunh.shtml',
  'samurott-hisui':       'legendsarceus/daikenkih.shtml',
  'lilligant-hisui':      'legendsarceus/dorediah.shtml',
  'arcanine-hisui':       'legendsarceus/uindhih.shtml',
  'growlithe-hisui':      'legendsarceus/gaadhih.shtml',
  'qwilfish-hisui':       'legendsarceus/hariisenh.shtml',
  'zorua-hisui':          'legendsarceus/zoroah.shtml',
  'zoroark-hisui':        'legendsarceus/zoroaakuh.shtml',
  'goodra-hisui':         'legendsarceus/goodrah.shtml',
  'sliggoo-hisui':        'legendsarceus/sliggooh.shtml',
  'avalugg-hisui':        'legendsarceus/avaluggh.shtml',
  'voltorb-hisui':        'legendsarceus/biriridamah.shtml',
  'electrode-hisui':      'legendsarceus/marumainh.shtml',
  'sneasel-hisui':        'legendsarceus/nyuurah.shtml',
  'braviary-hisui':       'legendsarceus/wooguruh.shtml',
  // 伝説（PLA専用フォーム）
  'dialga':               'legendsarceus/dhiarugal.shtml',
  'palkia':               'legendsarceus/parukial.shtml',
  // 番号なしURLの通常種
  'basculin-white-striped': 'basurao.shtml',
  'tornadus-incarnate':   'torunerosu.shtml',
  'thundurus-incarnate':  'borutorosu.shtml',
  'landorus-incarnate':   'randorosu.shtml',
  'goomy':                'xy/goomy.shtml',
  'rufflet':              'washibon.shtml',
  'petilil':              'churine.shtml',
  // Gen5スターター（koro: 名前ベースURL）
  'oshawott':             'mijumaru.shtml',
  'dewott':               'hutachimaru.shtml',
  // Gen7スターター（koro: /sm/ディレクトリ）
  'rowlet':               'sm/mokuroo.shtml',
  'dartrix':              'sm/fukusuroo.shtml',
  // XY追加
  'sylveon':              'xy/ninfia.shtml',
  'bergmite':             'xy/bergmite.shtml',
  // イダイトウ（en: basculegion-maleが正）
  'basculegion-male':     'legendsarceus/idaitou.shtml',
}

async function getJSON(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      if (t === tries - 1) throw e
      await new Promise(s => setTimeout(s, 400 * (t + 1)))
    }
  }
}

async function fetchHTML(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const buf = Buffer.from(await r.arrayBuffer())
      return new TextDecoder('utf-8').decode(buf)
    } catch (e) {
      if (t === tries - 1) throw e
      await new Promise(s => setTimeout(s, 500 * (t + 1)))
    }
  }
}

async function pool(items, limit, fn) {
  const ret = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx) }
  }))
  return ret
}

// PLAセクション（h2の "(PLA)" を含む部分）から「レベルわざ」「おしえわざ」を分けて抽出
function parsePlaLearnset(html, validMoves) {
  const re = /<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>/gi
  let m
  const sections = []
  while ((m = re.exec(html)) !== null) {
    const t = m[0].replace(/<[^>]+>/g, '').trim()
    sections.push({ pos: m.index, end: m.index + m[0].length, text: t })
  }
  const level = new Set(), tutor = new Set()
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    if (!s.text.includes('(PLA)')) continue   // (PLZA)等は除外
    const target = s.text.includes('レベルわざ') ? level : s.text.includes('おしえわざ') ? tutor : null
    if (!target) continue
    const nextPos = i + 1 < sections.length ? sections[i + 1].pos : html.length
    const chunk = html.slice(s.end, nextPos)
    const rn = /<a [^>]*>([^<]+)<\/a>/g
    let nm
    while ((nm = rn.exec(chunk)) !== null) {
      const t = nm[1].trim()
      if (validMoves.has(t)) target.add(t)
    }
  }
  return { level: [...level], tutor: [...tutor].filter(x => !level.has(x)) }  // 伝授技からレベル技重複を除く
}

async function main() {
  // pla-data.jsを読み込む（vmでconst変数をキャプチャ）
  const src = readFileSync(DATA, 'utf8')
  const ctx = vm.createContext({})
  vm.runInContext(src.replace(/^const /gm, 'var '), ctx)
  const { PLA_MOVES, PLA_DEX } = ctx

  const validMoves = new Set(Object.keys(PLA_MOVES))
  console.log('PLA_MOVES:', validMoves.size, '/ PLA_DEX:', PLA_DEX.length)

  // 各ポケモンのkoro URL決定
  const specialEntries = []
  const natEntries = []
  for (const d of PLA_DEX) {
    if (SPECIAL_MAP[d.en]) specialEntries.push(d)
    else natEntries.push(d)
  }
  console.log('SPECIAL_MAP hits:', specialEntries.length, '/ nat lookup:', natEntries.length)

  // 国番号をPokeAPIから取得（バッチ）
  const nat = {}  // d.no → national dex number
  await pool(natEntries, 12, async (d) => {
    try {
      const pk = await getJSON('https://pokeapi.co/api/v2/pokemon/' + d.en)
      const n = parseInt(pk.species.url.match(/\/(\d+)\/?$/)[1])
      nat[d.no] = n
    } catch (e) {
      console.warn('  nat lookup failed:', d.en, e.message)
    }
  })

  // koro URL確定
  const koroUrl = {}
  for (const d of PLA_DEX) {
    if (SPECIAL_MAP[d.en]) {
      koroUrl[d.no] = KORO + SPECIAL_MAP[d.en]
    } else if (nat[d.no]) {
      koroUrl[d.no] = KORO + String(nat[d.no]).padStart(3, '0') + '.shtml'
    }
  }

  // koro-pokemon HTMLをフェッチしてPLAわざを抽出（8並列）
  console.log('fetching learnsets from koro-pokemon ...')
  const learnsets = {}  // d.no → [moveName, ...]

  let done = 0
  await pool(PLA_DEX, 8, async (d) => {
    const url = koroUrl[d.no]
    if (!url) { done++; return }
    try {
      const html = await fetchHTML(url)
      const moves = parsePlaLearnset(html, validMoves)
      if (moves.level.length > 0 || moves.tutor.length > 0) learnsets[d.no] = moves
    } catch (e) {
      console.warn('  fetch failed:', d.name, url.split('/').pop(), e.message)
    }
    done++
    if (done % 30 === 0 || done === PLA_DEX.length) process.stdout.write(`\r  ${done}/${PLA_DEX.length} done  `)
  })
  process.stdout.write('\n')

  const withLS = Object.keys(learnsets).length
  const totalLv = Object.values(learnsets).reduce((s, ls) => s + ls.level.length, 0)
  const totalTu = Object.values(learnsets).reduce((s, ls) => s + ls.tutor.length, 0)
  console.log(`learnsets: ${withLS}/${PLA_DEX.length} pokemon, lv計${totalLv}/伝授計${totalTu}`)

  // pla-data.jsを再生成（learnset=レベル技 / tutor=伝授技）
  const newDex = PLA_DEX.map(d => {
    const ls = learnsets[d.no]
    const entry = { no: d.no, name: d.name, en: d.en, types: d.types, base: d.base }
    if (ls && ls.level.length > 0) entry.learnset = ls.level
    if (ls && ls.tutor.length > 0) entry.tutor = ls.tutor
    return entry
  })

  // 既存src から PLA_DEX の行だけ置換
  const newBody = src.replace(
    /const PLA_DEX = [\s\S]*?;(\n|$)/,
    'const PLA_DEX = ' + JSON.stringify(newDex, null, 0) + ';\n'
  )
  writeFileSync(DATA, newBody)
  console.log('WROTE', DATA)

  // サンプル確認
  ;['ジュナイパー（ヒスイ）', 'レジギガス', 'ピカチュウ', 'コイキング'].forEach(name => {
    const d = newDex.find(d => d.name === name)
    console.log(name + ': lv', d?.learnset?.length ?? 0, '['+(d?.learnset?.slice(0,5).join(',')||'')+'] / 伝授', d?.tutor?.length ?? 0, '['+(d?.tutor?.slice(0,5).join(',')||'')+']')
  })
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
