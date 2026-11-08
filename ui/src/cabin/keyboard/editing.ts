import { capital, deletedWith, type Key, type Language, type Layer, otherLanguage, typedWith } from './layouts'
import {
  type Candidate,
  type Composition,
  converted,
  zhuyinDeleted,
  zhuyinPicked,
  zhuyinToned,
  zhuyinTyped,
} from './zhuyin'

/** Shift: off, for the next letter only, or locked on (caps lock, by tapping it twice). */
export type Shift = 'off' | 'once' | 'locked'

export interface KeyboardState {
  layer: Layer
  shift: Shift
  /** The keyboard showing: the language's own, or English's (the globe key goes between them). */
  language: Language
  /** The language's own keyboard. */
  own: Language
  /** When shift was last tapped (ms), to tell a double tap. */
  shiftTappedAt: number | null
  /** Zhuyin typed and not yet characters (zhuyin.ts), shown after the field's text: `null` for none. */
  composition: Composition | null
}

/** How soon after the first a second tap on shift locks it, ms (iOS's feel). */
export const DOUBLE_TAP_MS = 350

export function initialKeyboard(language: Language, own: Language = language): KeyboardState {
  return { layer: 'letters', shift: 'off', language, own, shiftTappedAt: null, composition: null }
}

/** What a key press does: the keyboard and text after it, and whether it submits or puts the keyboard away. */
export interface Outcome {
  state: KeyboardState
  text: string
  submit?: boolean
  hide?: boolean
}

/** Presses `key` (at `at`, ms) with `text` typed so far. On Zhuyin, its symbols and tones are composed, the
 * text left as it is: space gives a syllable waiting for its tone the first, then types the first candidate, as
 * return does (without submitting), and delete takes the composition apart; any other character, the globe and
 * hide type the first candidate before they do what they do. */
export function press(state: KeyboardState, text: string, key: Key, at: number): Outcome {
  const { composition } = state
  switch (key.kind) {
    case 'char': {
      if (state.language === 'zh') {
        const composed = zhuyinTyped(composition, key.char)
        if (composed) return { state: { ...state, composition: composed }, text }
      }
      const before = typedComposition(state, text)
      const letter = state.layer === 'letters' && state.shift !== 'off'
      return {
        state: state.shift === 'once' ? { ...before.state, shift: 'off' } : before.state,
        text: typedWith(state.language, before.text, letter ? capital(key.char, state.language) : key.char),
      }
    }
    case 'space':
      if (composition) {
        return composition.open
          ? { state: { ...state, composition: zhuyinToned(composition, 1) }, text }
          : typedComposition(state, text)
      }
      // As on the iPhone, a space after numbers or symbols brings the letters back.
      return { state: { ...state, layer: 'letters' }, text: `${text} ` }
    case 'delete':
      if (composition) return { state: { ...state, composition: zhuyinDeleted(composition) }, text }
      return { state, text: deletedWith(state.language, text) ?? withoutLast(text) }
    case 'shift': {
      const doubleTap =
        state.shift === 'once' && state.shiftTappedAt !== null && at - state.shiftTappedAt <= DOUBLE_TAP_MS
      const shift: Shift = doubleTap ? 'locked' : state.shift === 'off' ? 'once' : 'off'
      return { state: { ...state, shift, shiftTappedAt: at }, text }
    }
    case 'layer':
      return { state: { ...state, layer: key.to, shift: 'off' }, text }
    case 'globe': {
      const before = typedComposition(state, text)
      return {
        state: { ...before.state, language: otherLanguage(state.language, state.own), layer: 'letters', shift: 'off' },
        text: before.text,
      }
    }
    case 'return':
      return composition ? typedComposition(state, text) : { state, text, submit: true }
    case 'hide':
      return { ...typedComposition(state, text), hide: true }
  }
}

/** Picks a candidate for what's composed: its characters typed, the syllables after it still composed. */
export function pick(state: KeyboardState, text: string, candidate: Candidate): Outcome {
  if (!state.composition) return { state, text }
  return { state: { ...state, composition: zhuyinPicked(state.composition, candidate) }, text: text + candidate.text }
}

/** The text with what's composed typed (its first candidate), nothing composed after. */
export function typedComposition(state: KeyboardState, text: string): Outcome {
  if (!state.composition) return { state, text }
  return { state: { ...state, composition: null }, text: text + converted(state.composition) }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The text without its last character as the reader sees it (a flag or an accented letter is one). */
export function withoutLast(text: string): string {
  let last = 0
  for (const { index } of graphemes.segment(text)) last = index
  return text.slice(0, last)
}

/** The text without its last word and the spaces after it (Ctrl+Backspace on the player's own keyboard). */
export function withoutLastWord(text: string): string {
  return text.replace(/\S*\s*$/u, '')
}
