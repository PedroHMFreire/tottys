// src/components/products/ImportBatchModal.tsx
import React, { useMemo, useRef, useState } from 'react';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/state/store';

type Props = {
  onClose: () => void;
  /** opcional: forçar uma loja específica para registrar estoque */
  storeId?: string | null;
  /** callback com estatísticas após importar */
  onImported?: (stats: {
    total: number;
    created: number;
    updated: number;
    stockUpserts: number;
    errors: string[];
  }) => void;
};

type RowObj = { [k: string]: string | undefined };

const REQUIRED_COLS = [
  'CodigoNFe', 'Nome',
  'EAN (Codigo Barras)',
  'ValorPrecoFixado', 'PrecoCusto',
  'NCM', 'CFOP', 'CEST',
  'UnidadeComercial', 'OrigemMercadoria', 'GrupoTributario',
  'Marca', 'Categoria'
];

// Colunas opcionais para estoque por loja (se existirem no CSV)
const STOCK_ALIASES = ['Estoque', 'Saldo', 'Qty', 'Quantidade'];

export default function ImportBatchModal({ onClose, storeId, onImported }: Props) {
  const { store } = useApp();
  const effectiveStoreId = storeId ?? store?.id ?? null;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<RowObj[] | null>(null);
  const [delimiter, setDelimiter] = useState<',' | ';' | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    stockUpserts: number;
    errors: string[];
  } | null>(null);
  const [alsoStock, setAlsoStock] = useState<boolean>(!!effectiveStoreId);

  function reset() {
    setRows(null);
    setDelimiter(null);
    setResult(null);
    setErrors([]);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePick(f: File) {
    reset();
    setFileName(f.name);
    const txt = await f.text();

    // remove linha "sep=;" (Excel) se existir
    const clean = txt.replace(/^sep=;[^\n\r]*[\n\r]+/i, '');
    const firstLine = clean.split(/\r?\n/)[0] || '';
    const delim: ';' | ',' = firstLine.includes(';') ? ';' : ',';
    setDelimiter(delim);

    const parsed = parseCSV(clean, delim);
    if (!parsed.length) {
      setErrors(['Arquivo vazio ou inválido.']);
      return;
    }

    const header = parsed[0];
    const data = parsed.slice(1).filter(r => r.some(v => v && v.trim() !== ''));
    const objs = data.map(arr => {
      const o: RowObj = {};
      header.forEach((h, i) => { o[h] = arr[i]?.trim(); });
      return o;
    });

    const missing = REQUIRED_COLS.filter(c => !header.includes(c));
    if (missing.length) {
      setErrors([`Faltam colunas obrigatórias: ${missing.join(', ')}`]);
      setRows(null);
      return;
    }

    setRows(objs);
  }

  const preview = useMemo(() => rows?.slice(0, 10) || [], [rows]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    let semSKU = 0, semNome = 0, precoZero = 0;
    rows.forEach(r => {
      const sku = (r['CodigoNFe'] || '').trim();
      const nome = (r['Nome'] || '').trim();
      const precoTxt = (r['ValorPrecoFixado'] || '').trim();
      if (!sku) semSKU++;
      if (!nome) semNome++;
      const preco = parseNumberBR(precoTxt);
      if (!preco || preco <= 0) precoZero++;
    });
    return { total, semSKU, semNome, precoZero };
  }, [rows]);

  async function runImport() {
    try {
      if (!rows || !rows.length) {
        setErrors(['Selecione um arquivo primeiro.']);
        return;
      }

      setLoading(true);
      setResult(null);
      setErrors([]);

      // Parse estruturado
      const parsed = rows.map(r => mapRowToProduct(r));
      const valid = parsed.filter(p => p.sku && p.nome);

      // Lotes para buscar existentes por SKU e barcode
      const skus = Array.from(new Set(valid.map(v => v.sku).filter(Boolean)));
      const barcodes = Array.from(new Set(valid.map(v => v.barcode || '').filter(Boolean)));

      const existingBySku = new Map<string, { id: string; sku: string; barcode: string | null }>();
      const existingByBarcode = new Map<string, { id: string; sku: string; barcode: string | null }>();

      if (skus.length > 0) {
        const { data, error } = await supabase.from('products')
          .select('id, sku, barcode')
          .in('sku', skus);
        if (error) throw error;
        (data || []).forEach((p: any) => existingBySku.set(p.sku, p));
      }
      if (barcodes.length > 0) {
        const { data, error } = await supabase.from('products')
          .select('id, sku, barcode')
          .in('barcode', barcodes);
        if (error) throw error;
        (data || []).forEach((p: any) => { if (p.barcode) existingByBarcode.set(p.barcode, p); });
      }

      let created = 0, updated = 0, stockUpserts = 0;
      const errs: string[] = [];

      for (const p of valid) {
        try {
          const found = existingBySku.get(p.sku) || (p.barcode ? existingByBarcode.get(p.barcode) : undefined);

          // Campos base do produto (catálogo GLOBAL)
          const base: any = {
            sku: p.sku,
            nome: p.nome,
            preco: p.preco ?? 0,
            custo: p.custo ?? null,
            barcode: p.barcode ?? null,
            ncm: p.ncm ?? null,
            cfop: p.cfop ?? null,
            cest: p.cest ?? null,
            unidade: p.unidade ?? null,
            origem: p.origem ?? null,
            grupo_trib: p.grupo_trib ?? null,
            marca: p.marca ?? null,
            categoria: p.categoria ?? null,
            ativo: true,
          };

          let productId: string;

          if (found) {
            // UPDATE
            const { data, error } = await supabase
              .from('products')
              .update(base)
              .eq('id', found.id)
              .select('id')
              .maybeSingle();
            if (error) throw error;
            productId = data?.id || found.id;
            updated++;
          } else {
            // INSERT
            const { data, error } = await supabase
              .from('products')
              .insert(base)
              .select('id, sku, barcode')
              .maybeSingle();
            if (error) throw error;
            productId = data!.id;
            created++;

            // Alimenta caches locais para próximos matches
            existingBySku.set(base.sku, { id: productId, sku: base.sku, barcode: base.barcode });
            if (base.barcode) existingByBarcode.set(base.barcode, { id: productId, sku: base.sku, barcode: base.barcode });
          }

          // Estoque por LOJA (opcional)
          if (alsoStock && effectiveStoreId && p.estoque != null) {
            await upsertStock(effectiveStoreId, productId, Number(p.estoque) || 0);
            stockUpserts++;
          }
        } catch (e: any) {
          console.error(e);
          errs.push(`SKU ${p.sku}: ${e?.message || 'erro'}`);
        }
      }

      const finalStats = { total: valid.length, created, updated, stockUpserts, errors: errs };
      setResult(finalStats);
      if (onImported) onImported(finalStats);
      alert('Importação finalizada.');
    } catch (e: any) {
      setErrors([e?.message || 'Falha ao importar.']);
    } finally {
      setLoading(false);
    }
  }

  const storeBadge = useMemo(() => {
    if (!effectiveStoreId) return 'Sem loja';
    return `${String(effectiveStoreId).slice(0, 8)}…`;
  }, [effectiveStoreId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header sticky */}
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-lg font-semibold">Importar produtos (catálogo global)</div>
          <button onClick={onClose} className="text-zinc-500">fechar</button>
        </div>

        <Card title="Contexto">
          <div className="text-sm space-y-1">
            <div><b>Loja atual (para estoque):</b> {storeBadge}</div>
            <div className="text-xs text-zinc-500">
              Os produtos serão importados para o <b>catálogo global</b>. Se desejar, marque abaixo para registrar <b>estoque</b> na loja selecionada.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="alsoStock"
                type="checkbox"
                className="h-4 w-4"
                disabled={!effectiveStoreId}
                checked={alsoStock}
                onChange={() => setAlsoStock(v => !v)}
              />
              <label htmlFor="alsoStock" className="text-sm">
                Registrar estoque na loja atual
                {!effectiveStoreId && <span className="text-zinc-500"> (selecione uma loja para habilitar)</span>}
              </label>
            </div>
          </div>
        </Card>

        <Card title="Arquivo CSV">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={e => e.target.files?.[0] && handlePick(e.target.files[0])}
          />
          {fileName && <div className="text-xs text-zinc-500 mt-2">Arquivo: {fileName}</div>}
          <div className="text-xs text-zinc-500 mt-1">
            Aceita separador <b>;</b> ou <b>,</b> — colunas obrigatórias: {REQUIRED_COLS.join(', ')}.
            {` `}Se existir coluna de estoque, use <i>{STOCK_ALIASES.join(', ')}</i>.
          </div>
        </Card>

        {rows && (
          <>
            <Card title="Pré-validação">
              <div className="text-sm">
                <div>Total de linhas: <b>{rows.length}</b></div>
                {stats && (
                  <>
                    <div>Sem SKU: <b>{stats.semSKU}</b> · Sem Nome: <b>{stats.semNome}</b> · Preço ≤ 0: <b>{stats.precoZero}</b></div>
                    {stats.precoZero > 0 && (
                      <div className="text-amber-700 text-xs mt-1">
                        Itens com preço ≤ 0 serão importados, porém marcados como <b>sem preço</b>.
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            <Card title="Prévia (10 primeiras linhas)">
              <div className="overflow-auto max-h-60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500">
                      {REQUIRED_COLS.map(c => <th key={c} className="py-1 pr-4">{c}</th>)}
                      {STOCK_ALIASES.map(a => <th key={a} className="py-1 pr-4">{a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t">
                        {REQUIRED_COLS.map(c => <td key={c} className="py-1 pr-4">{r[c] || ''}</td>)}
                        {STOCK_ALIASES.map(a => <td key={a} className="py-1 pr-4">{r[a] || ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {!!errors.length && (
          <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
            {errors.map((e,i) => <div key={i}>• {e}</div>)}
          </div>
        )}

        {result && (
          <Card title="Resultado">
            <div className="text-sm">
              Total: <b>{result.total}</b> · Inseridos: <b>{result.created}</b> · Atualizados: <b>{result.updated}</b> · Estoque registrado: <b>{result.stockUpserts}</b>
              {result.errors.length > 0 && (
                <div className="mt-2 text-xs text-amber-700 space-y-1">
                  {result.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                  {result.errors.length > 5 && <div>… e mais {result.errors.length - 5} erros.</div>}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-white pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onClose}>Fechar</Button>
            <Button className="bg-zinc-800" onClick={runImport} disabled={!rows || loading}>
              {loading ? 'Importando…' : 'Importar agora'}
            </Button>
          </div>
          <div className="text-[10px] text-zinc-400 text-right mt-1">Delimitador: {delimiter || '—'}</div>
        </div>
      </div>
    </div>
  );
}

/* ======================== Helpers ======================== */

function parseNumberBR(v?: string): number | undefined {
  if (!v) return undefined;
  // Ex.: 1.234,56 -> 1234.56
  const s = v.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function mapRowToProduct(r: RowObj) {
  // Campos obrigatórios/origem
  const sku = (r['CodigoNFe'] || '').trim();
  const nome = (r['Nome'] || '').trim();
  const barcode = (r['EAN (Codigo Barras)'] || '')?.trim() || null;
  const preco = parseNumberBR((r['ValorPrecoFixado'] || '').trim());
  const custo = parseNumberBR((r['PrecoCusto'] || '').trim());

  // Fiscais / extras
  const ncm = (r['NCM'] || '')?.trim() || null;
  const cfop = (r['CFOP'] || '')?.trim() || null;
  const cest = (r['CEST'] || '')?.trim() || null;
  const unidade = (r['UnidadeComercial'] || '')?.trim() || null;
  const origem = (r['OrigemMercadoria'] || '')?.trim() || null;
  const grupo_trib = (r['GrupoTributario'] || '')?.trim() || null;
  const marca = (r['Marca'] || '')?.trim() || null;
  const categoria = (r['Categoria'] || '')?.trim() || null;

  // Estoque (se coluna existir)
  const estoqueCol = STOCK_ALIASES.find(a => r[a] != null && String(r[a]).trim() !== '');
  const estoque = estoqueCol ? (parseNumberBR(String(r[estoqueCol])) ?? 0) : undefined;

  return { sku, nome, barcode, preco, custo, ncm, cfop, cest, unidade, origem, grupo_trib, marca, categoria, estoque };
}

async function upsertStock(storeId: string, productId: string, qty: number) {
  // tenta update; se não houver linha, insere
  const { data, error } = await supabase
    .from('product_stock')
    .update({ qty })
    .eq('store_id', storeId)
    .eq('product_id', productId)
    .select('product_id');

  if (error) throw error;

  if (!data || data.length === 0) {
    const { error: e2 } = await supabase
      .from('product_stock')
      .insert({ store_id: storeId, product_id: productId, qty });
    if (e2) throw e2;
  }
}

/** Parser CSV simples (suporta ; ou , e aspas) */
function parseCSV(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') { field += '"'; i++; } // escape ""
        else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }

    if (ch === delimiter) {
      cur.push(field); field = ''; continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++; // CRLF
      cur.push(field); field = '';
      if (cur.length) rows.push(cur);
      cur = [];
      continue;
    }

    field += ch;
  }

  // último campo
  cur.push(field);
  if (cur.length && !(cur.length === 1 && cur[0] === '')) rows.push(cur);

  // remove linhas totalmente vazias
  return rows.filter(r => r.some(v => v && v.trim() !== ''));
}
