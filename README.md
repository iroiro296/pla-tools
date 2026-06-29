# ポケモンレジェンズ アルセウス RTA用ツール

ポケモンレジェンズ アルセウス（PLA）の RTA・やり込み向けの非公式ファンメイドツール。
ダメージ計算・捕獲率計算・図鑑チェックリスト・配信用オーバーレイを1ページにまとめています。

## 公開URL

GitHub Pages で公開しています（`main` への push で自動デプロイ）。

## 開発

依存ゼロの素のHTML/JS。`index.html` がデータJS（`pla-*.js`）を読み込む構成です。

```sh
# ローカルプレビュー（http://localhost:5051）
node scripts/serve.mjs

# 配布用の単一HTMLを生成（pla-*.js をインライン展開）
node scripts/build-single.mjs   # → legends-arceus-damage-calc.html
```

## 公開（デプロイ）の仕組み

`.github/workflows/deploy.yml` が `main` への push 毎に単一HTMLをビルドし、
`dist/index.html` として GitHub Pages に公開します。

リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定すると有効になります。

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | 本体（UI・計算ロジック） |
| `pla-data.js` | ポケモン種族値・技などのデータ |
| `pla-food.js` | 好物アイコン（base64内蔵） |
| `pla-icons.js` | アイコン番号マッピング |
| `pla-catchrate.js` / `pla-rta-route.js` | 捕獲率・ルートデータ |
| `legends-arceus-damage-calc.html` | 配布用の単一HTML（自動生成物） |

## クレジット

非公式のファンメイドツールです。ポケモン関連の名称・データは各権利者に帰属します。
