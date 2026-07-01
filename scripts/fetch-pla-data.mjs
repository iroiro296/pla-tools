// レジェンズアルセウス ダメ計用データ生成
// - ヒスイ図鑑(242)の種族値/タイプ/日本語名を PokeAPI から取得（ヒスイのすがた固有種族値対応）
// - タイプ相性表を PokeAPI damage_relations から生成
// - 技データは koro-pokemon のPLA全技一覧から取得（PLA実数値・基/早/力の威力 = p/pa/ps）
// - 覚え技(learnset)を PokeAPI の legends-arceus バージョングループから取得
// 出力: pla-calc/pla-data.js
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseKoroMoves } from './parse-koro-moves.mjs'
import { OPP_DELAY_TABLE, OPP_DELAY_DEFAULT } from './opponent-delay-table.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../pla-data.js')

const TYPE_JP = {
  normal:'ノーマル', fire:'ほのお', water:'みず', electric:'でんき', grass:'くさ',
  ice:'こおり', fighting:'かくとう', poison:'どく', ground:'じめん', flying:'ひこう',
  psychic:'エスパー', bug:'むし', rock:'いわ', ghost:'ゴースト', dragon:'ドラゴン',
  dark:'あく', steel:'はがね', fairy:'フェアリー'
}
const STAT_KEY = { hp:'h', attack:'a', defense:'b', 'special-attack':'c', 'special-defense':'d', speed:'s' }

const VARIETY_OVERRIDE = { basculin: 'basculin-white-striped' }

