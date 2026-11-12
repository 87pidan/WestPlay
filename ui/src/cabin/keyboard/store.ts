import { create } from 'zustand'
import type { TypedEvent, TypingState } from '../../shared/host'
import { initialKeyboard, type KeyboardState, pick, press, typedComposition, withoutLastWord } from './editing'
import { fromPc, type Key, type Language, type ReturnKind } from './layouts'
import { type Candidate, candidates, dictionaryLoaded, loadDictionary } from './zhuyin'

/** The text field being typed into: how to read and change its text, and what its return key does. */
export interface Typing {
  id: string
  returnKind: ReturnKind
  read(): string
  write(text: string): void
  submit(): void
  /** Whether it shows Zhuyin being composed itself (TextField's, marked after its text); for one that doesn't (a
   * web page's field, Safari's), the keyboard shows it beside its candidates. */
  showsComposition?: boolean
}

interface KeyboardStore {
  /** The field the keyboard types into, `null` when the keyboard is away. */
  field: Typing | null
  /** That field's selection: a number that changes with every selection (0: none), so the player's own
   * keyboard types only into a field selected while the truck stood still (the game plugin decides). */
  selection: number
  keys: KeyboardState
  /** The language the player switched the keyboard to (the globe key), for the rest of the session. */
  chosen: Language | null
  /** Whether the player's own keyboard types into the field (the host says). */
  physical: TypingState
  /** The last character typed on the player's own keyboard, for its key to light up (a new `id` each). */
  flash: { char: string; id: number } | null
  /** Whether Zhuyin's dictionary has loaded (zhuyin.ts), for its candidates to show. */
  zhuyinReady: boolean
  /** Zhuyin's candidates being chosen on the player's own keyboard (space after a tone, as Taiwan's input
   * methods do): how many pages on from the first, `null` while typing. */
  choosing: number | null
  /** The candidates numbered 1 to 9 and 0 while choosing: those the candidates' row shows whole (Candidates.tsx). */
  numbered: Candidate[]
  /** Starts typing into `field` (selecting it): the keyboard comes up, in `language` (the game's) unless
   * the player switched it. */
  attach(field: Typing, language: Language): void
  /** Stops typing into the field `id`, if the keyboard types into it: the keyboard goes away. */
  detach(id: string): void
  /** A key of the keyboard, pressed at `at` (ms). */
  press(key: Key, at?: number): void
  /** One of Zhuyin's candidates, picked. */
  pick(candidate: Candidate): void
  /** Drops what's composed (the field's clear button). */
  discard(): void
  /** What the player typed on their own keyboard. */
  typed(event: TypedEvent): void
}

let selections = 0

/** Loads Zhuyin's dictionary the first time its keyboard shows. */
function prepare(language: Language) {
  if (language !== 'zh' || useKeyboard.getState().zhuyinReady) return
  const ready = () => useKeyboard.setState({ zhuyinReady: true })
  if (dictionaryLoaded()) ready()
  else loadDictionary().then(ready, (error: unknown) => console.warn('Zhuyin: the dictionary did not load', error))
}

/** Lights up the key `char` is on, as the player's own keyboard types it. */
function flashKey(char: string) {
  useKeyboard.setState(({ flash }) => ({ flash: { char, id: (flash?.id ?? 0) + 1 } }))
}

/** Text the player's own keyboard typed, as it is: after what's composed on screen, typed first. */
function typeAsIs(text: string) {
  const { field, keys } = useKeyboard.getState()
  if (!field) return
  const before = typedComposition(keys, field.read())
  useKeyboard.setState({ keys: before.state, choosing: null })
  flashKey(text.slice(-1))
  field.write(before.text + text)
}

/** Shift's punctuation on the player's own keyboard while Zhuyin shows: full-width, as Taiwan's input methods
 * type it (`,` `.` `/` `;` `1` being Zhuyin's symbols without it). */
const FULL_WIDTH: Record<string, string> = { '<': '，', '>': '。', '?': '？', ':': '：', '!': '！' }

/** Typed on the player's own keyboard while Zhuyin shows: keys typed one by one (any of Zhuyin's keys, a space),
 * not text pasted or typed some other way, which goes in as it is. */
const ZHUYIN_KEYS = /^[0-9a-z;,./ -]+$/

