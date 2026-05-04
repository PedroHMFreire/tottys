// Popup de celebração quando uma corridinha é concluída.
// Confetti gerado via CSS + Web Audio API para o som — sem dependências externas.
import { useEffect, useRef } from 'react'
import { Trophy, X } from 'lucide-react'
import { formatBRL } from '@/lib/currency'

export interface CelebracaoData {
  nome: string
  premio_descricao?: string | null
  bonus_valor: number
}

interface Props {
  data: CelebracaoData | null
  onClose: () => void
}

// Generates a short triumphant beep using Web Audio API
function playVictorySound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [523.25, 659.25, 783.99, 1046.50] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25)
      osc.start(start)
      osc.stop(start + 0.25)
    })
  } catch {
    // silently fail if audio is blocked
  }
}

// Creates animated confetti particles via DOM (no canvas, no lib)
function launchConfetti(container: HTMLElement) {
  const colors = ['#f59e0b', '#10b981', '#6366f1', '#ef4444', '#3b82f6', '#ec4899']
  const count  = 80

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.style.cssText = `
      position: absolute;
      width: ${Math.random() * 8 + 5}px;
      height: ${Math.random() * 8 + 5}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: ${Math.random() * 100}%;
      top: -10px;
      opacity: 1;
      animation: confetti-fall ${Math.random() * 1.5 + 1}s ease-in forwards;
      animation-delay: ${Math.random() * 0.5}s;
      transform: rotate(${Math.random() * 360}deg);
    `
    container.appendChild(el)
    setTimeout(() => el.remove(), 2500)
  }
}

export default function CelebracaoModal({ data, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!data) return
    playVictorySound()
    if (containerRef.current) launchConfetti(containerRef.current)
  }, [data])

  if (!data) return null

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes celebracao-pop {
          0%   { transform: scale(0.5) translateY(20px); opacity: 0; }
          70%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Confetti container (full-screen) */}
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-hidden pointer-events-none"
        />

        {/* Modal card */}
        <div
          className="relative mx-4 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center"
          style={{ animation: 'celebracao-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <Trophy size={40} className="text-amber-500" />
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-1">
            Corridinha concluída!
          </p>
          <h2 className="text-2xl font-extrabold text-slate-800 mb-2 leading-tight">
            {data.nome}
          </h2>

          {data.premio_descricao && (
            <p className="text-slate-500 text-sm mb-4">{data.premio_descricao}</p>
          )}

          {data.bonus_valor > 0 && (
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-3 mb-6">
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">
                Bônus conquistado
              </p>
              <p className="text-3xl font-extrabold text-emerald-600">
                {formatBRL(data.bonus_valor)}
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            Arrasou! 🎉
          </button>
        </div>
      </div>
    </>
  )
}
