import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useText } from '../state/text'
import { ChevronGlyph } from './glyphs'
import { useKeyboard } from './store'
import { candidates, type Composition } from './zhuyin'

/**
 * Zhuyin's candidates (zhuyin.ts) in a row along the keyboard's top, as on the iPhone: what's composed could be
 * any of them, the likeliest first, and pressing one types it. The cab's mouse can't swipe the row along, so the
 * arrows at its ends page through it, a page starting with the first candidate the one before didn't show whole.
 * For a field that doesn't show the Zhuyin being composed (a web page's), it's shown first, as typed.
 * Chosen on the player's own keyboard (store.ts `choosing`), the candidates shown whole are numbered 1 to 9 and 0
 * for its digits, and each turn shows the next page (the first again after the last).
 */
export function Candidates({ composition, reading }: { composition: Composition | null; reading?: string }) {
  const text = useText().keyboard.zhuyin
  const ready = useKeyboard((state) => state.zhuyinReady)
  const choosing = useKeyboard((state) => state.choosing)
  const numbered = useKeyboard((state) => state.numbered)
  const offered = useMemo(() => (ready ? candidates(composition) : []), [composition, ready])

  const row = useRef<HTMLDivElement>(null)
  // Whether the row is at its start, and at its end: the arrow that way does nothing.
  const [ends, setEnds] = useState({ start: true, end: true })
  const measure = () => {
    const element = row.current
    if (!element) return
    const start = element.scrollLeft <= 1
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1
    setEnds((was) => (was.start === start && was.end === end ? was : { start, end }))
  }
  // New candidates start from the first.
  useLayoutEffect(() => {
    row.current?.scrollTo({ left: 0, behavior: 'instant' })
    measure()
  }, [offered])

  /** Where the page before or after the one shown starts: the next, the first candidate not shown whole (none
   * after the last page); the one before, as many candidates before the first shown as fit. */
  const pageStart = (element: HTMLElement, direction: 1 | -1): HTMLElement | undefined => {
    const items = Array.from(element.children) as HTMLElement[]
    const shownFrom = element.scrollLeft
    if (direction > 0) {
      return items.find((item) => item.offsetLeft + item.offsetWidth > shownFrom + element.clientWidth + 1)
    }
    const first = items.find((item) => item.offsetLeft >= shownFrom - 1) ?? items[0]
    return items.find((item) => item.offsetLeft >= first.offsetLeft - element.clientWidth)
  }
  const page = (direction: 1 | -1) => {
    const element = row.current
    if (element) element.scrollTo({ left: pageStart(element, direction)?.offsetLeft ?? 0 })
  }

  // Choosing on the player's own keyboard: the first page, then for each turn the page from the candidate after
  // the last one numbered (the first again after the last), at once; numbered, up to ten it shows whole.
  useLayoutEffect(() => {
    const element = row.current
    if (choosing === null || !element) {
      if (useKeyboard.getState().numbered.length) useKeyboard.setState({ numbered: [] })
      return
    }
    const items = Array.from(element.children) as HTMLElement[]
    const last = useKeyboard.getState().numbered.at(-1)
    const after = choosing > 0 && last ? offered.indexOf(last) + 1 : 0
    const first = after < offered.length ? after : 0
    if (!items[first]) return
    element.scrollTo({ left: items[first].offsetLeft, behavior: 'instant' })
    measure()
    const to = element.scrollLeft + element.clientWidth + 1
    const whole = offered.filter((_, i) => i >= first && items[i].offsetLeft + items[i].offsetWidth <= to)
    useKeyboard.setState({ numbered: whole.slice(0, 10) })
    // Turning the page is what changes `choosing`; new candidates stop it (store.ts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choosing])

  return (
    <div className="keyboard-candidates" role="group" aria-label={text?.candidates}>
      {reading && <span className="candidates-reading">{reading}</span>}
      {offered.length > 0 && (
        <>
          <button
            type="button"
            tabIndex={-1}
            className="candidates-page"
            disabled={ends.start}
            aria-label={text?.previousCandidates}
            onClick={() => page(-1)}
          >
            <ChevronGlyph direction="left" />
          </button>
          <div ref={row} className="candidates-row" onScroll={measure}>
            {offered.map((candidate, i) => {
              const number = choosing === null ? -1 : numbered.indexOf(candidate)
              return (
                <button
                  key={`${candidate.syllables}:${candidate.text}`}
                  type="button"
                  tabIndex={-1}
                  className={i === 0 ? 'candidate first' : 'candidate'}
                  onClick={() => useKeyboard.getState().pick(candidate)}
                >
                  {number >= 0 && (
                    <span className="candidate-number" aria-hidden>
                      {(number + 1) % 10}
                    </span>
                  )}
                  {candidate.text}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="candidates-page"
            disabled={ends.end}
            aria-label={text?.nextCandidates}
            onClick={() => page(1)}
          >
            <ChevronGlyph direction="right" />
          </button>
        </>
      )}
    </div>
  )
}
