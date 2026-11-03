# 一炷（いっしゅ）

線香が燃え尽きるまでを、ひとつの時間にする瞑想タイマーです。

先端から立ちのぼる煙を Canvas のパーティクルで描き、時間とともに線香が短くなっていきます。息を吹きかけると煙が揺れ、終了時にはおりんが響きます。

## 公開URL

- GitHub Pages: https://hiexyz.github.io/isshu-senko/
- デプロイナウ: https://isshu-senko-timer.lolipop-now.app

## 機能

- 分・秒のホイールで時間を設定（最短 5 秒〜最大 60 分）
- 点すと計測開始。消すと一時停止、再び点すと続きから
- 線香の残り長さとコーナーの残り時間表示
- おりん（音オン / オフ、初回はオフ）
- マイクで息を検知し、煙を揺らす
- 日本語 / 英語の切替（EN / JP）

設定した時間・音のオンオフ・言語はブラウザに保存されます。

## 使い方（ローカル）

```bash
npm install
npm run dev
```

## ロリポップ！デプロイナウ

Vite のソースをそのまま静的公開すると動きません（`index.html` が `/src/main.ts` を参照するため）。**ビルドして `dist` を公開**してください。

### 推奨設定

| 項目 | 値 |
| --- | --- |
| フレームワーク | 静的サイト (`static`) |
| インストール | `npm install` |
| ビルド | `npm run build` |
| 出力ディレクトリ | `dist` |

CLI の例:

```bash
npm install -g lolipop
lolipop login
lolipop deploy --name isshu-senko-timer --framework static --install "npm install" --build "npm run build" --output dist
```

すでにプロジェクトがある場合は、ダッシュボードのビルド設定を上の表どおりに直し、もう一度デプロイしてください。

```bash
lolipop build-config update --project <project-id> --framework static --install "npm install" --build "npm run build" --output dist
lolipop deploy --project <project-id>
```

ブラウザからフォルダをドロップする場合は、リポジトリ直下ではなく **`npm run build` 後の `dist` フォルダ**を上げるか、ビルド付きの静的サイト設定にしてください。

## 技術

- Vite + TypeScript
- Canvas 2D の煙シミュレーション（FBM / curl noise）
- Web Audio によるおりん、BreathSensor によるマイク入力

## ビルド / GitHub Pages

```bash
npm run build          # ルート公開（デプロイナウ向け）
npm run deploy:gh      # GitHub Pages（base: /isshu-senko/）
```
