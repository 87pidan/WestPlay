import { beforeAll, describe, expect, it } from 'vitest'
import { initialKeyboard, type KeyboardState, pick, press } from './editing'
import { fromPc, type Key, keyboardLanguage, keyRows } from './layouts'
import {
  candidates,
  type Composition,
  converted,
  loadDictionary,
  spelled,
  zhuyinDeleted,
  zhuyinPicked,
  zhuyinTyped,
} from './zhuyin'

beforeAll(() => loadDictionary())

/** The composition after typing each symbol of `symbols` (a space for the first tone). */
function composed(symbols: string): Composition | null {
  let composition: Composition | null = null
  for (const symbol of symbols) {
    composition = symbol === ' ' ? toned(composition) : zhuyinTyped(composition, symbol)
  }
  return composition
}
const toned = (composition: Composition | null) => {
  const state = { ...initialKeyboard('zh'), composition }
  return press(state, '', { kind: 'space' }, 0).state.composition
}

/** Presses each key on the Zhuyin keyboard: a character for each symbol, `␣` space, `⌫` delete, `⏎` return. */
function typed(keys: string, state: KeyboardState = initialKeyboard('zh'), text = '') {
  let submitted = false
  for (const symbol of keys) {
    const key: Key =
      symbol === '␣'
        ? { kind: 'space' }
        : symbol === '⌫'
          ? { kind: 'delete' }
          : symbol === '⏎'
            ? { kind: 'return' }
            : { kind: 'char', char: symbol }
    const outcome = press(state, text, key, 0)
    ;({ state, text } = outcome)
    submitted ||= outcome.submit === true
  }
  return { state, text, submitted }
}

