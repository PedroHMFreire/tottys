// pages/products.tsx

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'react-router-dom';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import ImportBatchModal from '@/components/products/ImportBatchModal';
import NewProductModal from '@/components/products/NewProductModal';
import { useApp } from '@/state/store';

type Product = {
  id: string;
  nome: string;
  sku: string;
  barcode?: string;
  preco: number;
  custo?: number;
  ativo: boolean;
  ncm?: string;
  cfop?: string;
  cest?: string;
  unidade?: string;
  origem?: string;
  grupo_trib?: string;
  marca?: string;
  categoria?: string;
  companyId?: string;
}

type EditableProductRowProps = {
  product: Product;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

function EditableProductRow({ product, onUpdate, onDelete }: EditableProductRowProps) {
  const [edit, setEdit] = useState<{ [k: string]: boolean }>({});
  const [fields, setFields] = useState<Product>({ ...product });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
      onDelete(product.id);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível apagar o produto.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  function handleEdit(field: keyof Product) {
    setEdit(e => ({ ...e, [field]: true }));
  }
  function handleChange(field: keyof Product, value: any) {
    setFields(f => ({ ...f, [field]: value }));
  }
  async function handleSave(field: keyof Product) {
    setSaving(true);
    setError(null);
    try {
      if (fields[field] === product[field]) {
        setEdit(e => ({ ...e, [field]: false }));
        return;
      }
      if (field === 'nome' && (!fields.nome || fields.nome.trim().length < 2)) {
        setError('Informe um nome válido (mín. 2 letras).');
        return;
      }
      if (field === 'sku' && (!fields.sku || fields.sku.trim().length < 2)) {
        setError('Informe um SKU válido (mín. 2 caracteres).');
        return;
      }
      if (field === 'preco' && (Number(fields.preco) < 0 || Number.isNaN(Number(fields.preco)))) {
        setError('Preço inválido.');
        return;
      }
      if (field === 'barcode' && fields.barcode && fields.barcode.trim().length > 0 && fields.barcode.trim().length < 6) {
        setError('Código de barras muito curto.');
        return;
      }
      const { error } = await supabase
        .from('products')
        .update({ [field]: fields[field] })
        .eq('id', product.id);
      if (error) throw error;
      setEdit(e => ({ ...e, [field]: false }));
      onUpdate();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, field: keyof Product) {
    if (e.key === 'Enter') handleSave(field);
    if (e.key === 'Escape') setEdit(ed => ({ ...ed, [field]: false }));
  }

  return (
    <div className="flex flex-col py-2 border-b last:border-b-0">
      {/* Nome e Preço acima */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          {edit.nome ? (
            <input
              value={fields.nome}
              onChange={e => handleChange('nome', e.target.value)}
              onBlur={() => handleSave('nome')}
              onKeyDown={e => handleKeyDown(e, 'nome')}
              className="border rounded px-2 py-1 w-full"
              autoFocus
              disabled={saving}
            />
          ) : (
            <span className="font-medium cursor-pointer" onClick={() => handleEdit('nome')}>{fields.nome}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {edit.preco ? (
            <input
              type="number"
              value={fields.preco}
              onChange={e => handleChange('preco', Number(e.target.value))}
              onBlur={() => handleSave('preco')}
              onKeyDown={e => handleKeyDown(e, 'preco')}
              className="border rounded px-2 py-1 w-24"
              autoFocus
              disabled={saving}
            />
          ) : (
            <span className="text-sm font-semibold cursor-pointer" onClick={() => handleEdit('preco')}>
              R$ {Number(fields.preco).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Detalhes abaixo: Código, Código de Barras, Ativo/Inativo */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        {/* Código (SKU) + Markup */}
        <div className="flex items-center gap-2">
          {edit.sku ? (
            <input
              value={fields.sku}
              onChange={e => handleChange('sku', e.target.value)}
              onBlur={() => handleSave('sku')}
              onKeyDown={e => handleKeyDown(e, 'sku')}
              className="border rounded px-2 py-1 w-24"
              autoFocus
              disabled={saving}
            />
          ) : (
            <span className="cursor-pointer font-semibold" onClick={() => handleEdit('sku')}>CÓDIGO: {fields.sku}</span>
          )}

          {/* Markup ao lado do código */}
          {typeof fields.custo === 'number' && fields.custo > 0 && (
            <span
              className={
                'text-xs px-2 py-1 rounded ' +
                (fields.preco - fields.custo >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
              }
              title={`Markup: ${(((fields.preco - fields.custo) / fields.custo) * 100).toFixed(1)}%`}
            >
              {`Markup: ${(((fields.preco - fields.custo) / fields.custo) * 100).toFixed(1)}%`}
            </span>
          )}
        </div>

        {/* Código de Barras */}
        <div>
          {edit.barcode ? (
            <input
              value={fields.barcode || ''}
              onChange={e => handleChange('barcode', e.target.value)}
              onBlur={() => handleSave('barcode')}
              onKeyDown={e => handleKeyDown(e, 'barcode')}
              className="border rounded px-2 py-1 w-32"
              autoFocus
              disabled={saving}
            />
          ) : (
            <span className="cursor-pointer" onClick={() => handleEdit('barcode')}>
              {fields.barcode || '-'}
            </span>
          )}
        </div>

        {/* Ativo/Inativo + Botão Abrir + Apagar */}
        <div className="flex items-center gap-2">
          <select
            value={fields.ativo ? 'ativo' : 'inativo'}
            onChange={e => { handleChange('ativo', e.target.value === 'ativo'); handleSave('ativo'); }}
            className="border rounded px-2 py-1"
            disabled={saving}
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <Button className="bg-zinc-700 text-white px-3 py-1" onClick={() => setShowModal(true)}>Abrir</Button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Apagar produto"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-2 py-1 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              >
                {deleting ? '…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}

      {showModal && (
        <NewProductModal
          product={fields}
          onClose={() => { setShowModal(false); onUpdate(); }}
          companyId={product.companyId || ''}
        />
      )}
    </div>
  );
}

export default function Products() {
  const [searchParams] = useSearchParams();
  const { company, setCompany, store } = useApp();

  const [showExportMenu, setShowExportMenu] = useState(false);

  function exportProducts(type: 'xlsx') {
    const data = products.map(p => ({
      Codigo: p.sku,
      Nome: p.nome,
      Preco: p.preco,
      Custo: p.custo,
      Barcode: p.barcode,
      Ativo: p.ativo ? 'Sim' : 'Não',
      NCM: p.ncm,
      CFOP: p.cfop,
      CEST: p.cest,
      Unidade: p.unidade,
      Origem: p.origem,
      Grupo: p.grupo_trib,
      Marca: p.marca,
      Categoria: p.categoria,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'produtos.xlsx');
    setShowExportMenu(false);
  }

  const [showImport, setShowImport] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle();
        const cid = company?.id ?? prof?.company_id ?? null;
        setCompanyId(cid);
        if (!company && prof?.company_id) {
          const { data: comp } = await supabase
            .from('companies')
            .select('id, nome')
            .eq('id', prof.company_id)
            .maybeSingle();
          if (comp) setCompany(comp as any);
        }
      }
    })();
  }, [company, setCompany]);

  useEffect(() => {
    if (searchParams.get('import') === '1') {
      setShowImport(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (company?.id) setCompanyId(company.id);
  }, [company?.id]);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const catalogInsights = useMemo(() => {
    if (!products.length) {
      return {
        total: 0,
        inactive: 0,
        withoutBarcode: 0,
        negativeMargin: 0,
        lowPrice: 0,
        averagePrice: 0,
      };
    }
    const total = products.length;
    const inactive = products.filter(p => !p.ativo).length;
    const withoutBarcode = products.filter(p => !p.barcode || p.barcode.trim().length < 6).length;
    const negativeMargin = products.filter(p => typeof p.custo === 'number' && p.custo > 0 && p.preco < p.custo).length;
    const lowPrice = products.filter(p => p.preco <= 5).length;
    const averagePrice = products.reduce((acc, p) => acc + (Number(p.preco) || 0), 0) / total;
    return {
      total,
      inactive,
      withoutBarcode,
      negativeMargin,
      lowPrice,
      averagePrice,
    };
  }, [products]);

  async function search() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const term = q.trim();
      let query = supabase
        .from('products')
        .select('id, sku, nome, barcode, preco, custo, ativo, ncm, cfop, cest, unidade, origem, grupo_trib, marca, categoria')
        .eq('company_id', companyId)
        .order('nome', { ascending: true })
        .limit(100);

      if (term) {
        // @ts-ignore
        query = query.or(`sku.ilike.%${term}%,nome.ilike.%${term}%,barcode.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setProducts(data || []);
      if (!data || data.length === 0) setError('Nenhum produto encontrado.');
    } catch (e: any) {
      setError(e?.message || 'Falha ao buscar produtos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;
    search();
    // eslint-disable-next-line
  }, [companyId]);

  return (
    <div className="pb-8 max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-navy">Produtos</h1>
          <p className="text-xs text-slate-400 mt-0.5">Gerencie o catálogo da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExportMenu(v => !v)}
            >
              Exportar
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 z-10 bg-white border border-slate-200 rounded-xl shadow-md text-sm min-w-[130px]">
                <button
                  className="block px-4 py-2.5 w-full text-left hover:bg-slate-50 text-slate-700 text-xs rounded-xl cursor-pointer"
                  onClick={() => exportProducts('xlsx')}
                >
                  Baixar Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            Importar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            + Novo produto
          </Button>
        </div>
      </div>

      {/* ...Atalhos removidos... */}

      <Card title="Saúde do Catálogo">
        {catalogInsights.total === 0 ? (
          <div className="text-sm text-zinc-500">Nenhum produto carregado ainda.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Produtos</div>
              <div className="text-lg font-semibold">{catalogInsights.total}</div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Preço médio</div>
              <div className="text-lg font-semibold">R$ {catalogInsights.averagePrice.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Sem EAN</div>
              <div className={catalogInsights.withoutBarcode > 0 ? 'text-lg font-semibold text-amber-700' : 'text-lg font-semibold'}>
                {catalogInsights.withoutBarcode}
              </div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Inativos</div>
              <div className={catalogInsights.inactive > 0 ? 'text-lg font-semibold text-amber-700' : 'text-lg font-semibold'}>
                {catalogInsights.inactive}
              </div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Margem negativa</div>
              <div className={catalogInsights.negativeMargin > 0 ? 'text-lg font-semibold text-rose-700' : 'text-lg font-semibold'}>
                {catalogInsights.negativeMargin}
              </div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-xs text-zinc-500">Preço &le; R$ 5</div>
              <div className={catalogInsights.lowPrice > 0 ? 'text-lg font-semibold text-amber-700' : 'text-lg font-semibold'}>
                {catalogInsights.lowPrice}
              </div>
            </div>
          </div>
        )}
        {catalogInsights.total > 0 && (
          <div className="mt-3 text-xs text-zinc-500">
            Dica rápida: priorize corrigir itens com margem negativa e completar o EAN para agilizar o PDV.
          </div>
        )}
      </Card>

      <Card title="Catálogo">
        <div className="mb-3 flex gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors"
            placeholder="Buscar por SKU, nome ou EAN…"
            autoComplete="off"
          />
          <Button size="sm" onClick={search} disabled={loading || !companyId}>
            {loading ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-700 px-3 py-2 text-xs mb-3">
            {error}
          </div>
        )}

        <div className="max-h-[28rem] overflow-auto">
          {products.length === 0 && !loading && !error && (
            <div className="text-sm text-slate-400 py-4 text-center">Nenhum produto cadastrado.</div>
          )}
          {products.map(prod => (
            <EditableProductRow
              key={prod.id}
              product={prod}
              onUpdate={search}
              onDelete={id => setProducts(prev => prev.filter(p => p.id !== id))}
            />
          ))}
        </div>
      </Card>

      {/* Modais */}
      {showImport && (
        <ImportBatchModal onClose={() => setShowImport(false)} />
      )}

      {showNew && (
        <NewProductModal
          onClose={() => setShowNew(false)}
          companyId={companyId || ''}
          storeId={store?.id ?? null}
        />
      )}
    </div>
  );
}
