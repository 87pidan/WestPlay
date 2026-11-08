/**
 * Traditional Chinese typed in Zhuyin (注音), as Taiwan types it: the symbols of a syllable in their order
 * (its initial, medial and final: ㄊ ㄞ), then its tone (ˊ ˇ ˋ ˙, or space for the first), and the syllables
 * typed so far become characters from a dictionary, as the iPhone's Zhuyin keyboard and the PC's input methods do.
 * What's typed waits, shown after the field's text, while the candidates above the keyboard offer what it could
 * be: the likeliest reading of it all first (台北 for ㄊㄞˊㄅㄟˇ), then the phrases it starts with, then the
 * characters of its first syllable. Picking one types it, and the syllables after it wait for theirs. A tone may
 * be left out: a symbol that can't join the syllable (ㄅ after ㄊㄞ) starts the next one, and a syllable without
 * its tone stands for any of them. Space after the tone, and return, type the first candidate.
 *
 * The dictionary (zhuyin.dictionary.txt) is McBopomofo's phrases and characters, scored as McBopomofo scores
 * them (tools/zhuyin-dictionary.mjs builds it); it loads the first time the keyboard shows.
 */

/** A syllable's tone: 1 to 4, 5 the neutral tone (˙). */
export type Tone = 1 | 2 | 3 | 4 | 5

export interface Syllable {
  initial: string
  medial: string
  final: string
  /** `null` until one is typed: any tone. */
  tone: Tone | null
}

/** What's typed and not yet characters. */
export interface Composition {
  syllables: readonly Syllable[]
  /** Whether the last syllable still takes symbols: until its tone is typed. */
  open: boolean
}

/** A candidate for the composition: its characters, for the first this many syllables. */
export interface Candidate {
  text: string
  syllables: number
}

const PARTS = ['initial', 'medial', 'final'] as const
type Part = (typeof PARTS)[number]
const SYMBOLS: Record<Part, string> = {
  initial: 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ',
  medial: 'ㄧㄨㄩ',
  final: 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ',
}
const TONES: Record<string, Tone> = { ˊ: 2, ˇ: 3, ˋ: 4, '˙': 5 }
/** Each tone's mark, as shown while it's composed (the first tone's too, so space is seen to have typed it). */
const MARKS = ['', 'ˉ', 'ˊ', 'ˇ', 'ˋ', '˙']

/** The composition after typing `char`, or `null` where it isn't Zhuyin's to take (a digit, a tone mark with
 * nothing to compose): typed as it is, after what's composed. */
export function zhuyinTyped(composition: Composition | null, char: string): Composition | null {
  const tone = TONES[char]
  if (tone) return composition ? zhuyinToned(composition, tone) : null
  const part = PARTS.find((part) => SYMBOLS[part].includes(char))
  if (!part) return null
  const syllables = composition?.syllables ?? []
  const last = syllables.at(-1)
  // Into the open syllable where it's empty there and after (ㄊ then ㄞ), else the next syllable's start.
  if (composition?.open && last && PARTS.slice(PARTS.indexOf(part)).every((later) => !last[later])) {
    return { syllables: [...syllables.slice(0, -1), { ...last, [part]: char }], open: true }
  }
  return { syllables: [...syllables, { initial: '', medial: '', final: '', tone: null, [part]: char }], open: true }
}

/** The composition with its last syllable's tone: closing it, or changing the tone it has. */
export function zhuyinToned(composition: Composition, tone: Tone): Composition {
  const { syllables } = composition
  return { syllables: [...syllables.slice(0, -1), { ...syllables[syllables.length - 1], tone }], open: false }
}

/** The composition after delete: its last symbol (a tone, then the symbols back to front) taken away; `null`
 * once nothing's left. */
export function zhuyinDeleted(composition: Composition): Composition | null {
  const rest = composition.syllables.slice(0, -1)
  const last = composition.syllables[composition.syllables.length - 1]
  if (last.tone !== null) return { syllables: [...rest, { ...last, tone: null }], open: true }
  const part = PARTS.findLast((part) => last[part])
  const shorter = part ? { ...last, [part]: '' } : last
  if (PARTS.some((part) => shorter[part])) return { syllables: [...rest, shorter], open: true }
  if (!rest.length) return null
  // Gone: the syllable before takes symbols again, if it was closed only by this one's start.
  return { syllables: rest, open: rest[rest.length - 1].tone === null }
}

