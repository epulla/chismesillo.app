/**
 * Turns the language `<select>` into a searchable combobox.
 *
 * Thirty-five options listed under their own names are unscannable: someone
 * looking for German has to recognise "Deutsch" by sight. Typing is the fix, and a
 * native `<select>` cannot be typed into beyond first-letter jumping.
 *
 * Progressive enhancement, deliberately: the `<select>` stays in the DOM and stays
 * the value source, so `app.ts` keeps reading `languageSelect.value` and the page
 * still works with the combobox never enhanced (no JS, or an unexpected DOM).
 *
 * Follows the WAI-ARIA 1.2 combobox-with-listbox pattern: focus never leaves the
 * input, and the active option is pointed at with `aria-activedescendant` rather
 * than by moving focus into the list.
 */
import { foldForSearch, matchLanguages, WHISPER_LANGUAGES, type WhisperLanguage } from './languages'

export type ComboboxElements = {
  select: HTMLSelectElement
  wrap: HTMLElement
  input: HTMLInputElement
  listbox: HTMLElement
  noMatches: HTMLElement
  status: HTMLElement
}

export type ComboboxLabels = {
  /** Label for the empty-value entry that lets Whisper detect the language. */
  auto: string
  /** Announced when the filter matches nothing. */
  noMatches: string
  /** Announced after every filter, e.g. `(n) => \`${n} languages\``. */
  results: (count: number) => string
}

type Entry = {
  code: string
  label: string
  /** Shown next to the label when it differs, to help people scanning in English. */
  hint: string
}

const OPTION_ID_PREFIX = 'language-option-'

const AUTO_CODE = ''

function toEntry(language: WhisperLanguage): Entry {
  return {
    code: language.code,
    label: language.name,
    hint: language.englishName === language.name ? '' : language.englishName
  }
}

/**
 * Wires the combobox up. Returns false and changes nothing when the elements are
 * not what we expect — `app.ts` resolves every id eagerly at module load, so this
 * has to survive a DOM that only looks roughly right rather than throwing and
 * taking the rest of the page's listeners down with it.
 */
