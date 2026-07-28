// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import { DOM_IDS } from './domIds'
import { DEFAULT_MODEL_ID, MODELS } from './models'

/**
 * app.ts calls init() during module evaluation, so anything it touches has to be
 * initialised by then. A `let` declared further down the file is still in its
 * temporal dead zone at that point: reading it throws, init() aborts, and every
 * listener it was about to register is silently never attached. The page still
 * looks alive because `<label for>` opens the file picker without JavaScript.
 *
 * Nothing else imports app.ts, so that failure mode was invisible to the suite.
 * This spec loads the module against the real id manifest and then checks that a
 * listener actually landed.
 */
function buildDom() {
  for (const id of Object.values(DOM_IDS)) {
    // The model select is the one element whose contents matter: init() assigns
    // DEFAULT_MODEL_ID to it and updateModelHelp only reads supportsWebGPU once
    // findModel resolves, so without the options the crash path is never taken.
    if (id === DOM_IDS.modelSelect) {
      const select = document.createElement('select')
      select.id = id
      for (const model of MODELS) {
        const option = document.createElement('option')
        option.value = model.id
        option.textContent = model.key
        select.append(option)
      }
      document.body.append(select)
      continue
    }

    const node = document.createElement('div')
    node.id = id
    document.body.append(node)
  }
}

describe('app module', () => {
  beforeAll(async () => {
    buildDom()
    await import('./app')
  })

  it('resolves the default model, so init() reached updateModelHelp', () => {
    const select = document.getElementById(DOM_IDS.modelSelect) as HTMLSelectElement
    expect(select.value).toBe(DEFAULT_MODEL_ID)
  })

  it('registers the dropzone drop handler', () => {
    const dropzone = document.getElementById(DOM_IDS.dropzone)!
    const event = new Event('drop', { bubbles: true, cancelable: true })
    dropzone.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('registers the dropzone dragover handler', () => {
    const dropzone = document.getElementById(DOM_IDS.dropzone)!
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    dropzone.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(dropzone.classList.contains('is-dragging')).toBe(true)
  })
})