/** The composition after picking `candidate`: the syllables it doesn't stand for, `null` for none. */
export function zhuyinPicked(composition: Composition, candidate: Candidate): Composition | null {
  const rest = composition.syllables.slice(candidate.syllables)
  return rest.length ? { syllables: rest, open: composition.open } : null
}

/** The syllables as typed (ㄊㄞˊㄅㄟˇ). */
export function spelled(syllables: readonly Syllable[]): string {
  return syllables.map((syllable) => bare(syllable) + (syllable.tone ? MARKS[syllable.tone] : '')).join('')
}

const bare = ({ initial, medial, final }: Syllable) => initial + medial + final

/** The dictionary's lines, by the reading without its tones (`ㄊㄞ-ㄅㄟ`), each read when first needed. */
let dictionary: Map<string, string> | null = null
/** What's typed with a reading, most likely first, and how unlikely each is (-10 × log10 of its probability). */
interface Entry {
  text: string
  tones: string
  cost: number
}
const read = new Map<string, Entry[]>()
let loading: Promise<void> | null = null

/** Uses `text` (zhuyin.dictionary.txt's) as the dictionary. */
export function setDictionary(text: string): void {
  dictionary = new Map()
  read.clear()
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab > 0) dictionary.set(line.slice(0, tab), line.slice(tab + 1))
  }
}

/** Loads the dictionary, once (again if it failed). */
export function loadDictionary(): Promise<void> {
  loading ??= import('./zhuyin.dictionary.txt?raw').then(
    ({ default: text }) => setDictionary(text),
    (error: unknown) => {
      loading = null
      throw error
    },
  )
  return loading
}

export function dictionaryLoaded(): boolean {
  return dictionary !== null
}

/** The longest phrase the dictionary has, in syllables. */
const LONGEST = 6
/** A syllable the dictionary has nothing for (ㄅㄩ, a symbol typed by mistake) stays as typed, as unlikely as this. */
const UNKNOWN = 200
/** The most candidates offered. */
const MOST = 150

/** What the dictionary has for `syllables` (whatever their tones where they have none), most likely first. */
function phrases(syllables: readonly Syllable[]): Entry[] {
  const key = syllables.map(bare).join('-')
  let entries = read.get(key)
  if (!entries) {
    entries = (dictionary?.get(key)?.split(' ') ?? []).map((entry) => {
      const at = entry.search(/\d/)
      const tones = entry.slice(at, at + syllables.length)
      return { text: entry.slice(0, at), tones, cost: Number(entry.slice(at + syllables.length)) }
    })
    read.set(key, entries)
  }
  return entries.filter(({ tones }) => syllables.every(({ tone }, i) => tone === null || tones[i] === String(tone)))
}

/** The likeliest characters for all of `syllables`: the phrases that together are most likely (McBopomofo's
 * way), a syllable the dictionary hasn't as it's typed. */
function likeliest(syllables: readonly Syllable[]): string {
  const best = [{ cost: 0, text: '' }]
  for (let end = 1; end <= syllables.length; end++) {
    best[end] = { cost: Infinity, text: '' }
    for (let start = Math.max(0, end - LONGEST); start < end; start++) {
      const part = syllables.slice(start, end)
      const top = phrases(part)[0]
      const [cost, text] = top ? [top.cost, top.text] : part.length === 1 ? [UNKNOWN, spelled(part)] : [Infinity, '']
      if (best[start].cost + cost < best[end].cost) {
        best[end] = { cost: best[start].cost + cost, text: best[start].text + text }
      }
    }
  }
  return best[syllables.length].text
}

/** The characters the composition becomes when it's typed without a candidate picked (space, return): its
 * likeliest reading, or the symbols as typed until the dictionary has loaded. */
export function converted(composition: Composition): string {
  return dictionary ? likeliest(composition.syllables) : spelled(composition.syllables)
}

/** What the composition could be, the likeliest reading of it all first, then the phrases it starts with,
 * longest first, then its first syllable's characters; none until the dictionary has loaded. */
export function candidates(composition: Composition | null): Candidate[] {
  if (!composition || !dictionary) return []
  const { syllables } = composition
  const offered: Candidate[] = []
  const seen = new Set<string>()
  const offer = (text: string, count: number) => {
    const id = `${count}:${text}`
    if (seen.has(id) || offered.length >= MOST) return
    seen.add(id)
    offered.push({ text, syllables: count })
  }
  if (syllables.length > 1) offer(likeliest(syllables), syllables.length)
  for (let count = Math.min(syllables.length, LONGEST); count > 0; count--) {
    for (const { text } of phrases(syllables.slice(0, count))) offer(text, count)
  }
  return offered
}