/**
 * A key of the player's own keyboard while Zhuyin shows, as Taiwan's input methods take it: Zhuyin's symbol
 * where the PC's standard layout (大千) has it (`fromPc`), space the first tone, then, after a tone, the
 * candidates to choose from: numbered (Candidates.tsx), a digit picks one, space shows the next ones, return the
 * first; anything else stops choosing and types as it would. A capital is typed as it is, Shift's punctuation
 * full-width.
 */
function typeZhuyinKey(char: string) {
  const { keys, choosing, numbered } = useKeyboard.getState()
  if (choosing !== null) {
    const digit = '1234567890'.indexOf(char)
    if (digit >= 0) {
      if (numbered[digit]) useKeyboard.getState().pick(numbered[digit])
      return
    }
    if (char === ' ') {
      useKeyboard.setState({ choosing: choosing + 1 })
      return
    }
    useKeyboard.setState({ choosing: null })
  }
  const symbol = fromPc('zh', char)
  if (symbol) {
    useKeyboard.getState().press({ kind: 'char', char: symbol })
    flashKey(symbol)
  } else if (char === ' ') {
    if (keys.composition && !keys.composition.open && candidates(keys.composition).length) {
      useKeyboard.setState({ choosing: 0 })
    } else {
      useKeyboard.getState().press({ kind: 'space' })
      flashKey(' ')
    }
  } else {
    typeAsIs(FULL_WIDTH[char] ?? char)
  }
}

export const useKeyboard = create<KeyboardStore>()((set, get) => ({
  field: null,
  selection: 0,
  keys: initialKeyboard('en'),
  chosen: null,
  physical: 'off',
  flash: null,
  zhuyinReady: false,
  choosing: null,
  numbered: [],
  attach: (field, language) => {
    const { field: current, chosen } = get()
    // A newly selected field starts on the letters, in the player's language (or English, if they switched to
    // it); one selected again keeps the keyboard as it was. Either way it's a new selection, which the
    // player's own keyboard may type into.
    const selection = ++selections
    const start = chosen === 'en' || chosen === language ? chosen : language
    if (current?.id === field.id) set({ field, selection })
    else set({ field, selection, keys: initialKeyboard(start, language), choosing: null })
    prepare(get().keys.language)
  },
  detach: (id) => {
    // Gone with its field: what was composed for it.
    const { field, keys } = get()
    if (field?.id === id) {
      set({
        field: null,
        selection: 0,
        keys: keys.composition ? { ...keys, composition: null } : keys,
        choosing: null,
      })
    }
  },
  press: (key, at = performance.now()) => {
    const { field, keys } = get()
    if (!field) return
    const before = field.read()
    const outcome = press(keys, before, key, at)
    const away = outcome.hide || outcome.submit
    set({
      keys: outcome.state,
      chosen: key.kind === 'globe' ? outcome.state.language : get().chosen,
      field: away ? null : field,
      selection: away ? 0 : get().selection,
      choosing: null,
    })
    if (outcome.text !== before) field.write(outcome.text)
    if (outcome.submit) field.submit()
    prepare(outcome.state.language)
  },
  pick: (candidate) => {
    const { field, keys } = get()
    if (!field) return
    const outcome = pick(keys, field.read(), candidate)
    set({ keys: outcome.state, choosing: null })
    field.write(outcome.text)
  },
  discard: () => set({ keys: { ...get().keys, composition: null }, choosing: null }),
  typed: (event) => {
    const { field, keys, choosing, numbered } = get()
    if (!field) return
    if ('text' in event) {
      if (keys.language === 'zh' && ZHUYIN_KEYS.test(event.text)) {
        for (const char of event.text) typeZhuyinKey(char)
      } else if (keys.language === 'zh' && Array.from(event.text).length === 1) {
        typeZhuyinKey(event.text)
      } else {
        typeAsIs(event.text)
      }
      return
    }
    // Choosing: return picks the first candidate shown, delete and Esc stop choosing.
    if (choosing !== null) {
      if (event.key === 'enter' && numbered[0]) get().pick(numbered[0])
      else set({ choosing: null })
      if (event.key !== 'wordBackspace') return
    }
    switch (event.key) {
      case 'backspace':
        get().press({ kind: 'delete' })
        break
      case 'wordBackspace':
        if (keys.composition) get().discard()
        else field.write(withoutLastWord(field.read()))
        break
      case 'enter':
        get().press({ kind: 'return' })
        break
      case 'escape':
        get().press({ kind: 'hide' })
        break
    }
  },
}))
