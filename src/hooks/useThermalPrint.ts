// src/hooks/useThermalPrint.ts
export function useThermalPrint() {
  function print(paperWidth: 58 | 80 = 80) {
    const styleId = '__thermal_page_size__'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = `@media print { @page { size: ${paperWidth}mm auto; margin: 3mm 2mm; } }`
    window.print()
    window.addEventListener('afterprint', () => style?.remove(), { once: true })
  }
  return { print }
}
