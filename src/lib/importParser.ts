// src/lib/importParser.ts
import * as XLSX from 'xlsx'

/**
 * Parse CSV, TXT, XLS ou XLSX em uma matriz de strings.
 * Linha 0 = cabeçalhos. Linhas 1+ = dados.
 */
export async function parseImportFile(file: File): Promise<string[][]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') return parseExcelFile(file)
  return parseCSVFile(file)
}

async function parseExcelFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  return raw
    .filter(row => row.some((c: any) => String(c ?? '').trim()))
    .map(row => row.map((c: any) => String(c ?? '').trim()))
}

async function parseCSVFile(file: File): Promise<string[][]> {
  const text = await file.text()
  const clean = text
    .replace(/^﻿/, '')                         // BOM Excel UTF-8
    .replace(/^sep=;[^\n\r]*[\n\r]+/i, '')         // hint "sep=;" do Excel
  const firstLine = clean.split(/\r?\n/)[0] ?? ''
  const delim = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  return parseCSV(clean, delim)
}

function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += ch }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === delim) { cur.push(field.trim()); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++
      cur.push(field.trim()); field = ''
      if (cur.some(v => v.trim())) rows.push(cur)
      cur = []
      continue
    }
    field += ch
  }
  cur.push(field.trim())
  if (cur.some(v => v.trim())) rows.push(cur)
  return rows
}
