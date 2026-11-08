import type { Language as CabinLanguage } from '../state/strings'
import { hangulDeleted, hangulTyped } from './hangul'
import { kanaTyped } from './kana'

/**
 * The keyboard's keys, as on the iPhone: each of the game's languages gets its own letters (German's QWERTZ,
 * French's AZERTY, Russian's ЙЦУКЕН, Korean's two-set…), every keyboard the same number and symbol layers.
 * Letters are written lowercase; shift makes them capitals by their language's rules (Turkish i and ı are İ and
 * I), or, where a script has no capitals, its other letters (Georgian's, Korean's doubled consonants). Korean's
 * letters join into syllables as they're typed, and Japanese is typed in romaji, which turns to kana as it
 * goes (as iOS's Romaji keyboard does, without its kanji). Traditional Chinese is typed in Zhuyin, four rows of
 * its symbols and tones as on the iPhone (and the PC's standard layout), turned into characters by a dictionary
 * as it's typed (zhuyin.ts, editing.ts). Simplified Chinese's pinyin types Latin letters for now, as Vietnamese
 * does without Telex's tone marks.
 */

/** A keyboard, by the letters it has. */
export type Language =
  | 'en'
  | 'tr'
  | 'de'
  | 'fr'
  | 'es'
  | 'ca'
  | 'da'
  | 'no'
  | 'sv'
  | 'et'
  | 'cs'
  | 'hu'
  | 'hr'
  | 'sl'
  | 'el'
  | 'ru'
  | 'uk'
  | 'bg'
  | 'mk'
  | 'sr'
  | 'ka'
  | 'ja'
  | 'ko'
  | 'zh'

interface Letters {
  /** Three rows of letters (Zhuyin's four), the last between shift and delete. */
  rows: readonly string[]
  /** Shift's letters, where they aren't the letters in capitals: key for key. */
  shifted?: readonly string[]
  /** No shift key, where it would change nothing (Zhuyin's). */
  shift?: false
  /** The keys of the player's own keyboard that type these letters, key for key, where they don't type their
   * own (Zhuyin's: where the PC's standard Zhuyin layout, 大千, has them). */
  pc?: readonly string[]
  /** Capitals by this language's rules. */
  locale: string
  /** What typing a letter does to the text, where it isn't adding it: joining Korean's letters, turning
   * romaji to kana. */
  typed?: (text: string, char: string) => string
  /** What delete does, where it isn't taking the last character away: a Korean letter at a time (`null`: as
   * usual). */
  deleted?: (text: string) => string | null
}

const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const
const QWERTZ = ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'] as const

