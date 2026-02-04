// src/pages/Sell.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/state/store';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import KPI from '@/ui/KPI';
import TabBar from '@/ui/TabBar';
import PayModal from '@/components/PayModal';
import Toast, { type ToastItem } from '@/ui/Toast';
import { usePaymentRules } from '@/hooks/usePayment';
import { savePayment } from '@/domain/services/PaymentService';
import { createSaleWithItems } from '@/domain/services/SaleService';
import { formatBRL } from '@/lib/currency';
import { logActivity } from '@/lib/activity';

type Product = { id: string; sku: string; nome: string; barcode?: string | null; preco: number };

type CartItem = {
  product_id: string | null;
  sku: string;
  nome: string;
  preco: number;
  qtde: number;
  origin: 'CATALOGO' | 'MOCK';
};

declare global {
  interface Window { BarcodeDetector?: any }
}

/* ===================== Utils ===================== */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightTerm(text: string, term: string) {
  if (!term) return text;
  const safe = escapeRegExp(term);
  const re = new RegExp(`(${safe})`, 'ig');
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? <span key={i} className="bg-yellow-200">{part}</span> : part
  );
}
function isUUID(id?: string | null): boolean {
  return !!id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id);
}

/** Estoque por LOJA (tenta product_stock; fallback p/ products.estoque; se não achar → Infinity) */
async function getStoreStock(productId: string, storeId?: string | null): Promise<number> {
  try {
    if (storeId) {
      let q1 = await supabase.from('product_stock')
        .select('qty').eq('store_id', storeId).eq('product_id', productId).maybeSingle();
      if (!q1.error && q1.data && typeof q1.data.qty === 'number') return q1.data.qty as number;

      let q2 = await supabase.from('product_stock')
        .select('estoque').eq('store_id', storeId).eq('product_id', productId).maybeSingle();
      if (!q2.error && q2.data && typeof q2.data.estoque === 'number') return q2.data.estoque as number;
    }
  } catch {}
  try {
    const { data } = await supabase.from('products').select('estoque').eq('id', productId).maybeSingle();
    if (data && typeof data.estoque === 'number') return data.estoque as number;
  } catch {}
  return Infinity;
}

