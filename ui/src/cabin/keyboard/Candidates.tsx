import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useText } from '../state/text'
import { ChevronGlyph } from './glyphs'
import { useKeyboard } from './store'
import { candidates, type Composition } from './zhuyin'

/**
 * Zhuyin's candidates (zhuyin.ts) in a row along the keyboard's top, as on the iPhone: what's composed could be
 * any of them, the likeliest first, and pressing one types it. The cab's mouse can't swipe the row along, so the
 * arrows at its ends page through it, a page starting with the first candidate the one before didn't show whole.
 */
export function Candidates({ composition }: { composition: Composition | null }) {
  const text = useText().keyboard.zhuyin
  const ready = useKeyboard((state) => state.zhuyinReady)
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

  const page = (direction: 1 | -1) => {
    const element = row.current
    if (!element) return
    const items = Array.from(element.children) as HTMLElement[]
    const shownFrom = element.scrollLeft
    let to: HTMLElement | undefined
    if (direction > 0) {
      to = items.find((item) => item.offsetLeft + item.offsetWidth > shownFrom + element.clientWidth + 1)
    } else {
      const first = items.find((item) => item.offsetLeft >= shownFrom - 1) ?? items[0]
      to = items.find((item) => item.offsetLeft >= first.offsetLeft - element.clientWidth)
    }
    element.scrollTo({ left: to?.offsetLeft ?? 0 })
  }

  return (
    <div className="keyboard-candidates" role="group" aria-label={text?.candidates}>
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
            {offered.map((candidate, i) => (
              <button
                key={`${candidate.syllables}:${candidate.text}`}
                type="button"
                tabIndex={-1}
                className={i === 0 ? 'candidate first' : 'candidate'}
                onClick={() => useKeyboard.getState().pick(candidate)}
              >
                {candidate.text}
              </button>
            ))}
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
