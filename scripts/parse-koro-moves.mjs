// コロモン(koro-pokemon)のPLA全技一覧から 技名→{タイプ,分類,威力(基/早/力)} を抽出
// export parseKoroMoves() : { [技名]: {t,c,p,pa,ps} }  (物理/特殊のみ・威力が数値のもの)
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
      if (c[1] === '変化') continue
      const powCell = c[2]
      let p = pickPow(powCell, '基')
      if (p == null) { const m = powCell.match(/([0-9]+)/); p = m ? +m[1] : null }
      if (p == null) { skipped.push(name + '(' + powCell + ')'); continue } // カウンター等の可変/—
      const pa = pickPow(powCell, '早') ?? p
      const ps = pickPow(powCell, '力') ?? p
      const rec = { t: c[0], c: c[1], p }
      if (pa !== p) rec.pa = pa
      if (ps !== p) rec.ps = ps
      moves[name] = rec
    }
  }
  return { moves, skipped }
}

// 直接実行で確認
if (import.meta.url === ('file://' + process.argv[1].replace(/\\/g, '/')) || process.argv[1].endsWith('parse-koro-moves.mjs')) {
  const { moves, skipped } = await parseKoroMoves()
  const keys = Object.keys(moves)
  console.log('damaging moves:', keys.length, '| skipped(non-numeric power):', skipped.length)
  for (const n of ['アイアンテール','じしん','かえんほうしゃ','はかいこうせん','しんそく','トリプルアクセル','インファイト','りゅうせいぐん','すてみタックル'])
    console.log(' ', n, JSON.stringify(moves[n]))
  console.log('skipped sample:', skipped.slice(0, 15).join(', '))
}