describe('Zhuyin', () => {
  it('lays out its symbols in four rows, as on the iPhone, for Traditional Chinese only', () => {
    expect(keyboardLanguage('zh_tw')).toBe('zh')
    expect(keyboardLanguage('zh_cn')).toBe('en')
    const rows = keyRows('zh', 'letters', false)
    const faces = rows.map((row) => row.map((key) => (key.kind === 'char' ? key.char : key.kind)).join(' '))
    expect(faces.slice(0, 4)).toEqual([
      'ㄅ ㄉ ˇ ˋ ㄓ ˊ ˙ ㄚ ㄞ ㄢ ㄦ',
      'ㄆ ㄊ ㄍ ㄐ ㄔ ㄗ ㄧ ㄛ ㄟ ㄣ',
      'ㄇ ㄋ ㄎ ㄑ ㄕ ㄘ ㄨ ㄜ ㄠ ㄤ',
      // No shift: nothing changes with it.
      'ㄈ ㄌ ㄏ ㄒ ㄖ ㄙ ㄩ ㄝ ㄡ ㄥ delete',
    ])
    expect(rows[4].map((key) => key.kind)).toEqual(['layer', 'space', 'hide', 'return'])
    // Every symbol and tone, once.
    expect(new Set(faces.slice(0, 4).join(' ').split(' ')).size).toBe(37 + 4 + 1)
  })

  it("takes the player's own keys where the PC's standard layout (大千) has its symbols", () => {
    const keys = ['1234567890-', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./']
    expect(keys.map((row) => Array.from(row, (key) => fromPc('zh', key)).join(''))).toEqual([
      'ㄅㄉˇˋㄓˊ˙ㄚㄞㄢㄦ',
      'ㄆㄊㄍㄐㄔㄗㄧㄛㄟㄣ',
      'ㄇㄋㄎㄑㄕㄘㄨㄜㄠㄤ',
      'ㄈㄌㄏㄒㄖㄙㄩㄝㄡㄥ',
    ])
    expect(fromPc('zh', 'A')).toBeNull()
    expect(fromPc('zh', ' ')).toBeNull()
    expect(fromPc('en', 'a')).toBeNull()
  })

  it('builds syllables from their symbols, and starts the next where one can’t join', () => {
    expect(spelled(composed('ㄊㄞˊㄅㄟˇ')!.syllables)).toBe('ㄊㄞˊㄅㄟˇ')
    expect(composed('ㄊㄞˊㄅㄟˇ')).toMatchObject({ syllables: { length: 2 }, open: false })
    // Without tones: ㄅ can't follow ㄞ in a syllable, so it starts the next one.
    expect(composed('ㄊㄞㄅㄟ')!.syllables.map(({ tone }) => tone)).toEqual([null, null])
    expect(composed('ㄕㄕ')!.syllables).toHaveLength(2)
    // A tone after a closed syllable changes its tone.
    expect(spelled(composed('ㄇㄚˊˇ')!.syllables)).toBe('ㄇㄚˇ')
    // A tone mark with nothing composed isn't Zhuyin's: it's typed as it is.
    expect(zhuyinTyped(null, 'ˇ')).toBeNull()
    expect(zhuyinTyped(null, '7')).toBeNull()
  })

  it('takes a composition apart a symbol at a time', () => {
    let composition = composed('ㄊㄞˊㄅ')
    const steps: string[] = []
    while (composition) {
      steps.push(spelled(composition.syllables))
      composition = zhuyinDeleted(composition)
    }
    expect(steps).toEqual(['ㄊㄞˊㄅ', 'ㄊㄞˊ', 'ㄊㄞ', 'ㄊ'])
    // A syllable closed only by the next one's start takes symbols again once that's gone.
    expect(zhuyinDeleted(composed('ㄊㄞㄅ')!)).toMatchObject({ open: true, syllables: { length: 1 } })
  })

  it('offers the likeliest reading first, then phrases, then the first syllable’s characters', () => {
    const taipei = composed('ㄊㄞˊㄅㄟˇ')!
    expect(converted(taipei)).toBe('台北')
    const offered = candidates(taipei)
    expect(offered[0]).toEqual({ text: '台北', syllables: 2 })
    expect(offered).toContainEqual({ text: '台', syllables: 1 })
    expect(offered).toContainEqual({ text: '臺', syllables: 1 })
    // Without the tones, and with the first tone typed by space.
    expect(converted(composed('ㄊㄞㄅㄟ')!)).toBe('台北')
    expect(converted(composed('ㄋㄧˇㄏㄠˇ')!)).toBe('你好')
    expect(converted(composed('ㄍㄠㄒㄩㄥˊ')!)).toBe('高雄')
    expect(converted(composed('ㄓㄨㄥ ')!)).toBe('中')
    expect(converted(composed('ㄅㄛˊㄌㄧㄣˊ')!)).toBe('柏林')
    expect(converted(composed('ㄊㄞˊㄅㄟˇㄕˋ')!)).toBe('台北市')
    // A syllable the dictionary hasn't stays as typed.
    expect(converted(composed('ㄅㄩ')!)).toBe('ㄅㄩ')
    expect(candidates(null)).toEqual([])
  })

  it('keeps the syllables after a picked candidate composed', () => {
    const composition = composed('ㄍㄠㄒㄩㄥˊㄕˋ')!
    const kaohsiung = candidates(composition).find(({ text }) => text === '高雄')!
    expect(kaohsiung.syllables).toBe(2)
    const rest = zhuyinPicked(composition, kaohsiung)!
    expect(spelled(rest.syllables)).toBe('ㄕˋ')
    const { state, text } = pick({ ...initialKeyboard('zh'), composition }, '往', kaohsiung)
    expect(text).toBe('往高雄')
    expect(spelled(state.composition!.syllables)).toBe('ㄕˋ')
    expect(zhuyinPicked(rest, candidates(rest)[0])).toBeNull()
  })

  it('composes on the keyboard: space for the first tone, then to type, return to type before it submits', () => {
    // Composed, the text waits.
    expect(typed('ㄊㄞˊㄅㄟˇ')).toMatchObject({ text: '' })
    expect(typed('ㄊㄞˊㄅㄟˇ␣')).toMatchObject({ text: '台北', state: { composition: null } })
    expect(typed('ㄓㄨㄥ␣␣ㄨㄣˊ␣').text).toBe('中文')
    // Return types what's composed; only the next submits.
    expect(typed('ㄋㄧˇㄏㄠˇ⏎')).toMatchObject({ text: '你好', submitted: false })
    expect(typed('ㄋㄧˇㄏㄠˇ⏎⏎')).toMatchObject({ text: '你好', submitted: true })
    // Delete takes the composition apart before the text.
    expect(typed('ㄊㄞˊ⌫⌫', undefined, '去').state.composition?.syllables).toHaveLength(1)
    expect(typed('ㄊ⌫⌫', undefined, '去')).toMatchObject({ text: '', state: { composition: null } })
    // A space with nothing composed, and a digit after what's composed.
    expect(typed('␣').text).toBe(' ')
    expect(typed('ㄌㄡˊ1').text).toBe('樓1')
    // The globe types what's composed before it goes to English (without its tone: the likeliest of any).
    const composing = typed('ㄇㄚ').state
    expect(press(composing, '', { kind: 'globe' }, 0)).toMatchObject({ text: '馬', state: { language: 'en' } })
    expect(press(composing, '', { kind: 'hide' }, 0)).toMatchObject({ text: '馬', hide: true })
    // Space's first tone ends a syllable where the next symbol could have joined it: ㄒㄧ, ㄢ (not ㄒㄧㄢ).
    expect(typed('ㄒㄧ␣ㄢ␣').text).toBe('')
    expect(typed('ㄒㄧ␣ㄢ␣␣').text).toBe('西安')
  })
})
