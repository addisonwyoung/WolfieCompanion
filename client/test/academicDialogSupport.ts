import { beforeEach, vi } from 'vitest'

// JSDOM has no native modal top layer. These only allow component state tests;
// inertness, browser cancellation and focus containment are tested in Chrome.
if (!HTMLDialogElement.prototype.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') },
})
if (!HTMLDialogElement.prototype.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') },
})
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('Browser confirm is forbidden in academic items') })
  vi.spyOn(window, 'alert').mockImplementation(() => { throw new Error('Browser alert is forbidden in academic items') })
})
