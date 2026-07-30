// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { enhanceLanguageSelect, type ComboboxElements } from './languageCombobox'
import { WHISPER_LANGUAGES } from './languages'

const AUTO = 'Detect automatically'

function build(): ComboboxElements {
  document.body.innerHTML = `
    <select id="language-select">
      <option value="">${AUTO}</option>
      ${WHISPER_LANGUAGES.map((l) => `<option value="${l.code}">${l.name}</option>`).join('')}
    </select>
    <div id="wrap" class="hidden">
      <input id="combobox" type="text" role="combobox" aria-expanded="false" />
      <ul id="listbox" role="listbox" hidden></ul>
      <p id="no-matches" class="hidden"></p>
      <p id="status"></p>
    </div>
  `
  return {
    select: document.getElementById('language-select') as HTMLSelectElement,
    wrap: document.getElementById('wrap')!,
    input: document.getElementById('combobox') as HTMLInputElement,
    listbox: document.getElementById('listbox')!,
    noMatches: document.getElementById('no-matches')!,
    status: document.getElementById('status')!
  }
}

// Mirrors the shape of the real strings in `ui.ts` rather than inventing copy.
const labels = {
  auto: AUTO,
  noMatches: 'No language matches that',
  results: (count: number) => `Results: ${count}`
}

