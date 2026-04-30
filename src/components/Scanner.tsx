
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window { BarcodeDetector?: any }
}

export default function Scanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [supported, setSupported] = useState<boolean>(false)

  useEffect(() => {
    setSupported(!!(window as any).BarcodeDetector)
    let stream: MediaStream
    let detector: any
    let raf: number

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) videoRef.current.srcObject = stream
        if ((window as any).BarcodeDetector) {
          detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code'] })
          const scan = async () => {
            if (!videoRef.current) return
            try {
              const codes = await detector.detect(videoRef.current)
              if (codes && codes[0]) onDetect(codes[0].rawValue)
            } catch {}
            raf = requestAnimationFrame(scan)
          }
          raf = requestAnimationFrame(scan)
        }
      } catch {}
    }
    start()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="space-y-2">
      <video ref={videoRef} autoPlay playsInline className="w-full rounded-2xl bg-black/5 aspect-[3/4]" />
      {!supported && (
        <div className="text-xs text-slate-400">
          Seu navegador não suporta leitura automática. Digite o código manualmente.
        </div>
      )}
    </div>
  )
}