/* ===================== Página ===================== */
export default function Sell() {
  const navigate = useNavigate();
  const app = useApp() as any;
  const store = app?.store || null;
  const company = app?.company || null;
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function pushToast(kind: ToastItem['kind'], message: string) {
    setToasts(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, kind, message }])
  }

  /* -------- Dropdown minimalista de lojas (AGORA DENTRO DO COMPONENTE) -------- */
  const [showDropdown, setShowDropdown] = useState(false);
  const [storeList, setStoreList] = useState<Array<{ id: string; nome: string }>>([]);
  useEffect(() => {
    if (!showDropdown) return;
    let active = true;
    (async () => {
      if (!company?.id) {
        if (active) setStoreList([]);
        return;
      }
      let query = supabase
        .from('stores')
        .select('id, nome')
        .eq('company_id', company.id)
        .order('nome', { ascending: true });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: us } = await supabase
            .from('user_stores')
            .select('store_id')
            .eq('user_id', user.id);
          const ids = (us || []).map((r: any) => r.store_id);
          if (ids.length > 0) query = query.in('id', ids);
        }
      } catch {
        // ignora se user_stores não existir
      }
      const { data, error } = await query;
      if (!error && data && active) setStoreList(data);
    })();
    return () => { active = false; };
  }, [showDropdown, company?.id]);

  /* -------- Banner do CAIXA (status) -------- */
  const [caixaAberto, setCaixaAberto] = useState(false);
  const demoKey = useMemo(() => `pdv_demo_cash_${store?.id || 'sem_loja'}`, [store?.id]);
  useEffect(() => {
    let mounted = true;
    async function checkCash() {
      if (!store) { if (mounted) setCaixaAberto(false); return; }
      let opened = false;
      if (isUUID(store.id)) {
        try {
          const { data, error } = await supabase.rpc('get_open_cash', { p_store_id: store.id });
          const row = error ? null : (Array.isArray(data) ? data[0] : data);
          opened = !!row && row.status === 'ABERTO';
        } catch { opened = false; }
      } else {
        const saved = localStorage.getItem(demoKey);
        const row = saved ? JSON.parse(saved) : null;
        opened = !!row && row.status === 'ABERTO';
      }
      if (mounted) setCaixaAberto(opened);
    }
    checkCash();
    return () => { mounted = false; };
  }, [store?.id, demoKey]);

  /* -------- Histórico & KPIs -------- */
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showReceipt, setShowReceipt] = useState<any | null>(null);
  const [receiptPayments, setReceiptPayments] = useState<any[]>([]);

  const [vendasHoje, setVendasHoje] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [itensVendidos, setItensVendidos] = useState(0);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      if (!store?.id) {
        setSalesHistory([]);
        setVendasHoje(0); setTicketMedio(0); setItensVendidos(0);
        return;
      }
      setLoadingHistory(true);
      try {
        const { data: sales } = await supabase
          .from('sales')
          .select('id, created_at, total, status')
          .eq('store_id', store.id)
          .order('created_at', { ascending: false })
          .limit(10);
        setSalesHistory(sales || []);

        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date();   end.setHours(23,59,59,999);
        const { data: daySales } = await supabase
          .from('sales')
          .select('id,total')
          .eq('store_id', store.id)
          .eq('status', 'PAGA')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());

        const ids = (daySales || []).map(s => s.id);
        const totalDia = (daySales || []).reduce((acc, s:any) => acc + Number(s.total || 0), 0);
        const cupons = (daySales || []).length;
        setVendasHoje(totalDia);
        setTicketMedio(cupons > 0 ? totalDia / cupons : 0);

        if (ids.length) {
          const { data: items } = await supabase
            .from('sale_items')
            .select('sale_id, qtde')
            .in('sale_id', ids);
          const itens = (items || []).reduce((acc, it:any) => acc + Number(it.qtde || 0), 0);
          setItensVendidos(itens);
        } else {
          setItensVendidos(0);
        }
      } finally {
        setLoadingHistory(false);
      }
    }
    load();
  }, [store?.id]);

  useEffect(() => {
    const hints: string[] = [];
    if (cart.length >= 5) {
      hints.push('Carrinho com muitos itens: confirme se as quantidades estão corretas.')
    }
    if (total > 1000) {
      hints.push('Venda alta: confirme o pagamento e a forma escolhida.')
    }
    const noStock = cart.some(i => i.origin === 'CATALOGO' && i.qtde > 0 && i.preco <= 0);
    if (noStock) {
      hints.push('Há itens com preço zerado. Revise antes de finalizar.')
    }
    const onlyOneItem = cart.length === 1 && cart[0].qtde === 1;
    if (onlyOneItem && total < 10) {
      hints.push('Venda de baixo valor: ofereça um item complementar.')
    }
    setInsights(hints);
  }, [cart, total]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!showReceipt?.id) { setReceiptPayments([]); return; }
      try {
        const { data } = await supabase
          .from('payments')
          .select('meio, valor, bandeira, nsu')
          .eq('sale_id', showReceipt.id);
        if (mounted) setReceiptPayments(data || []);
      } catch {
        if (mounted) setReceiptPayments([]);
      }
    })();
    return () => { mounted = false; };
  }, [showReceipt?.id]);

  /* -------- Pagamento -------- */
  const [showPay, setShowPay] = useState(false);
  const [payKey, setPayKey] = useState(0);
  const [pendingPays, setPendingPays] = useState<Array<{
    meio: 'DINHEIRO' | 'PIX' | 'CARTAO'
    brand?: string | null
    mode?: 'DEBITO' | 'CREDITO' | 'CREDITO_PARC' | 'CREDITO_VISTA'
    installments?: number | null
    installment_value?: number | null
    mdr_pct?: number | null
    fee_fixed?: number | null
    fee_total?: number | null
    interest_pct_monthly?: number | null
    interest_total?: number | null
    gross?: number | null
    net?: number | null
  }>>([]);
  const { rules, loading: loadingRules, error: rulesError } =
    usePaymentRules(undefined, store?.company_id ?? undefined);

  /* -------- Busca (CATÁLOGO GLOBAL) -------- */
  const [q, setQ] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (!q.trim()) { setSuggestions([]); setActiveSuggestion(-1); return; }
      const term = q.trim();
      const looksLikeEAN = /^[0-9]{8,14}$/.test(term);
      let query = supabase
        .from('products')
        .select('id, sku, nome, barcode, preco')
        .order('nome', { ascending: true })
        .limit(10);

      // @ts-ignore
      if (looksLikeEAN) query = query.eq('barcode', term);
      else {
        // @ts-ignore
        query = query.or(`sku.ilike.%${term}%,nome.ilike.%${term}%`);
      }

      query.then(({ data }) => {
        setSuggestions((data || []) as Product[]);
        setActiveSuggestion(-1);
      });
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [q]);

  async function search() {
    setSearchError(null);
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoadingSearch(true);
    try {
      const looksLikeEAN = /^[0-9]{8,14}$/.test(term);
      let query = supabase
        .from('products')
        .select('id, sku, nome, barcode, preco')
        .order('nome', { ascending: true })
        .limit(50);

      // @ts-ignore
      if (looksLikeEAN) query = query.eq('barcode', term);
      else {
        // @ts-ignore
        query = query.or(`sku.ilike.%${term}%,nome.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setResults((data || []) as Product[]);
      if (!data || data.length === 0) setSearchError('Nenhum produto encontrado.');
    } catch (e: any) {
      setSearchError(e?.message || 'Falha na busca.');
    } finally {
      setLoadingSearch(false);
    }
  }

  /* -------- Scanner -------- */
  const [showScanner, setShowScanner] = useState(false);

  /* -------- Carrinho -------- */
  const [cart, setCart] = useState<CartItem[]>([]);
  const total = useMemo(() => cart.reduce((acc, i) => acc + i.preco * i.qtde, 0), [cart]);

  // Trocar loja → limpa carrinho (catálogo é global)
  useEffect(() => { setCart([]); }, [store?.id]);

  async function addFromCatalog(p: Product) {
    const idx = cart.findIndex(i => i.product_id === p.id);
    if (idx >= 0) {
      const copy = [...cart];
      const nextQty = copy[idx].qtde + 1;
      if (store?.id) {
        const estoque = await getStoreStock(p.id, store.id);
        if (nextQty > estoque) { pushToast('error', 'Estoque insuficiente nesta loja.'); return; }
      }
      if (nextQty > 99) { pushToast('error', 'Quantidade máxima por item atingida.'); return; }
      copy[idx] = { ...copy[idx], qtde: nextQty };
      setCart(copy);
      return;
    }
    if (store?.id) {
      const estoque = await getStoreStock(p.id, store.id);
      if (estoque < 1) { pushToast('error', 'Produto sem estoque disponível nesta loja.'); return; }
    }
    setCart(prev => [...prev, {
      product_id: p.id,
      sku: p.sku,
      nome: p.nome,
      preco: Number(p.preco || 0),
      qtde: 1,
      origin: 'CATALOGO'
    }]);
  }
  function addMockProduct() {
    setCart(prev => {
      const i = prev.findIndex(it => it.sku === 'TT-PRE' && it.origin === 'MOCK');
      if (i >= 0) {
        if (prev[i].qtde + 1 > 99) return prev;
        const copy = [...prev]; copy[i] = { ...copy[i], qtde: copy[i].qtde + 1 }; return copy;
      }
      return [...prev, { product_id: null, sku: 'TT-PRE', nome: 'Tech T-shirt Preta', preco: 119.9, qtde: 1, origin: 'MOCK' }];
    });
  }
  const inc = (idx: number) => setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: it.qtde + 1 } : it));
  const dec = (idx: number) => setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: Math.max(1, it.qtde - 1) } : it));
  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));
  const clearCart = () => setCart([]);

  /* -------- FINALIZAR -------- */
  async function finalizePayment(pays: Array<{
    meio: 'DINHEIRO' | 'PIX' | 'CARTAO'
    brand?: string | null
    mode?: 'DEBITO' | 'CREDITO' | 'CREDITO_PARC' | 'CREDITO_VISTA'
    installments?: number | null
    installment_value?: number | null
    mdr_pct?: number | null
    fee_fixed?: number | null
    fee_total?: number | null
    interest_pct_monthly?: number | null
    interest_total?: number | null
    gross?: number | null
    net?: number | null
  }>) {
    try {
      if (!store?.id) { pushToast('error', 'Selecione a LOJA para validar estoque e finalizar.'); return; }
      if (!caixaAberto) { pushToast('error', 'Abra o caixa antes de vender.'); return; }
      if (cart.length === 0) { pushToast('error', 'Carrinho vazio.'); return; }
      for (const item of cart) {
        if (item.qtde < 1) { pushToast('error', `Quantidade inválida: ${item.nome}.`); return; }
        if (item.origin === 'CATALOGO') {
          const estoque = await getStoreStock(item.product_id as string, store.id);
          if (item.qtde > estoque) { pushToast('error', `Estoque insuficiente: ${item.nome}.`); return; }
        }
        if (item.qtde > 99) { pushToast('error', `Máximo 99 por item: ${item.nome}.`); return; }
      }

      // 1) Cria venda + itens
      const { saleId, persisted } = await createSaleWithItems({
        storeId: store.id,
        userId: undefined,
        customerId: null,
        total,
        status: 'PAGA',
        items: cart.map(i => ({
          product_id: i.product_id,
          qtde: i.qtde,
          preco_unit: i.preco,
          desconto: 0,
        })),
      });

      // 2) Pagamento + baixa estoque
      if (persisted) {
        for (const pay of pays) {
          await savePayment({
            sale_id: saleId,
            meio: pay.meio,
            brand: pay.brand,
            mode: pay.mode === 'CREDITO' ? 'CREDITO_VISTA' : pay.mode,
            installments: pay.installments,
            installment_value: pay.installment_value,
            mdr_pct: pay.mdr_pct,
            fee_fixed: pay.fee_fixed,
            fee_total: pay.fee_total,
            interest_pct_monthly: pay.interest_pct_monthly,
            interest_total: pay.interest_total,
            gross: pay.gross ?? total,
            net: pay.net ?? total,
            acquirer: pay.meio === 'CARTAO' ? 'STONE' : null,
          });
        }
        const { error: eStock } = await supabase.rpc('post_sale_stock', { p_sale_id: saleId });
        if (eStock) throw eStock;
        pushToast('success', 'Venda registrada e estoque baixado.');
        logActivity(`Venda registrada • ${formatBRL(total)} • ${cart.length} itens${store?.nome ? ` • ${store.nome}` : ''}`, 'success')
      } else {
        pushToast('info', 'Venda registrada localmente (teste). Estoque não baixado.');
        logActivity(`Venda registrada (demo) • ${formatBRL(total)} • ${cart.length} itens${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
      }
      clearCart();
      setPendingPays([]);
    } catch (e: any) {
      pushToast('error', e?.message || 'Falha ao finalizar a venda.');
    }
  }

  /* ---------------- UI ---------------- */
  return (
    <div className="pb-24 max-w-md mx-auto">
      <Toast toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
      {!company?.id && (
        <div className="p-4">
          <div className="rounded-2xl border bg-amber-50 text-amber-900 p-3 text-sm">
            Selecione uma empresa para continuar no PDV.
            <div className="mt-2">
              <Button onClick={() => navigate('/company')}>Selecionar Empresa</Button>
            </div>
          </div>
        </div>
      )}
      {/* ======= 1) Marca + Selecionar Loja ======= */}
      <header className="p-4 pb-2">
        <div className="flex items-center justify-between relative">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Anot.AI PDV</h1>
            <p className="text-zinc-500 text-sm -mt-0.5">Vendedor — tudo em um lugar</p>
          </div>

          {/* Botão + dropdown inline */}
          <button
            className="px-2 py-1 rounded bg-transparent text-sm font-medium flex items-center gap-1 hover:bg-zinc-100 focus:outline-none"
            style={{ color: store?.nome ? '#222' : '#888', border: 'none', minWidth: 120 }}
            onClick={() => setShowDropdown(v => !v)}
          >
            <span>{store?.nome && store?.nome.trim() ? store.nome : 'Selecionar loja'}</span>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#888" strokeWidth="2" d="M6 9l6 6 6-6"/></svg>
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-12 z-50 w-56 bg-white border rounded-xl shadow-lg py-1">
              {storeList.length === 0 ? (
                <div className="px-4 py-2 text-sm text-zinc-500">Carregando…</div>
              ) : (
                storeList.map(loja => (
                  <button
                    key={loja.id}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 ${store?.id === loja.id ? 'font-bold text-emerald-700' : ''}`}
                    onClick={() => {
                      setShowDropdown(false);
                      if (app && typeof app.setStore === 'function') {
                        app.setStore(loja);
                      }
                      localStorage.setItem('app_selected_store', JSON.stringify(loja));
                      if (!(app && typeof app.setStore === 'function')) {
                        window.location.reload();
                      }
                    }}
                  >
                    {loja.nome}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </header>

      {/* ======= 2) PDV COMPLETO ======= */}
      <div className="px-4 space-y-4">
        {/* Banner do caixa dentro do PDV */}
        <div className={`p-3 rounded-2xl border ${caixaAberto ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-semibold">Caixa {caixaAberto ? 'ABERTO' : 'FECHADO'}</div>
              <div className="text-zinc-500">
                {caixaAberto ? 'Pode iniciar vendas.' : 'Abra o caixa para começar a vender.'}
              </div>
            </div>
            <Link to="/cash">
              <Button className="w-auto px-4 py-2 text-sm">
                {caixaAberto ? 'Fechar Caixa' : 'Abrir Caixa'}
              </Button>
            </Link>
          </div>
        </div>

        {rulesError && (
          <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{rulesError}</div>
        )}

        {/* Busca de produtos */}
        <Card title="Adicionar itens do catálogo (SKU, Nome ou EAN)">
          <div className="grid grid-cols-1 gap-2">
            <div className="grid grid-cols-3 gap-2 relative">
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setActiveSuggestion(-1); }}
                onKeyDown={e => {
                  if (suggestions.length > 0) {
                    if (e.key === 'ArrowDown') setActiveSuggestion(a => Math.min(a + 1, suggestions.length - 1));
                    else if (e.key === 'ArrowUp') setActiveSuggestion(a => Math.max(a - 1, 0));
                    else if (e.key === 'Enter') {
                      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
                        addFromCatalog(suggestions[activeSuggestion]); setQ(''); setSuggestions([]); e.preventDefault();
                      } else {
                        search();
                      }
                    }
                  } else if (e.key === 'Enter') { search(); }
                }}
                className="col-span-3 rounded-2xl border px-3 py-2"
                placeholder="Ex.: TT-PRE ou 789..."
                autoComplete="off"
              />

              {/* Autocomplete */}
              {suggestions.length > 0 && q.trim() && (
                <div className="absolute left-0 top-full z-10 w-full bg-white border rounded-xl shadow mt-1 max-h-48 overflow-auto">
                  {suggestions.map((s, idx) => (
                    <div
                      key={s.id}
                      className={`px-3 py-2 cursor-pointer flex items-center justify-between ${activeSuggestion === idx ? 'bg-zinc-200' : 'hover:bg-zinc-100'}`}
                      onMouseDown={() => { addFromCatalog(s); setQ(''); setSuggestions([]); }}
                    >
                      <span className="font-medium truncate">{highlightTerm(s.nome, q)}</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {highlightTerm(s.sku, q)}{s.barcode ? ` · ${s.barcode}` : ''}
                      </span>
                      <span className="text-sm font-semibold ml-2">{formatBRL(s.preco || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botões (ajustados, sem dica) */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button onClick={() => setShowScanner(true)}>Escanear</Button>
              <Button onClick={search} disabled={loadingSearch}>
                {loadingSearch ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>

            {searchError && <div className="text-xs text-amber-700">{searchError}</div>}

            {/* Resultados */}
            {results.length > 0 && (
              <div className="rounded-2xl border bg-white p-2">
                <div className="max-h-56 overflow-auto">
                  {results.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.nome}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          {p.sku}{p.barcode ? ` · ${p.barcode}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">{formatBRL(p.preco || 0)}</div>
                        <Button onClick={() => addFromCatalog(p)}>Adicionar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Carrinho */}
        <Card title="Carrinho">
          <div className="space-y-2">
            {cart.length === 0 && <div className="text-sm text-zinc-500">Carrinho vazio</div>}
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.nome}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {item.sku} {item.origin === 'MOCK' ? '· (teste)' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">{formatBRL(item.preco * item.qtde)}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => dec(idx)} className="px-2.5 py-1 rounded-full border">−</button>
                    <div className="w-8 text-center">{item.qtde}</div>
                    <button onClick={() => inc(idx)} className="px-2.5 py-1 rounded-full border">+</button>
                  </div>
                  <button onClick={() => removeItem(idx)} className="px-2 py-1 rounded-full border text-xs">remover</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Total e ações */}
        <div className="flex items-center justify-between">
          <div className="text-zinc-600">Total</div>
          <div className="text-lg font-semibold">{formatBRL(total)}</div>
        </div>
        {insights.length > 0 && (
          <Card title="Sugestões">
            <div className="space-y-1 text-sm text-zinc-700">
              {insights.map((i, idx) => (
                <div key={idx}>• {i}</div>
              ))}
            </div>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-2">
          <Button
            onClick={() => {
              if (!caixaAberto) { pushToast('error', 'Abra o caixa antes de vender.'); return; }
              setPendingPays([])
              setPayKey(k => k + 1)
              setShowPay(true)
            }}
            disabled={cart.length === 0 || loadingRules || !store?.id}
            title={!store?.id ? 'Selecione a loja para pagar' : undefined}
          >
            {loadingRules ? 'Carregando formas de pagamento...' : 'Pagar'}
          </Button>
          <Button onClick={addMockProduct}>Adicionar produto teste</Button>
          <Button className="bg-zinc-800" onClick={clearCart}>Limpar Carrinho</Button>
        </div>
      </div>

      {/* ======= 3) Indicadores + Ações rápidas ======= */}
      <section className="px-4 mt-6 grid grid-cols-3 gap-2">
        <KPI label="Vendas (R$)" value={vendasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
        <KPI label="Ticket Médio" value={ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
        <KPI label="Itens" value={String(itensVendidos)} />
      </section>

      <section className="p-4 grid grid-cols-2 gap-3">
        <Link to="/reports"><Button className="h-12 text-base">Relatórios</Button></Link>
        <Link to="/products"><Button className="h-12 text-base bg-zinc-800">Estoque/Produtos</Button></Link>
        <Link to="/settings"><Button className="h-12 text-base">Configurações</Button></Link>
        <Link to="/cash"><Button className="h-12 text-base">Abrir/Fechar Caixa</Button></Link>
      </section>

      {/* ======= 4) Lista de vendas recentes ======= */}
      <div className="px-4">
        <Card title="Últimas vendas">
          {loadingHistory ? (
            <div className="text-sm text-zinc-500">Carregando…</div>
          ) : !store?.id ? (
            <div className="text-sm text-zinc-500">Selecione uma loja para ver o histórico.</div>
          ) : salesHistory.length === 0 ? (
            <div className="text-sm text-zinc-500">Nenhuma venda recente.</div>
          ) : (
            <div className="space-y-2">
              {salesHistory.map(sale => (
                <div key={sale.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                  <div>
                    <div className="font-medium">Venda #{sale.id}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(sale.created_at).toLocaleString('pt-BR')} · {formatBRL(sale.total || 0)} · {sale.status}
                    </div>
                  </div>
                  <Button onClick={() => setShowReceipt(sale)}>Ver/Imprimir</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ======= 5) Rodapé ======= */}
      <TabBar />

      {/* Modal de comprovante */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Comprovante de venda</div>
              <button onClick={() => setShowReceipt(null)} className="text-zinc-500">fechar</button>
            </div>
            <div className="text-sm">
              <div><b>ID:</b> {showReceipt.id}</div>
              <div><b>Data:</b> {new Date(showReceipt.created_at).toLocaleString('pt-BR')}</div>
              <div><b>Total:</b> {formatBRL(showReceipt.total || 0)}</div>
              <div><b>Status:</b> {showReceipt.status}</div>
              {receiptPayments.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-zinc-500 mb-1">Pagamentos</div>
                  {receiptPayments.map((p, idx) => (
                    <div key={idx} className="text-sm">
                      {p.meio} {p.bandeira ? `· ${p.bandeira}` : ''} — {formatBRL(p.valor || 0)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-zinc-800" onClick={() => window.print()}>Imprimir</Button>
              <Button onClick={() => setShowReceipt(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pagamento */}
      {showPay && (
        <PayModal
          key={payKey}
          total={Math.max(0, total - pendingPays.reduce((a, p) => a + Number(p.gross ?? p.net ?? 0), 0))}
          rules={rules}
          onClose={() => setShowPay(false)}
          onConfirm={async (pay) => {
            const next = [...pendingPays, pay]
            setPendingPays(next)
            const remaining = total - next.reduce((a, p) => a + Number(p.gross ?? p.net ?? 0), 0)
            if (remaining > 0.009) {
              setPayKey(k => k + 1)
              return
            }
            setShowPay(false)
            await finalizePayment(next)
          }}
        />
      )}

      {/* Scanner modal */}
      {showScanner && (
        <ScannerModal
          onClose={() => setShowScanner(false)}
          onCode={(code) => { setShowScanner(false); setQ(code); setTimeout(() => search(), 0); }}
        />
      )}
    </div>
  );
}

/** Modal de scanner usando BarcodeDetector (quando disponível) */
function ScannerModal({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(true);

  useEffect(() => { setSupported(!!window.BarcodeDetector); }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let detector: any = null;
    let mounted = true;

    async function start() {
      try {
        if (!window.BarcodeDetector) {
          setStarting(false);
          pushToast('info', 'Este navegador não suporta leitura nativa de código de barras. Use a busca manual.');
          return;
        }
        detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!mounted) return;
        if (videoRef.current) {
          // @ts-ignore
          (videoRef.current as any).srcObject = stream;
          await videoRef.current.play();
        }
        setStarting(false);
        tick();
      } catch {
        setStarting(false);
        pushToast('error', 'Não foi possível acessar a câmera.');
      }
    }

    async function tick() {
      if (!mounted || !videoRef.current || !detector) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const raw = codes[0].rawValue || '';
          if (raw) { stop(); onCode(String(raw)); return; }
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    }

    start();
    return () => { mounted = false; stop(); };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Escanear código de barras</div>
          <button onClick={onClose} className="text-zinc-500">fechar</button>
        </div>
        {!supported && (
          <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
            Seu navegador não suporta o leitor nativo. Use a busca manual.
          </div>
        )}
        <div className="rounded-2xl overflow-hidden border bg-black aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" />
        </div>
        <div className="text-xs text-zinc-500">
          Aponte a câmera para o EAN. {starting ? 'Iniciando câmera...' : 'Lendo...'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="bg-zinc-800" onClick={onClose}>Cancelar</Button>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
