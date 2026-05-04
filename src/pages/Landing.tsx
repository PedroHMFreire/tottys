import { Link } from 'react-router-dom'
import {
  ShoppingBag, Warehouse, CreditCard, Star, TrendingUp,
  BarChart3, CheckCircle2, ArrowRight, Zap, Shield, Building2,
  ChevronDown, Users, FileText,
} from 'lucide-react'

/* ─── Dados ─── */

const FEATURES = [
  {
    Icon: ShoppingBag,
    title: 'PDV completo',
    desc: 'Venda com agilidade: código de barras, pagamento misto, desconto, troco e cupom fiscal na mesma tela.',
  },
  {
    Icon: Warehouse,
    title: 'Estoque com grade',
    desc: 'Controle por cor, tamanho e referência. Baixa automática a cada venda, alertas de reposição.',
  },
  {
    Icon: CreditCard,
    title: 'Crediário integrado',
    desc: 'Venda a prazo sem maquininha. Parcele, cobre e acompanhe os vencimentos direto no sistema.',
  },
  {
    Icon: Star,
    title: 'Programa de cashback',
    desc: 'Fidelize clientes com cashback automático. Saldo acumulado disponível no próximo pagamento.',
  },
  {
    Icon: TrendingUp,
    title: 'Insights de estoque',
    desc: 'Identifique encalhes, peças mais vendidas e sugestões de reposição com dados reais da sua loja.',
  },
  {
    Icon: BarChart3,
    title: 'Financeiro e DRE',
    desc: 'DRE mensal automático, fluxo de caixa projetado, contas a pagar e alertas de inadimplência.',
  },
]

const PLANS = [
  {
    key: 'LOJA',
    Icon: Zap,
    name: 'Plano Loja',
    price: 129,
    desc: 'Para lojas que precisam de PDV, estoque e clientes.',
    features: ['PDV completo', 'Controle de caixa', 'Estoque com grade', 'Cadastro de clientes', 'Coleções e promoções'],
    recommended: false,
  },
  {
    key: 'GESTAO',
    Icon: Shield,
    name: 'Plano Gestão',
    price: 249,
    desc: 'Para lojas que querem crescer com crediário e dados.',
    features: ['Tudo do Loja', 'Crediário integrado', 'Programa de cashback', 'Financeiro e DRE', 'Insights e alertas', 'Multi-usuário'],
    recommended: true,
  },
  {
    key: 'REDE',
    Icon: Building2,
    name: 'Plano Rede',
    price: 399,
    desc: 'Para redes com múltiplas lojas e gestão centralizada.',
    features: ['Tudo do Gestão', 'Retaguarda multi-lojas', 'Auditoria de estoque', 'Catálogo digital', 'Relatórios por rede'],
    recommended: false,
  },
]

const FAQS = [
  {
    q: 'Preciso de cartão de crédito para começar?',
    a: 'Não. O teste gratuito de 14 dias não exige cartão. Você assina apenas se quiser continuar.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim. Sem fidelidade, sem multa. Cancele pelo próprio sistema com um clique.',
  },
  {
    q: 'Funciona no celular e tablet?',
    a: 'Sim. O sistema é responsivo e funciona em qualquer dispositivo com navegador.',
  },
  {
    q: 'Como funciona a nota fiscal (NFC-e)?',
    a: 'Você cadastra seu provedor fiscal (FocusNFe ou eNotas) e emite NFC-e diretamente pelo PDV. Testamos em homologação antes de ir para produção.',
  },
  {
    q: 'Consigo migrar meus produtos e clientes?',
    a: 'Sim. O onboarding aceita importação via planilha CSV para produtos, clientes e crediário de uma vez.',
  },
  {
    q: 'Funciona para redes com várias lojas?',
    a: 'Sim, o Plano Rede permite cadastrar múltiplas lojas e acompanhar cada uma separadamente na retaguarda.',
  },
]

/* ─── Componentes ─── */