const KEYBOARDS: Record<Language, Letters> = {
  en: { rows: QWERTY, locale: 'en-GB' },
  tr: { rows: ['qwertyuıopğü', 'asdfghjklşi', 'zxcvbnmöç'], locale: 'tr-TR' },
  de: { rows: ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'], locale: 'de-DE' },
  fr: { rows: ['azertyuiop', 'qsdfghjklm', 'wxcvbn'], locale: 'fr-FR' },
  es: { rows: ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'], locale: 'es-ES' },
  ca: { rows: ['qwertyuiop', 'asdfghjklç', 'zxcvbnm'], locale: 'ca-ES' },
  da: { rows: ['qwertyuiopå', 'asdfghjklæø', 'zxcvbnm'], locale: 'da-DK' },
  no: { rows: ['qwertyuiopå', 'asdfghjkløæ', 'zxcvbnm'], locale: 'nb-NO' },
  sv: { rows: ['qwertyuiopå', 'asdfghjklöä', 'zxcvbnm'], locale: 'sv-SE' },
  et: { rows: ['qwertyuiopüõ', 'asdfghjklöä', 'zxcvbnm'], locale: 'et-EE' },
  cs: { rows: QWERTZ, locale: 'cs-CZ' },
  hu: { rows: ['qwertzuiopőú', 'asdfghjkléáű', 'yxcvbnmöüó'], locale: 'hu-HU' },
  hr: { rows: ['qwertzuiopšđ', 'asdfghjklčćž', 'yxcvbnm'], locale: 'hr-HR' },
  sl: { rows: ['qwertzuiopš', 'asdfghjklčž', 'yxcvbnm'], locale: 'sl-SI' },
  el: { rows: ['ςερτυθιοπ', 'ασδφγηξκλ', 'ζχψωβνμ'], locale: 'el-GR' },
  ru: { rows: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбюё'], locale: 'ru-RU' },
  uk: { rows: ['йцукенгшщзхї', 'фівапролджє', 'ячсмитьбюґ'], locale: 'uk-UA' },
  bg: { rows: ['явертъуиопшщ', 'асдфгхйклю', 'зьцжбнмч'], locale: 'bg-BG' },
  mk: { rows: ['љњертѕуиопшѓ', 'асдфгхјклчќ', 'зџцвбнмж'], locale: 'mk-MK' },
  sr: { rows: ['љњертзуиопшђ', 'асдфгхјклчћж', 'џцвбнм'], locale: 'sr-Cyrl-RS' },
  ka: {
    rows: ['ქწერტყუიოპ', 'ასდფგჰჯკლ', 'ზხცვბნმ'],
    shifted: ['ქჭეღთყუიოპ', 'აშდფგჰჟკლ', 'ძხჩვბნმ'],
    locale: 'ka-GE',
  },
  ja: { rows: QWERTY, locale: 'ja-JP', typed: kanaTyped },
  ko: {
    rows: ['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ'],
    shifted: ['ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ'],
    locale: 'ko-KR',
    typed: hangulTyped,
    deleted: hangulDeleted,
  },
  // The tones in the top row, where the PC's standard layout has them on 3, 4, 6 and 7; space is the first.
  // What's typed is composed (editing.ts), not added to the text.
  zh: {
    rows: ['ㄅㄉˇˋㄓˊ˙ㄚㄞㄢㄦ', 'ㄆㄊㄍㄐㄔㄗㄧㄛㄟㄣ', 'ㄇㄋㄎㄑㄕㄘㄨㄜㄠㄤ', 'ㄈㄌㄏㄒㄖㄙㄩㄝㄡㄥ'],
    pc: ['1234567890-', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
    locale: 'zh-TW',
    shift: false,
  },
}

/** Each game language's keyboard (by its code's language, or the whole code where a language has two). */
const BY_LANGUAGE: Record<string, Language> = {
  tr: 'tr',
  de: 'de',
  fr_fr: 'fr',
  es: 'es',
  gl: 'es',
  eu: 'es',
  ca: 'ca',
  da: 'da',
  no: 'no',
  sv: 'sv',
  fi: 'sv',
  et: 'et',
  cs: 'cs',
  sk: 'cs',
  hu: 'hu',
  hr: 'hr',
  sr_sp: 'hr',
  sl: 'sl',
  el: 'el',
  ru: 'ru',
  uk: 'uk',
  bg: 'bg',
  mk: 'mk',
  sr_sr: 'sr',
  ka: 'ka',
  ja: 'ja',
  ko: 'ko',
  zh_tw: 'zh',
}

/** The keyboard for the cabin's language (a game code, `de_de`): its own, or QWERTY (English, Italian, Dutch,
 * Portuguese, Polish, Romanian, the Baltic languages, Canada's French, Vietnamese, Simplified Chinese). */
export function keyboardLanguage(language: CabinLanguage): Language {
  return BY_LANGUAGE[language] ?? BY_LANGUAGE[language.slice(0, 2)] ?? 'en'
}

/** Which set of keys shows. */
export type Layer = 'letters' | 'numbers' | 'symbols'

/** What the return key says it does: search for what was typed, go there, or simply finish. */
export type ReturnKind = 'search' | 'go' | 'done'

export type Key =
  | { kind: 'char'; char: string }
  | { kind: 'shift' }
  | { kind: 'delete' }
  /** 123, #+= or ABC: another layer. */
  | { kind: 'layer'; to: Layer }
  /** The other keyboard's letters: the language's own and English's. */
  | { kind: 'globe' }
  | { kind: 'space' }
  | { kind: 'return' }
  /** Puts the keyboard away. */
  | { kind: 'hide' }

const NUMBERS = ['1234567890', '-/:;()€&@"', ".,?!'"]
const SYMBOLS = ['[]{}#%^*+=', '_\\|~<>$£¥•', ".,?!'"]

const chars = (row: string): Key[] => Array.from(row, (char) => ({ kind: 'char', char }))

/** The keys of a layer, row by row: three rows of characters (Zhuyin's letters four), then the bottom row (the
 * globe only where there's another keyboard to go to). */
export function keyRows(language: Language, layer: Layer, globe = language !== 'en'): Key[][] {
  const letters = KEYBOARDS[language]
  const rows = (layer === 'letters' ? letters.rows : layer === 'numbers' ? NUMBERS : SYMBOLS).map(chars)
  const last = rows.pop() ?? []
  // Left of the last row: shift on letters (that have it), the other symbols layer on the others.
  const left: Key[] =
    layer !== 'letters'
      ? [{ kind: 'layer', to: layer === 'numbers' ? 'symbols' : 'numbers' }]
      : letters.shift === false
        ? []
        : [{ kind: 'shift' }]
  const switcher: Key = layer === 'letters' ? { kind: 'layer', to: 'numbers' } : { kind: 'layer', to: 'letters' }
  return [
    ...rows,
    [...left, ...last, { kind: 'delete' }],
    [switcher, ...(globe ? [{ kind: 'globe' } as Key] : []), { kind: 'space' }, { kind: 'hide' }, { kind: 'return' }],
  ]
}

/** A letter with shift on, by its keyboard: its own shifted letter, or its capital by the language's rules. */
export function capital(char: string, language: Language): string {
  const { rows, shifted, locale } = KEYBOARDS[language]
  if (shifted) {
    for (let row = 0; row < rows.length; row++) {
      const at = Array.from(rows[row]).indexOf(char)
      if (at >= 0) return Array.from(shifted[row])[at]
    }
  }
  return char.toLocaleUpperCase(locale)
}

/** The letter a character the player's own keyboard typed stands for on `language`'s keyboard, where its keys
 * type that keyboard's letters (Zhuyin's: `1` is ㄅ, `q` ㄆ, `3` ˇ); `null` where it's typed as it is. */
export function fromPc(language: Language, char: string): string | null {
  const { rows, pc } = KEYBOARDS[language]
  for (let row = 0; pc && row < pc.length; row++) {
    const at = Array.from(pc[row]).indexOf(char)
    if (at >= 0) return Array.from(rows[row])[at]
  }
  return null
}

/** The other keyboard, for the globe key: English from the language's own, the language's own from English. */
export function otherLanguage(language: Language, own: Language): Language {
  return language === own ? 'en' : own
}

/** The text after typing `char` on `language`'s keyboard. */
export function typedWith(language: Language, text: string, char: string): string {
  const typed = KEYBOARDS[language].typed
  return typed ? typed(text, char) : text + char
}

/** The text after delete on `language`'s keyboard, or `null` where delete takes the last character away. */
export function deletedWith(language: Language, text: string): string | null {
  return KEYBOARDS[language].deleted?.(text) ?? null
}
