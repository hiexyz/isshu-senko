export type Lang = 'ja' | 'en'

export type Dict = {
  ruby: string
  soundOn: string
  soundOff: string
  breathOn: string
  breathOff: string
  extinguish: string
  light: string
  langSwitch: string
  stageLabel: string
  title: string
  body: string
  hintDefault: string
  hintBreath: string
  hintPaused: string
  hintDoneSound: string
  hintDoneSilent: string
  hintDoneSimple: string
  hintRunning: (label: string) => string
  hintSet: (label: string) => string
  hintSoundReady: string
  hintSoundFail: string
  hintSoundOff: string
  hintMicFail: string
  timerDone: string
  timerLeft: string
  timerPaused: string
  timerSet: string
  unitMin: string
  unitSec: string
  durationLabel: (sec: number) => string
  docTitle: string
}

const ja: Dict = {
  ruby: 'いっしゅ',
  soundOn: '音オン',
  soundOff: '音オフ',
  breathOn: '息を止める',
  breathOff: '息を聴く',
  extinguish: '消す',
  light: '点す',
  langSwitch: 'EN',
  stageLabel: '線香タイマー',
  title: '静かに、祈る。',
  body: '線香が燃え尽きるまでを、ひとつの時間に。',
  hintDefault: '分・秒を回して時間を合わせ、点すと始まります',
  hintBreath: 'マイクに向かって、そっと息を吹きかけてみてください',
  hintPaused: '一時停止中。点すと続きから計測します',
  hintDoneSound: 'おりんが響きました。点すと新しい線香で再開できます',
  hintDoneSilent: '時間が終わりました。点すと新しい線香で再開できます',
  hintDoneSimple: '時間が終わりました。点すと新しい線香で再開できます',
  hintRunning: (label) => `${label}で計測中`,
  hintSet: (label) => `${label}に設定しました。点すと始まります`,
  hintSoundReady: '終了時におりんが鳴ります',
  hintSoundFail: '音を再生できませんでした。消音スイッチ／本体音量を確認してください',
  hintSoundOff: '音をオフにしました',
  hintMicFail: 'マイクを許可すると、息で煙を揺らせます',
  timerDone: '完了',
  timerLeft: '残り',
  timerPaused: '一時停止',
  timerSet: '設定',
  unitMin: '分',
  unitSec: '秒',
  durationLabel: (sec) => {
    const s = Math.max(0, Math.round(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    if (r === 0) return `${m}分`
    return `${m}分${r}秒`
  },
  docTitle: '一炷 — 線香',
}

const en: Dict = {
  ruby: 'isshu',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  breathOn: 'Stop breath',
  breathOff: 'Listen',
  extinguish: 'Extinguish',
  light: 'Light',
  langSwitch: 'JP',
  stageLabel: 'Incense timer',
  title: 'Sit quietly. Pray.',
  body: 'Let one stick of incense mark the time.',
  hintDefault: 'Set minutes and seconds, then light to begin',
  hintBreath: 'Blow gently toward the microphone',
  hintPaused: 'Paused. Light again to continue',
  hintDoneSound: 'The bowl has sounded. Light for a new stick',
  hintDoneSilent: 'Time is up. Light for a new stick',
  hintDoneSimple: 'Time is up. Light for a new stick',
  hintRunning: (label) => `Timing ${label}`,
  hintSet: (label) => `Set to ${label}. Light to begin`,
  hintSoundReady: 'A bowl will sound when time ends',
  hintSoundFail: 'Could not play sound. Check silent mode / volume',
  hintSoundOff: 'Sound turned off',
  hintMicFail: 'Allow the microphone to move smoke with your breath',
  timerDone: 'Done',
  timerLeft: 'Left',
  timerPaused: 'Paused',
  timerSet: 'Set',
  unitMin: 'min',
  unitSec: 'sec',
  durationLabel: (sec) => {
    const s = Math.max(0, Math.round(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    if (r === 0) return `${m} min`
    return `${m}m ${r}s`
  },
  docTitle: 'Isshu — Incense',
}

export const dictionaries: Record<Lang, Dict> = { ja, en }

export const LANG_KEY = 'isshu-lang'

export function loadLang(): Lang {
  const raw = localStorage.getItem(LANG_KEY)
  return raw === 'en' ? 'en' : 'ja'
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang)
}
