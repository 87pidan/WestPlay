// Builds the Zhuyin keyboard's dictionary (ui/src/cabin/keyboard/zhuyin.dictionary.txt) from McBopomofo's data
// (https://github.com/openvanilla/McBopomofo, MIT: THIRD_PARTY_NOTICES.md), scored as McBopomofo's own compiler
// scores it (Source/Data/curation: frequency_builder.py, main_compiler.py), without its symbols and macros.
//
//   node tools/zhuyin-dictionary.mjs <McBopomofo's Source/Data folder> [the fewest times a phrase is seen]
//
// The folder needs BPMFBase.txt, BPMFMappings.txt, phrase.occ, exclusion.txt and heterophony1-3.list. A phrase
// is kept if it was seen at least that many times (2 unless given) and is at most 6 characters long; every
// character is kept.
//
// One line per reading without its tones (its syllables split by `-`, `ㄊㄞ-ㄅㄟ`), a tab, then what's typed
// with it, most likely first, split by spaces: each the characters, a tone per syllable (1 to 5, 5 the neutral
// tone), and how unlikely it is (-10 × log10 of its probability), `台北2340`.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [data, fewest = '2'] = process.argv.slice(2)
if (!data) {
  console.error('usage: node tools/zhuyin-dictionary.mjs <McBopomofo Source/Data folder> [fewest]')
  process.exit(1)
}
const FEWEST = Number(fewest)
const LONGEST = 6
const OUT = resolve(import.meta.dirname, '../ui/src/cabin/keyboard/zhuyin.dictionary.txt')

const rows = (file) =>
  readFileSync(join(data, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/))

// frequency_builder.py: how often each phrase is seen, less where it's part of a longer phrase listed in
// exclusion.txt, weighted 2.7 times for each character past the first, as a log10 share of them all.
const SCALE = 2.7
const seen = new Map(rows('phrase.occ').map(([phrase, times]) => [phrase, Number(times)]))
for (const [part, whole] of rows('exclusion.txt')) {
  if (whole?.includes(part) && seen.has(part) && seen.has(whole)) seen.set(part, seen.get(part) - seen.get(whole))
}
const length = (phrase) => Array.from(phrase).length
let norm = 0
for (const [phrase, times] of seen) norm += SCALE ** (length(phrase) - 1) * times
const frequency = new Map()
for (const [phrase, times] of seen) {
  frequency.set(phrase, Math.log10((SCALE ** (length(phrase) - 1) * (times < 1 ? 0.5 : times)) / norm))
}

// main_compiler.py: each reading of a phrase; a character's (or short phrase's) less usual readings count less
// (its second reading half, its third a quarter, any other a fixed low value).
const UNKNOWN = -99
const HETERONYM = -6.8
const LN2 = Math.log(2)
const [first, second, third] = ['heterophony1.list', 'heterophony2.list', 'heterophony3.list'].map(
  (file) => new Map(rows(file).map(([phrase, reading]) => [phrase, reading])),
)
const readings = new Map()
const add = (phrase, reading) => {
  if (!readings.has(phrase)) readings.set(phrase, [])
  readings.get(phrase).push(reading)
}
const characters = new Set()
for (const [character, reading] of rows('BPMFBase.txt')) {
  characters.add(character)
  add(character, reading)
}
for (const [phrase, ...syllables] of rows('BPMFMappings.txt')) add(phrase, syllables.join('-'))

function score(phrase, reading) {
  const value = frequency.get(phrase) ?? UNKNOWN
  if (length(phrase) > 3 || !first.has(phrase) || first.get(phrase) === reading) return value
  if (second.get(phrase) === reading) return Math.max(value - LN2, HETERONYM)
  if (second.has(phrase) && third.get(phrase) === reading) return Math.max(value - 2 * LN2, HETERONYM)
  return HETERONYM
}

/** A syllable without its tone, and its tone: `ㄊㄞˊ` is `ㄊㄞ` and 2, no mark the first tone; `null` for the
 * tone marks, which BPMFBase.txt lists as characters read as themselves. */
const TONES = { ˊ: 2, ˇ: 3, ˋ: 4, '˙': 5 }
const SYMBOLS = /^[ㄅ-ㄩ]+$/u
function syllable(text) {
  let tone = 1
  const bare = Array.from(text)
    .filter((symbol) => {
      if (!(symbol in TONES)) return true
      tone = TONES[symbol]
      return false
    })
    .join('')
  if (!bare && text in TONES) return null
  if (!SYMBOLS.test(bare)) throw new Error(`not a syllable: ${text}`)
  return { bare, tone }
}

const lines = new Map()
let kept = 0
for (const [phrase, all] of readings) {
  if (!characters.has(phrase) && ((seen.get(phrase) ?? 0) < FEWEST || length(phrase) > LONGEST)) continue
  if (/[\s0-9]/.test(phrase)) throw new Error(`a phrase the dictionary can't hold: ${phrase}`)
  for (const reading of new Set(all)) {
    const syllables = reading.split('-').map(syllable)
    if (syllables.includes(null)) continue
    if (syllables.length !== length(phrase)) throw new Error(`${phrase} read as ${reading}`)
    const key = syllables.map(({ bare }) => bare).join('-')
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key).push({ phrase, tones: syllables.map(({ tone }) => tone).join(''), score: score(phrase, reading) })
    kept++
  }
}

let out = ''
for (const key of [...lines.keys()].sort()) {
  const entries = lines.get(key).sort((a, b) => b.score - a.score || (a.phrase < b.phrase ? -1 : 1))
  out += `${key}\t${entries.map(({ phrase, tones, score }) => `${phrase}${tones}${Math.round(-10 * score)}`).join(' ')}\n`
}
writeFileSync(OUT, out)
console.log(
  `${kept} readings under ${lines.size} keys, ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB: ${OUT}`,
)