function enhance() {
  const elements = build()
  const ok = enhanceLanguageSelect(elements, labels)
  return { ...elements, ok }
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(input: HTMLInputElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

function optionTexts(listbox: HTMLElement): string[] {
  return [...listbox.querySelectorAll('[role="option"]')].map(
    (option) => option.firstElementChild?.textContent ?? ''
  )
}

describe('enhanceLanguageSelect', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hides the select, reveals the combobox, and keeps the select as the value', () => {
    const { ok, select, wrap, input } = enhance()

    expect(ok).toBe(true)
    expect(select.hidden).toBe(true)
    expect(wrap.classList.contains('hidden')).toBe(false)
    expect(input.value).toBe(AUTO)
    expect(select.value).toBe('')
  })

  /**
   * app.ts resolves every id in the manifest eagerly and hands whatever it finds to
   * this function. If the markup ever drifts, no-op — throwing here would abort
   * init() and silently unhook every other listener on the page.
   */
  it('no-ops instead of throwing when the elements are not what it expects', () => {
    document.body.innerHTML = `
      <div id="not-a-select"></div><div id="wrap"></div><div id="not-an-input"></div>
      <ul id="listbox"></ul><p id="no-matches"></p><p id="status"></p>
    `
    const result = enhanceLanguageSelect(
      {
        select: document.getElementById('not-a-select') as HTMLSelectElement,
        wrap: document.getElementById('wrap')!,
        input: document.getElementById('not-an-input') as HTMLInputElement,
        listbox: document.getElementById('listbox')!,
        noMatches: document.getElementById('no-matches')!,
        status: document.getElementById('status')!
      },
      labels
    )

    expect(result).toBe(false)
  })

  it('filters the list as you type, matching an English name', () => {
    const { input, listbox } = enhance()

    type(input, 'german')

    expect(optionTexts(listbox)).toEqual(['Deutsch'])
  })

  it('finds a language by a Spanish alias', () => {
    const { input, listbox } = enhance()

    type(input, 'japones')

    expect(optionTexts(listbox)).toEqual(['日本語'])
  })

  it('keeps the auto entry when its own label matches', () => {
    const { input, listbox } = enhance()

    type(input, 'detect')

    expect(optionTexts(listbox)).toEqual([AUTO])
  })

  it('shows the no-matches message and announces it', () => {
    const { input, listbox, noMatches, status } = enhance()

    type(input, 'zzzz')

    expect(listbox.children).toHaveLength(0)
    expect(noMatches.classList.contains('hidden')).toBe(false)
    expect(status.textContent).toBe(labels.noMatches)
  })

  it('announces the number of results', () => {
    const { input, status } = enhance()

    type(input, 'german')

    expect(status.textContent).toBe('Results: 1')
  })

  it('commits a choice with Enter and writes it to the select', () => {
    const { input, select } = enhance()

    type(input, 'german')
    press(input, 'Enter')

    expect(select.value).toBe('de')
    expect(input.value).toBe('Deutsch')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('fires a change event on the select so anything listening still sees it', () => {
    const { input, select } = enhance()
    let fired = 0
    select.addEventListener('change', () => fired++)

    type(input, 'french')
    press(input, 'Enter')

    expect(fired).toBe(1)
    expect(select.value).toBe('fr')
  })

  it('moves the active option with the arrow keys via aria-activedescendant', () => {
    const { input, listbox } = enhance()

    type(input, 'a')
    const first = input.getAttribute('aria-activedescendant')
    press(input, 'ArrowDown')
    const second = input.getAttribute('aria-activedescendant')

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    expect(listbox.querySelector(`#${second}`)).toBeTruthy()
  })

  it('wraps around at both ends of the list', () => {
    const { input, listbox } = enhance()

    type(input, 'german')
    press(input, 'ArrowUp')

    expect(input.getAttribute('aria-activedescendant')).toBe(listbox.lastElementChild?.id)
  })

  // This is an editable text field, so Home and End belong to the caret.
  it('leaves Home and End to the text cursor', () => {
    const { input } = enhance()

    type(input, 'a')

    expect(press(input, 'Home').defaultPrevented).toBe(false)
    expect(press(input, 'End').defaultPrevented).toBe(false)
  })

  /**
   * The bug: focusing the field highlighted the first row, which is always
   * "Detect automatically". Tabbing straight through the control therefore
   * committed it, wiping a language the user had already chosen.
   */
  it('does not change the selection when focused and tabbed through', () => {
    const { input, select } = enhance()

    type(input, 'german')
    press(input, 'Enter')
    expect(select.value).toBe('de')

    input.dispatchEvent(new Event('focus', { bubbles: true }))
    press(input, 'Tab')

    expect(select.value).toBe('de')
    expect(input.value).toBe('Deutsch')
  })

  it('highlights the committed language when the list opens unfiltered', () => {
    const { input, listbox } = enhance()

    type(input, 'greek')
    press(input, 'Enter')
    input.dispatchEvent(new Event('focus', { bubbles: true }))

    const active = listbox.querySelector(`#${input.getAttribute('aria-activedescendant')}`)
    expect(active?.firstElementChild?.textContent).toBe('Ελληνικά')
  })

  // Escape leaves focus in the field, so no further focus event is coming.
  it('reopens on click after Escape closed it', () => {
    const { input, listbox } = enhance()

    input.dispatchEvent(new Event('focus', { bubbles: true }))
    press(input, 'Escape')
    expect(listbox.hidden).toBe(true)

    input.dispatchEvent(new Event('click', { bubbles: true }))
    expect(listbox.hidden).toBe(false)
  })

  // Reporting an expanded popup with no options sends a screen reader looking
  // for something that is not there.
  it('reports the popup as collapsed when nothing matches', () => {
    const { input, listbox, noMatches } = enhance()

    type(input, 'zzzz')

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(listbox.hidden).toBe(true)
    expect(noMatches.classList.contains('hidden')).toBe(false)
  })

  it('closes on Escape and puts the committed label back', () => {
    const { input, select, listbox } = enhance()

    type(input, 'german')
    press(input, 'Enter')
    type(input, 'nonsense')
    press(input, 'Escape')

    expect(listbox.hidden).toBe(true)
    expect(input.value).toBe('Deutsch')
    expect(select.value).toBe('de')
  })

  // Arrowing to something and tabbing away should take it, not discard it.
  it('commits the active option on Tab', () => {
    const { input, select } = enhance()

    type(input, 'italian')
    press(input, 'Tab')

    expect(select.value).toBe('it')
  })

  it('selects an option with the pointer', () => {
    const { input, select, listbox } = enhance()

    type(input, 'korean')
    const option = listbox.querySelector('[role="option"]')!
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(select.value).toBe('ko')
    expect(input.value).toBe('한국어')
  })

  it('marks the committed option as selected', () => {
    const { input, listbox } = enhance()

    type(input, 'polish')
    press(input, 'Enter')
    type(input, 'polish')

    const option = listbox.querySelector('[role="option"]')!
    expect(option.getAttribute('aria-selected')).toBe('true')
  })

  it('prevents the default for keys it handles and leaves others alone', () => {
    const { input } = enhance()
    type(input, 'a')

    expect(press(input, 'ArrowDown').defaultPrevented).toBe(true)
    expect(press(input, 'Enter').defaultPrevented).toBe(true)
    expect(press(input, 'Escape').defaultPrevented).toBe(true)
    expect(press(input, 'a').defaultPrevented).toBe(false)
  })

  it('reverts unconfirmed text when focus leaves the widget', () => {
    const { input, wrap, select } = enhance()

    type(input, 'greek')
    press(input, 'Enter')
    type(input, 'half typed')
    wrap.dispatchEvent(new Event('focusout', { bubbles: true }))

    expect(input.value).toBe('Ελληνικά')
    expect(select.value).toBe('el')
  })
})
