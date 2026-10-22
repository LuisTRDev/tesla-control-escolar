import { useEffect, useRef, useState } from 'react'
import { reportError } from '@/lib/security'

type Props = {
  onScan: (raw: string) => void
  onError: (message: string) => void
}

type DetectorLike = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
type DetectorCtor = { new (options?: { formats: string[] }): DetectorLike }

const FORMATS = ['pdf417', 'qr_code', 'code_128', 'code_39', 'data_matrix']
const SCAN_INTERVAL_MS = 150
/** Evita registrar dos veces el mismo código mientras sigue frente a la cámara. */
const REPEAT_BLOCK_MS = 2500

export default function DniCameraScanner({ onScan, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [starting, setStarting] = useState(true)
  const callbacks = useRef({ onScan, onError })
  useEffect(() => { callbacks.current = { onScan, onError } }, [onScan, onError])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopFallback: (() => void) | undefined
    let lastValue = ''
    let lastAt = 0

    const emit = (value: string) => {
      const now = Date.now()
      if (value === lastValue && now - lastAt < REPEAT_BLOCK_MS) return
      lastValue = value
      lastAt = now
      callbacks.current.onScan(value)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onError('Este dispositivo o navegador no permite usar la cámara (requiere HTTPS).')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (error) {
        const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
        callbacks.current.onError(denied ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.' : 'No se pudo abrir la cámara.')
        if (!denied) reportError('DniCameraScanner.getUserMedia', error)
        return
      }
      const video = videoRef.current
      if (stopped || !video) { stream.getTracks().forEach((track) => track.stop()); return }
      video.srcObject = stream
      try { await video.play() } catch { /* el navegador reintenta al tener datos */ }
      if (stopped) return
      setStarting(false)

      const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      if (Detector) {
        const detector = new Detector({ formats: FORMATS })
        let reading = false
        timer = window.setInterval(() => {
          if (reading || video.readyState < 2) return
          reading = true
          detector.detect(video)
            .then((codes) => { if (!stopped && codes[0]?.rawValue) emit(codes[0].rawValue) })
            .catch(() => undefined)
            .finally(() => { reading = false })
        }, SCAN_INTERVAL_MS)
        return
      }

      // iOS Safari y Firefox no traen BarcodeDetector: se decodifica con zxing (carga bajo demanda).
      try {
        const zxing = await import('@zxing/library')
        if (stopped) return
        const hints = new Map<unknown, unknown>([
          [zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.PDF_417, zxing.BarcodeFormat.QR_CODE, zxing.BarcodeFormat.CODE_128, zxing.BarcodeFormat.CODE_39, zxing.BarcodeFormat.DATA_MATRIX]],
          [zxing.DecodeHintType.TRY_HARDER, true],
        ])
        const reader = new zxing.BrowserMultiFormatReader(hints as Map<import('@zxing/library').DecodeHintType, unknown>, SCAN_INTERVAL_MS)
        void reader.decodeFromStream(stream, video, (result) => { if (result && !stopped) emit(result.getText()) })
        stopFallback = () => reader.reset()
      } catch (error) {
        callbacks.current.onError('No se pudo iniciar el lector de códigos.')
        reportError('DniCameraScanner.zxing', error)
      }
    }

    void start()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearInterval(timer)
      stopFallback?.()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
      <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
      <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-emerald-400/70" />
      <p className="absolute inset-x-0 bottom-2 text-center text-xs font-bold text-white/80">
        {starting ? 'Abriendo cámara…' : 'Apunta al código de barras del reverso del DNI'}
      </p>
    </div>
  )
}
