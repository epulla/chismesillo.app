export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

export function show(node: HTMLElement, visible = true) {
  node.classList.toggle('hidden', !visible)
}

export function setText(node: HTMLElement, text: string) {
  node.textContent = text
}

/** Locale-aware strings shipped by the server for the active page. */
type Strings = Record<string, Record<string, string>>

export function createTranslator() {
  const strings = (window as unknown as { __I18N__?: Strings }).__I18N__ ?? {}
  return function t(path: string, vars?: Record<string, unknown>): string {
    const [section, key] = path.split('.')
    const value = section && key ? strings[section]?.[key] : undefined
    if (typeof value !== 'string') return path
    if (!vars) return value
    return value.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match
    )
  }
}

export function currentLang(): string {
  return (window as unknown as { __LANG__?: string }).__LANG__ ?? 'en'
}