export function enhanceLanguageSelect(elements: ComboboxElements, labels: ComboboxLabels): boolean {
  const { select, wrap, input, listbox, noMatches, status } = elements

  const usable =
    typeof HTMLSelectElement !== 'undefined' &&
    select instanceof HTMLSelectElement &&
    input instanceof HTMLInputElement &&
    Boolean(wrap && listbox && noMatches && status)
  if (!usable) return false

  const autoEntry: Entry = { code: AUTO_CODE, label: labels.auto, hint: '' }
  const allEntries = [autoEntry, ...WHISPER_LANGUAGES.map(toEntry)]

  let filtered: Entry[] = allEntries
  let activeIndex = -1
  let open = false
  let committed = entryFor(select.value)

  // The select is no longer the control anyone interacts with, but it stays the
  // value carrier. `hidden` takes it out of the tab order and the a11y tree at once.
  select.hidden = true
  wrap.classList.remove('hidden')
  input.value = committed.label

  input.addEventListener('input', () => {
    filter(input.value)
    openList()
  })

  input.addEventListener('focus', () => {
    input.select()
    filter('')
    openList()
  })

  // Escape closes without moving focus, so no further `focus` event is coming and
  // clicking the field again would otherwise do nothing.
  input.addEventListener('click', () => {
    if (!open) {
      filter('')
      openList()
    }
  })

  input.addEventListener('keydown', onKeydown)

  // mousedown, not click: blur fires first on click and would close the list out
  // from under the pointer before the selection lands.
  listbox.addEventListener('mousedown', (event) => {
    const option = (event.target as HTMLElement | null)?.closest('[role="option"]')
    if (!(option instanceof HTMLElement)) return
    event.preventDefault()
    const index = Number(option.dataset.index)
    if (Number.isInteger(index) && filtered[index]) commit(filtered[index])
  })

  // Anything that moves focus out of the widget abandons whatever was typed.
  wrap.addEventListener('focusout', () => {
    if (wrap.contains(document.activeElement)) return
    closeList()
    input.value = committed.label
  })

  render()
  return true

  /* ------------------------------------------------------------------ */

  function entryFor(code: string): Entry {
    return allEntries.find((entry) => entry.code === code) ?? autoEntry
  }

  function filter(query: string) {
    const matches = matchLanguages(query).map(toEntry)
    // "Detect automatically" is not a language, so it is matched on its own label.
    const needle = foldForSearch(query)
    const includeAuto = !needle || foldForSearch(labels.auto).includes(needle)
    filtered = includeAuto ? [autoEntry, ...matches] : matches

    // With no query, highlight what is already committed. Highlighting the first
    // row instead makes focusing and tabbing away commit "Detect automatically",
    // silently discarding a language the user had chosen.
    activeIndex = needle
      ? filtered.length
        ? 0
        : -1
      : filtered.findIndex((entry) => entry.code === committed.code)

    render()
    announce()
  }

  function openList() {
    if (open) return
    open = true
    render()
  }

  function closeList() {
    if (!open) return
    open = false
    activeIndex = -1
    render()
  }

  function move(delta: number) {
    if (!filtered.length) return
    if (!open) {
      openList()
      activeIndex = delta > 0 ? 0 : filtered.length - 1
    } else {
      activeIndex = (activeIndex + delta + filtered.length) % filtered.length
    }
    render()
  }

  function commit(entry: Entry) {
    committed = entry
    input.value = entry.label
    select.value = entry.code
    // app.ts reads the value on start rather than listening, but anything else
    // wired to the select should still see a normal change.
    select.dispatchEvent(new Event('change', { bubbles: true }))
    closeList()
  }

  function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        return
      // Home and End are deliberately not handled: this is an editable combobox,
      // so they belong to the text cursor. Taking them would break a basic text
      // field affordance to save one keystroke of list navigation.
      case 'Enter': {
        if (!open) return
        event.preventDefault()
        const entry = filtered[activeIndex]
        if (entry) commit(entry)
        return
      }
      case 'Tab': {
        // Leaving with something highlighted takes it; the pattern treats Tab as
        // an implicit confirmation rather than throwing the selection away.
        const entry = open ? filtered[activeIndex] : undefined
        if (entry) commit(entry)
        else closeList()
        return
      }
      case 'Escape':
        event.preventDefault()
        closeList()
        input.value = committed.label
        return
      default:
    }
  }

  // Rewriting the live region on every keystroke restarts the reader mid-sentence.
  function announce() {
    const message = filtered.length ? labels.results(filtered.length) : labels.noMatches
    if (status.textContent !== message) status.textContent = message
  }

  function render() {
    // An empty popup is not "expanded": that sends a screen reader looking for
    // options that do not exist. The visible no-matches line carries it instead.
    const popupVisible = open && filtered.length > 0
    input.setAttribute('aria-expanded', String(popupVisible))
    listbox.hidden = !popupVisible
    noMatches.classList.toggle('hidden', !open || filtered.length > 0)

    const fragment = document.createDocumentFragment()
    filtered.forEach((entry, index) => {
      const option = document.createElement('li')
      option.id = `${OPTION_ID_PREFIX}${index}`
      option.dataset.index = String(index)
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(entry.code === committed.code))
      option.className =
        'flex cursor-pointer items-baseline gap-2 rounded-field px-3 py-1.5 text-sm'
      // The background disappears under forced-colors; the outline survives.
      option.classList.toggle('bg-base-200', index === activeIndex)
      option.classList.toggle('forced-colors:outline', index === activeIndex)

      const label = document.createElement('span')
      label.textContent = entry.label
      option.append(label)

      if (entry.hint) {
        const hint = document.createElement('span')
        hint.className = 'text-muted text-xs'
        hint.textContent = entry.hint
        option.append(hint)
      }

      fragment.append(option)
    })
    listbox.replaceChildren(fragment)

    const active = popupVisible && activeIndex >= 0 ? listbox.children[activeIndex] : null
    if (active instanceof HTMLElement) {
      input.setAttribute('aria-activedescendant', active.id)
      active.scrollIntoView?.({ block: 'nearest' })
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }
}
