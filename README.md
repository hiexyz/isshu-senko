# 一炷（いっしゅ）

線香が燃え尽きるまでを、ひとつの時間にする瞑想タイマーです。

先端から立ちのぼる煙を Canvas のパーティクルで描き、時間とともに線香が短くなっていきます。息を吹きかけると煙が揺れ、終了時にはおりんが響きます。

## 公開URL

https://hiexyz.github.io/isshu-senko/

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

## 技術

- Vite + TypeScript
- Canvas 2D の煙シミュレーション（FBM / curl noise）
- Web Audio によるおりん、BreathSensor によるマイク入力
- GitHub Pages で公開

## ビルド / デプロイ

```bash
npm run build
npm run preview
# dist を Pages へ
npx gh-pages -d dist
```
