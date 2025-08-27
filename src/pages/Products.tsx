// pages/products.tsx

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'react-router-dom';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import ImportBatchModal from '@/components/products/ImportBatchModal';
import NewProductModal from '@/components/products/NewProductModal';

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
}

function EditableProductRow({ product, onUpdate }: EditableProductRowProps) {
  const [edit, setEdit] = useState<{ [k: string]: boolean }>({});
  const [fields, setFields] = useState<Product>({ ...product });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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

        {/* Ativo/Inativo + Botão Abrir */}
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
        </div>
      </div>

      {error && <div className="text-xs text-amber-700 mt-1">{error}</div>}

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
        setCompanyId(prof?.company_id ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get('import') === '1') {
      setShowImport(true);
    }
  }, [searchParams]);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produtos</h1>
      </div>

      <div className="rounded-2xl border bg-white p-3">
        <div className="text-sm font-semibold mb-2">Ações</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Button onClick={() => setShowImport(true)}>Importar em Lote</Button>
          <Button className="bg-zinc-800" onClick={() => setShowNew(true)}>Cadastrar Novo</Button>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Button
              className="bg-zinc-800 text-white"
              onClick={() => setShowExportMenu(v => !v)}
            >
              Baixar Produtos
            </Button>
            {showExportMenu && (
              <div className="absolute left-0 mt-2 z-10 bg-white border rounded shadow text-sm">
                <button
                  className="block px-4 py-2 w-full text-left hover:bg-zinc-100"
                  onClick={() => exportProducts('xlsx')}
                >
                  Baixar Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ...Atalhos removidos... */}

      <Card title="Catálogo">
        <div className="mb-2 flex gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="rounded-2xl border px-3 py-2 w-full"
            placeholder="SKU, Nome ou EAN"
            autoComplete="off"
          />
          <Button onClick={search} disabled={loading || !companyId}>
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>

        {error && <div className="text-xs text-amber-700 mb-2">{error}</div>}

        <div className="max-h-96 overflow-auto">
          {products.length === 0 && !loading && !error && (
            <div className="text-sm text-zinc-500">Nenhum produto cadastrado.</div>
          )}
          {products.map(prod => (
            <EditableProductRow key={prod.id} product={prod} onUpdate={search} />
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
        />
      )}
    </div>
  );
}
