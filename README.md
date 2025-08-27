
# PDV Santê — MVP (React + Vite + Tailwind + Supabase)

Mobile-first, PWA, pronto para integrar NFC-e via provedor (adapter incluso - stub).

## Rodando
1) **Clone** e instale:
```bash
npm i
```

2) **Ambientação**: copie `.env.example` para `.env` e preencha:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_FISCAL_PROVIDER=focusnfe
VITE_FISCAL_API_KEY=
VITE_FISCAL_ENV=homologacao
```

3) **Dev**:
```bash
npm run dev
```

## Estrutura
- `src/pages/*` Telas: Sell (PDV), Cash, Products, Reports, Settings, SelectStore.
- `src/state/store.ts` (Zustand) — estado global do carrinho/produtos.
- `src/domain/services/FiscalService.ts` interface; `adapters/FocusNFeAdapter.ts` (mock).
- `src/lib/idb.ts` fila offline (IndexedDB); `src/lib/sw.ts` service worker.
- `src/lib/supabaseClient.ts` conexão (ajuste credenciais no .env).

## Nota Fiscal (MVP)
O adapter fiscal está **mockado** para não travar o fluxo. Troque o mock pela chamada real do seu provedor (FocusNFe/eNotas/TecnoSpeed/etc.) no arquivo:
`src/domain/services/adapters/FocusNFeAdapter.ts`.

## Impressão / DANFE
- Cupom/DANFE: no MVP sugerimos abrir a `danfe_url` retornada pelo provedor e imprimir do próprio navegador.
- Para impressoras térmicas Bluetooth, use WebBluetooth/WebUSB (fase 1.5).

## PWA / Offline
- `public/sw.js`: cache básico do shell. Registre em `src/lib/sw.ts` (opcional).
- `src/lib/idb.ts`: fila de eventos offline para vender mesmo sem internet.

## Próximos Passos
- Conectar Supabase com tabelas reais (RLS).
- Substituir mock fiscal por REST do provedor em produção.
- Estoque e fechamento de caixa persistidos.