function NavBar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="font-display text-[1.15rem] font-semibold text-navy tracking-tight select-none">
          Tottys
        </span>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-500">
          <a href="#funcionalidades" className="hover:text-slate-800 transition-colors">Funcionalidades</a>
          <a href="#planos" className="hover:text-slate-800 transition-colors">Planos</a>
          <a href="#faq" className="hover:text-slate-800 transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5"
          >
            Entrar
          </Link>
          <Link
            to="/login?modo=signup"
            className="text-sm bg-navy text-white hover:bg-slate-700 transition-colors px-4 py-1.5 rounded-xl font-medium"
          >
            Teste grátis
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-indigo-100">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          14 dias grátis · sem cartão · cancele quando quiser
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-navy leading-tight tracking-tight mb-5">
          O sistema de gestão<br className="hidden sm:block" />
          feito para o{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-600">
            varejo de moda
          </span>
        </h1>

        <p className="text-lg text-slate-500 max-w-xl mx-auto mb-8 leading-relaxed">
          PDV, estoque com grade, crediário, cashback e financeiro em uma plataforma só.
          Do caixa ao relatório, tudo integrado.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/login?modo=signup"
            className="inline-flex items-center justify-center gap-2 bg-navy text-white hover:bg-slate-700 transition-colors px-7 py-3.5 rounded-2xl text-sm font-semibold shadow-sm"
          >
            Começar gratuitamente
            <ArrowRight size={15} />
          </Link>
          <a
            href="#planos"
            className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors px-7 py-3.5 rounded-2xl text-sm font-semibold"
          >
            Ver planos e preços
          </a>
        </div>
      </div>

      {/* App screenshot placeholder */}
      <div className="mt-16 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-xl overflow-hidden">
          <div className="h-8 bg-slate-100 flex items-center px-4 gap-1.5 border-b border-slate-200">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <div className="flex-1 mx-4 h-4 bg-white rounded border border-slate-200" />
          </div>
          <div className="p-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Vendas hoje', value: 'R$ 3.240', color: 'text-emerald-600' },
              { label: 'Ticket médio', value: 'R$ 162', color: 'text-blue-600' },
              { label: 'Itens vendidos', value: '58 pçs', color: 'text-violet-600' },
              { label: 'Em estoque', value: '1.847 pçs', color: 'text-slate-700' },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 text-left shadow-sm">
                <div className="text-xs text-slate-400 mb-1">{kpi.label}</div>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>
          <div className="px-8 pb-8">
            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Últimas vendas</span>
                <span className="text-xs text-slate-400">hoje</span>
              </div>
              {[
                { cliente: 'Maria Silva', valor: 'R$ 289,00', meio: 'Cartão', status: 'Autorizada' },
                { cliente: 'Fernanda Costa', valor: 'R$ 180,00', meio: 'PIX', status: 'Pago' },
                { cliente: 'Ana Souza', valor: 'R$ 420,00', meio: 'Crediário', status: '3× R$ 140' },
              ].map((v, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{v.cliente}</div>
                    <div className="text-xs text-slate-400">{v.meio} · {v.status}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{v.valor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="funcionalidades" className="py-20 px-4 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-navy mb-3">Tudo que sua loja precisa</h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Cada funcionalidade foi desenhada para o fluxo real do varejo de moda — do provador ao fechamento do caixa.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center mb-4">
                <Icon size={18} className="text-navy" />
              </div>
              <h3 className="text-sm font-bold text-navy mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SocialProof() {
  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: '14 dias', label: 'de teste gratuito' },
            { value: 'Multi-loja', label: 'gerenciamento centralizado' },
            { value: 'NFC-e', label: 'nota fiscal integrada' },
            { value: '100%', label: 'baseado em nuvem' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl font-extrabold text-navy mb-1">{s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="planos" className="py-20 px-4 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-navy mb-3">Planos e preços</h2>
          <p className="text-slate-500">Comece com 14 dias grátis no Plano Gestão. Sem cartão de crédito.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {PLANS.map(({ Icon, name, price, desc, features, recommended }) => (
            <div
              key={name}
              className={`relative rounded-2xl border bg-white p-6 flex flex-col gap-5 shadow-sm ${
                recommended
                  ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-md'
                  : 'border-slate-200'
              }`}
            >
              {recommended && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase">
                  Mais popular
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={15} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">{name}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-extrabold text-navy">R$ {price}</span>
                  <span className="text-sm text-slate-400">/mês</span>
                </div>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/login?modo=signup"
                className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors ${
                  recommended
                    ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                    : 'bg-navy hover:bg-slate-700 text-white'
                }`}
              >
                Testar grátis por 14 dias
                <ArrowRight size={13} />
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Todos os planos incluem: suporte por e-mail, atualizações automáticas e acesso ilimitado de dispositivos.
        </p>
      </div>
    </section>
  )
}

function FAQ() {
  return (
    <section id="faq" className="py-20 px-4 bg-white">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-navy mb-3">Perguntas frequentes</h2>
        </div>

        <div className="divide-y divide-slate-100">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <span className="text-sm font-semibold text-slate-800">{q}</span>
                <ChevronDown
                  size={15}
                  className="text-slate-400 shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA() {
  return (
    <section className="py-20 px-4 bg-navy">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-extrabold text-white mb-4">
          Pronto para modernizar sua loja?
        </h2>
        <p className="text-slate-300 mb-8 text-sm leading-relaxed">
          Junte-se a lojistas que já gerenciam PDV, estoque e crediário em um só lugar.
          Comece hoje, sem compromisso.
        </p>
        <Link
          to="/login?modo=signup"
          className="inline-flex items-center gap-2 bg-white text-navy hover:bg-slate-100 transition-colors px-8 py-3.5 rounded-2xl text-sm font-bold shadow"
        >
          Criar conta gratuita
          <ArrowRight size={15} />
        </Link>
        <p className="mt-4 text-xs text-slate-400">14 dias grátis · sem cartão · cancele quando quiser</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-display text-white font-semibold tracking-tight">Tottys</span>
          <span className="text-slate-600">·</span>
          <span className="text-xs">Sistema de gestão para varejo de moda</span>
        </div>
        <div className="flex items-center gap-5 text-xs">
          <Link to="/login" className="hover:text-white transition-colors">Entrar</Link>
          <Link to="/login?modo=signup" className="hover:text-white transition-colors">Criar conta</Link>
          <a href="mailto:suporte@tottys.com.br" className="hover:text-white transition-colors">Suporte</a>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-slate-800 text-xs text-center text-slate-600">
        © {new Date().getFullYear()} Tottys. Todos os direitos reservados.
      </div>
    </footer>
  )
}

/* ─── Página principal ─── */

export default function Landing() {
  return (
    <div className="bg-white text-navy min-h-screen">
      <NavBar />
      <Hero />
      <Features />
      <SocialProof />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  )
}