async function getJSON(url, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      if (t === tries - 1) throw new Error(url + ' :: ' + e.message)
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

async function buildTypeChart() {
  const names = Object.keys(TYPE_JP)
  const chart = {}
  for (const n of names) chart[TYPE_JP[n]] = Object.fromEntries(names.map(d => [TYPE_JP[d], 1]))
  await pool(names, 9, async (n) => {
    const d = await getJSON('https://pokeapi.co/api/v2/type/' + n)
    const a = TYPE_JP[n]
    for (const x of d.damage_relations.double_damage_to) if (TYPE_JP[x.name]) chart[a][TYPE_JP[x.name]] = 2
    for (const x of d.damage_relations.half_damage_to) if (TYPE_JP[x.name]) chart[a][TYPE_JP[x.name]] = 0.5
    for (const x of d.damage_relations.no_damage_to) if (TYPE_JP[x.name]) chart[a][TYPE_JP[x.name]] = 0
  })
  return chart
}

async function buildDex() {
  const dex = await getJSON('https://pokeapi.co/api/v2/pokedex/hisui')
  const entries = dex.pokemon_entries
  console.log('Hisui dex entries:', entries.length)

  const out = await pool(entries, 12, async (e) => {
    const sp = await getJSON(e.pokemon_species.url)
    const jpRec = sp.names.find(x => x.language.name === 'ja-Hrkt') || sp.names.find(x => x.language.name === 'ja')
    let jp = jpRec ? jpRec.name : sp.name

    let varName = VARIETY_OVERRIDE[sp.name]
    let isHisui = false
    if (!varName) {
      const hisui = sp.varieties.find(v => /-hisui$/.test(v.pokemon.name))
      if (hisui) { varName = hisui.pokemon.name; isHisui = true }
      else { varName = (sp.varieties.find(v => v.is_default) || sp.varieties[0]).pokemon.name }
    } else {
      isHisui = true
    }
    if (/white-striped/.test(varName)) isHisui = true
    if (isHisui) jp = jp + '（ヒスイ）'

    const pk = await getJSON('https://pokeapi.co/api/v2/pokemon/' + varName)
    const base = {}
    for (const s of pk.stats) { const k = STAT_KEY[s.stat.name]; if (k) base[k] = s.base_stat }
    const types = pk.types.sort((a, b) => a.slot - b.slot).map(t => TYPE_JP[t.type.name])

    // PLAバージョングループ覚え技（英語スラッグ）を抽出
    const plaLearnEnglish = pk.moves
      .filter(m => m.version_group_details.some(vg => vg.version_group.name === 'legends-arceus'))
      .map(m => m.move.name)

    return { no: e.entry_number, name: jp, en: varName, types, base, _ls: plaLearnEnglish }
  })

  out.sort((a, b) => a.no - b.no)
  return out
}

async function resolveLearnsets(dex, moves) {
  // 全ポケモンが使う英語スラッグの一覧
  const allSlugs = [...new Set(dex.flatMap(d => d._ls || []))]
  console.log('resolving', allSlugs.length, 'unique PLA move slugs for learnsets ...')
  if (allSlugs.length === 0) {
    console.log('  (no PLA learnset data from PokeAPI — learnset field will be omitted)')
    for (const d of dex) delete d._ls
    return
  }

  // 英語スラッグ → 日本語名
  const slug2jp = {}
  await pool(allSlugs, 12, async (slug) => {
    try {
      const md = await getJSON('https://pokeapi.co/api/v2/move/' + slug)
      const jpRec = md.names.find(x => x.language.name === 'ja-Hrkt') || md.names.find(x => x.language.name === 'ja')
      if (jpRec) slug2jp[slug] = jpRec.name
    } catch (e) {
      // スラッグが見つからない場合はスキップ
    }
  })

  let totalMoves = 0
  for (const d of dex) {
    // 日本語名に変換し、PLA_MOVESに存在するものだけ残す
    const jp = (d._ls || []).map(s => slug2jp[s]).filter(jp => jp && moves[jp])
    if (jp.length > 0) { d.learnset = jp; totalMoves += jp.length }
    delete d._ls
  }

  const withLearnset = dex.filter(d => d.learnset).length
  console.log(`learnsets resolved: ${withLearnset}/${dex.length} pokemon have data, avg ${(totalMoves/Math.max(1,withLearnset)).toFixed(1)} moves`)
  if (withLearnset > 0) console.log('  sample:', dex.slice(0,3).map(d => d.name + ':' + (d.learnset?.length||0)).join(', '))
}

async function main() {
  console.log('fetching PLA moves from koro-pokemon ...')
  const { moves, skipped } = await parseKoroMoves()
  console.log('moves(damaging):', Object.keys(moves).length, '| skipped:', skipped.length)

  console.log('merging opponent-delay table (行動順:相手への遅延) ...')
  let oppApplied = 0
  for (const name of Object.keys(moves)) {
    const [oa, oo] = OPP_DELAY_TABLE[name] || OPP_DELAY_DEFAULT
    if (oa !== 0) moves[name].oa = oa
    if (oo !== 0) moves[name].oo = oo
    if (oa !== 0 || oo !== 0) oppApplied++
  }
  console.log('opponent-delay applied to', oppApplied, 'moves')

  console.log('building type chart ...')
  const chart = await buildTypeChart()

  console.log('building Hisui dex (this takes ~1-2 min) ...')
  const dex = await buildDex()
  console.log('dex built:', dex.length, '| hisui-forms:', dex.filter(d => /（ヒスイ）/.test(d.name)).length)

  console.log('resolving learnsets ...')
  await resolveLearnsets(dex, moves)

  const header = `// 自動生成: scripts/fetch-pla-data.mjs  (${new Date().toISOString().slice(0,10)})\n` +
    `// ヒスイ図鑑 ${dex.length}件 / ダメージ技 ${Object.keys(moves).length}件 / タイプ相性 PokeAPI由来\n` +
    `// 技の威力はPLA実数値(koro-pokemon由来)。p=基本/pa=早業/ps=力業（基本と同じ場合は省略）。\n` +
    `// learnset=PokeAPI由来の覚え技(legends-arceusバージョングループ)。データがない場合は省略。\n`

  const body =
    `const TYPES = ${JSON.stringify(Object.values(TYPE_JP))};\n\n` +
    `const TYPE_CHART = ${JSON.stringify(chart)};\n\n` +
    `// 基本威力の手動上書き（必要時のみ）。{ "技名": 威力 }\n` +
    `const PLA_POWER_OVERRIDE = {};\n\n` +
    `const PLA_MOVES = ${JSON.stringify(moves, null, 0)};\n\n` +
    `const PLA_DEX = ${JSON.stringify(dex, null, 0)};\n`

  writeFileSync(OUT, header + '\n' + body)
  console.log('WROTE', OUT)
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
