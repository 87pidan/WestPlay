import { afterEach, describe, expect, it } from 'vitest'

import { type Typing, useKeyboard } from './store'
import { loadDictionary } from './zhuyin'

/** A field as TextField makes it: the text it holds, and what was submitted. */
function fakeField(id: string, returnKind: Typing['returnKind'] = 'search') {
  const field = { text: '', submitted: [] as string[] }
  const typing: Typing = {
    id,
    returnKind,
    read: () => field.text,
    write: (text) => {
      field.text = text
    },
    submit: () => field.submitted.push(field.text),
  }
  return { field, typing }
}

afterEach(() => {
  useKeyboard.setState({ field: null, selection: 0, chosen: null, flash: null })
})

describe('useKeyboard', () => {
  it('types into the selected field, and submits and goes away on return', () => {
    const { field, typing } = fakeField('search')
    const keyboard = useKeyboard.getState()
    keyboard.attach(typing, 'en')
    keyboard.press({ kind: 'char', char: 'b' })
    keyboard.press({ kind: 'char', char: 'a' })
    keyboard.press({ kind: 'return' })
    expect(field).toEqual({ text: 'ba', submitted: ['ba'] })
    expect(useKeyboard.getState().field).toBeNull()
    // Away: keys do nothing.
    useKeyboard.getState().press({ kind: 'char', char: 'x' })
    expect(field.text).toBe('ba')
  })

  it('goes away when its field leaves, and only then', () => {
    const one = fakeField('one')
    const two = fakeField('two')
    useKeyboard.getState().attach(one.typing, 'en')
    useKeyboard.getState().attach(two.typing, 'en')
    // The first field leaving the screen doesn't take the keyboard from the second.
    useKeyboard.getState().detach('one')
    expect(useKeyboard.getState().field?.id).toBe('two')
    useKeyboard.getState().detach('two')
    expect(useKeyboard.getState().field).toBeNull()
  })

  it("starts in the game's language, and keeps the one the player switches to", () => {
    useKeyboard.getState().attach(fakeField('a').typing, 'tr')
    expect(useKeyboard.getState().keys.language).toBe('tr')
    useKeyboard.getState().press({ kind: 'globe' })
    useKeyboard.getState().detach('a')
    useKeyboard.getState().attach(fakeField('b').typing, 'tr')
    expect(useKeyboard.getState().keys.language).toBe('en')
  })

  it('keeps shift and the layer while the same field is selected again, and resets them for another', () => {
    const { typing } = fakeField('a')
    useKeyboard.getState().attach(typing, 'en')
    useKeyboard.getState().press({ kind: 'layer', to: 'numbers' })
    useKeyboard.getState().attach(typing, 'en')
    expect(useKeyboard.getState().keys.layer).toBe('numbers')
    useKeyboard.getState().attach(fakeField('b').typing, 'en')
    expect(useKeyboard.getState().keys.layer).toBe('letters')
  })

  it('types what the player types on their own keyboard', () => {
    const { field, typing } = fakeField('search')
    useKeyboard.getState().attach(typing, 'tr')
    const typed = useKeyboard.getState().typed
    typed({ text: 'Kok' })
    expect(useKeyboard.getState().flash?.char).toBe('k')
    typed({ key: 'backspace' })
    typed({ text: 'kkola servis' })
    typed({ key: 'wordBackspace' })
    expect(field.text).toBe('Kokkola ')
    typed({ key: 'enter' })
    expect(field.submitted).toEqual(['Kokkola '])
    // Submitted: the field let go, so the keys are the game's again.
    expect(useKeyboard.getState().selection).toBe(0)
  })

  it("composes Zhuyin, picks its candidates, and types what's composed before the player's own keys", async () => {
    await loadDictionary()
    const { field, typing } = fakeField('search')
    const keyboard = useKeyboard.getState()
    keyboard.attach(typing, 'zh')
    for (const char of 'ㄍㄠㄒㄩㄥˊㄕˋ') useKeyboard.getState().press({ kind: 'char', char })
    // Composed, not yet in the field.
    expect(field.text).toBe('')
    expect(useKeyboard.getState().zhuyinReady).toBe(true)
    keyboard.pick({ text: '高雄', syllables: 2 })
    expect(field.text).toBe('高雄')
    expect(useKeyboard.getState().keys.composition?.syllables).toHaveLength(1)
    keyboard.pick({ text: '市', syllables: 1 })
    // The player's own keyboard: what's composed first, then what they typed.
    for (const char of 'ㄌㄨˋ') useKeyboard.getState().press({ kind: 'char', char })
    keyboard.typed({ text: ' 1' })
    expect(field.text).toBe('高雄市路 1')
    expect(useKeyboard.getState().keys.composition).toBeNull()
    // The field gone: what was composed for it goes too.
    useKeyboard.getState().press({ kind: 'char', char: 'ㄅ' })
    keyboard.detach('search')
    expect(useKeyboard.getState().keys.composition).toBeNull()
  })

  it('numbers every selection, and lets go of it with Esc', () => {
    const { typing } = fakeField('search')
    useKeyboard.getState().attach(typing, 'en')
    const first = useKeyboard.getState().selection
    // The same field selected again (clicked after the truck moved): a new selection.
    useKeyboard.getState().attach(typing, 'en')
    expect(useKeyboard.getState().selection).toBeGreaterThan(first)
    useKeyboard.getState().typed({ key: 'escape' })
    expect(useKeyboard.getState()).toMatchObject({ field: null, selection: 0 })
  })
})
