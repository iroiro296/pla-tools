// コロモン(koro-pokemon)のPLA全技一覧から 技名→{タイプ,分類,威力(基/早/力),行動順遅延(基/早/力)} を抽出
// export parseKoroMoves() : { [技名]: {t,c, p,pa,ps, dl,dla,dls} }
//   物理/特殊/変化すべて収録。威力は数値のもののみp（変化/可変はpなし）。dl=行動順遅延度(基)・dla(早)/dls(力)は基と異なる時のみ。
const URL = 'https://pente.koro-pokemon.com/legendsarceus/moves.shtml'
const TYPES = new Set(['ノーマル','ほのお','みず','でんき','くさ','こおり','かくとう','どく','じめん','ひこう','エスパー','むし','いわ','ゴースト','ドラゴン','あく','はがね','フェアリー'])

function cellsOf(tr) {
  return (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [])
    .map(x => x.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim())
}
function pickPow(s, key) {
  // "基:100 早:80 力:120" / 全角コロンや欠落に対応
  const m = s.match(new RegExp(key + '[:：]\\s*([0-9]+)'))
  if (m) return +m[1]
  return null
}
function pickSigned(s, key) {
  // 行動順遅延度は負値あり "基:-4 早:-4 力:2"
  const m = (s || '').match(new RegExp(key + '[:：]\\s*(-?[0-9]+)'))
  if (m) return +m[1]
  return null
}

export async function parseKoroMoves() {
  const r = await fetch(URL)
  const html = new TextDecoder('utf-8').decode(Buffer.from(await r.arrayBuffer()))
  const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'))
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || []

  const moves = {}
  let lastName = null
  const skipped = []
  for (const tr of rows) {
    const c = cellsOf(tr)
    if (c.length === 1 && c[0] && !TYPES.has(c[0])) { lastName = c[0]; continue }
    if (c.length >= 3 && TYPES.has(c[0]) && (c[1] === '物理' || c[1] === '特殊' || c[1] === '変化')) {
      const name = lastName
      lastName = null
      if (!name) continue
      const powCell = c[2]
      const delayCell = c[6] || ''   // 列: タイプ,分類,威力,命中,PP,急所率,行動順遅延度,範囲,直接
      // 威力（変化技やカウンター等は数値なし→pなし）
      let p = pickPow(powCell, '基')
      if (p == null) { const m = powCell.match(/(^|[^0-9-])([0-9]+)($|[^0-9])/); p = m ? +m[2] : null }
      const pa = pickPow(powCell, '早')
      const ps = pickPow(powCell, '力')
      // 行動順遅延度（基/早/力・負値あり）
      const dl = pickSigned(delayCell, '基')
      const da = pickSigned(delayCell, '早')
      const ds = pickSigned(delayCell, '力')
      // 威力も遅延も取れない行は捨てる
      if (p == null && dl == null && da == null && ds == null) { skipped.push(name + '(' + powCell + ')'); continue }
      const rec = { t: c[0], c: c[1] }
      if (p != null) { rec.p = p; if (pa != null && pa !== p) rec.pa = pa; if (ps != null && ps !== p) rec.ps = ps }
      if (dl != null) { rec.dl = dl; if (da != null && da !== dl) rec.dla = da; if (ds != null && ds !== dl) rec.dls = ds }
      else if (da != null || ds != null) { rec.dl = 0; if (da != null && da !== 0) rec.dla = da; if (ds != null && ds !== 0) rec.dls = ds }
      moves[name] = rec
    }
  }
  return { moves, skipped }
}

// 直接実行で確認
if (import.meta.url === ('file://' + process.argv[1].replace(/\\/g, '/')) || process.argv[1].endsWith('parse-koro-moves.mjs')) {
  const { moves, skipped } = await parseKoroMoves()
  const keys = Object.keys(moves)
  const dmg = keys.filter(k => moves[k].p != null).length
  const henka = keys.filter(k => moves[k].c === '変化').length
  console.log('total moves:', keys.length, '| damaging(p):', dmg, '| 変化:', henka, '| skipped:', skipped.length)
  for (const n of ['アイアンテール','でんこうせっか','ギガインパクト','つるぎのまい','しょうりのまい','こうそくいどう','リーフブレード'])
    console.log(' ', n, JSON.stringify(moves[n]))
  console.log('skipped sample:', skipped.slice(0, 15).join(', '))
}
