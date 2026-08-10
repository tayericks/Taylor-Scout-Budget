const DEFAULTS: Record<string, number> = {
  'Site Rep': 50,
  'HVAC': 53.15,
  'Layout': 46.71,
}

const LEGACY: Record<string, number[]> = {
  'Site Rep': [0, 25],
  'HVAC': [0],
  'Layout': [0],
}

const seen = new WeakSet<HTMLInputElement>()
const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

function commitRate(input: HTMLInputElement, next: number) {
  if (!nativeValueSetter) return
  nativeValueSetter.call(input, String(next))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  window.setTimeout(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })), 25)
}

function applyDefaults() {
  document.querySelectorAll<HTMLElement>('.entry-table-row').forEach(row => {
    const description = row.querySelector<HTMLInputElement>('input[aria-label="Description"]')?.value?.trim()
    if (!description || !(description in DEFAULTS)) return
    const rate = row.querySelector<HTMLInputElement>('input[aria-label="Rate"]')
    if (!rate || seen.has(rate)) return
    seen.add(rate)
    const current = Number(rate.value || 0)
    if ((LEGACY[description] || []).some(v => Math.abs(v - current) < 0.001)) commitRate(rate, DEFAULTS[description])
  })
}

const observer = new MutationObserver(() => window.setTimeout(applyDefaults, 0))
observer.observe(document.documentElement, { childList: true, subtree: true })
document.addEventListener('click', () => window.setTimeout(applyDefaults, 0))
window.setTimeout(applyDefaults, 100)
