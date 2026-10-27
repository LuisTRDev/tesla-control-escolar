import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type TouchEvent } from 'react'
import { AnimatePresence, MotionConfig, motion, useAnimationControls, type Variants } from 'framer-motion'
import {
  Activity, CheckCircle2, Clock3, Expand,
  GripVertical, LayoutDashboard, Maximize2, Minimize,
  RotateCcw, Save, SlidersHorizontal,
  Wifi, WifiOff, X, EyeOff, Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, MoreHorizontal, Pause, Play, RefreshCw, Share2, Sun, Type, Vibrate, Volume2,
} from 'lucide-react'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'
import { useWakeLock } from '@/lib/nativeFeatures'
import { LiveClock, LiveDate, UpdatedAgo } from '@/components/livetv/LiveClock'
import { LiveSheet } from '@/components/livetv/LiveSheet'
import { CATALOG, DEFAULT_LAYOUT, MOBILE_DEFAULT_LAYOUT, MOBILE_STORAGE_KEY, STORAGE_KEY, TABS, loadLayout, sizeClass, tabOfKind, type CardKind, type CardSize, type LayoutCard, type TabId } from '@/components/livetv/catalog'
import { buildPanelData } from '@/components/livetv/panelData'
import { renderCard } from '@/components/livetv/cards/renderCard'
import { FlashContext } from '@/components/livetv/cards/shared'
import { playFeedback } from '@/lib/feedback'
import { Empty } from '@/components/livetv/cards/shared'
import { StudentSheetBody } from '@/components/livetv/StudentSheetBody'
import { ShareSheet } from '@/components/livetv/ShareSheet'
import { StaleNotice } from '@/components/livetv/StaleNotice'
import { LivePulse, MinuteSweep, Odometer } from '@/components/livetv/motion'
import { buildSummary } from '@/components/livetv/shareSummary'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { haptic } from '@/lib/haptics'

type Props = {
  open: boolean
  onClose: () => void
  students: Student[]
  classrooms: Classroom[]
  attendanceRecords: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  today: string
  realtimeConnected: boolean
  /** Hay conexión a Internet; sin ella se avisa que los datos pueden estar viejos. */
  online?: boolean
  /** Vuelve a pedir los datos al servidor (botón y gesto de jalar para refrescar). */
  onRefresh?: () => Promise<void>
}

const PREFS_KEY = 'tesla-live-tv-prefs-v1'
type PanelPrefs = { keepAwake?: boolean; largeText?: boolean; vibrate?: boolean; sound?: boolean; rotateSeconds?: number }
function loadPrefs(): PanelPrefs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' ? parsed as PanelPrefs : {}
  } catch {
    return {}
  }
}

// Cambio de sección: las tarjetas entran en cascada desde el lado hacia el que se avanza.
type CascadeCustom = { direction: number; blur: boolean }
const CASCADE: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.02 } } }
const CASCADE_ITEM: Variants = {
  hidden: ({ direction, blur }: CascadeCustom) => ({ opacity: 0, x: direction * 22, y: 10, ...(blur ? { filter: 'blur(6px)' } : {}) }),
  show: ({ blur }: CascadeCustom) => ({ opacity: 1, x: 0, y: 0, ...(blur ? { filter: 'blur(0px)' } : {}), transition: { type: 'spring', stiffness: 240, damping: 26 } }),
}

const PULL_TRIGGER = 60
const ROTATE_CHOICES = [10, 20, 30, 60]
const SWIPE_MIN_PX = 70
const TAB_KEY = 'tesla-live-tv-tab-v1'
function loadTab(): TabId {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some((item) => item.id === saved) ? saved as TabId : 'tardanzas'
  } catch {
    return 'tardanzas'
  }
}

export default function LiveTvPanel({
  open,
  onClose,
  students,
  classrooms,
  attendanceRecords,
  presentationRecords,
  today,
  realtimeConnected,
  online = true,
  onRefresh,
}: Props) {
  const mobile = useMobileLayout()
  const [prefs, setPrefs] = useState<PanelPrefs>(loadPrefs)
  // La TV del patio siempre encendida; en el celular es opcional para no gastar batería.
  const keepAwake = prefs.keepAwake ?? !mobile
  const vibrateOnLate = prefs.vibrate ?? true
  const largeText = prefs.largeText ?? false
  const soundOnLate = prefs.sound ?? false
  const rotateSeconds = prefs.rotateSeconds ?? 20
  // Modo rotación: cambia de sección solo, con letra grande (pantalla del patio). Siempre con la pantalla encendida.
  const [rotating, setRotating] = useState(false)
  const [rotationPaused, setRotationPaused] = useState(false)
  const [rotationRun, setRotationRun] = useState(0)
  useWakeLock(open && (keepAwake || rotating))
  const sectionRef = useRef<HTMLElement | null>(null)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const [editMode, setEditMode] = useState(false)
  // Celular y TV guardan su distribución por separado: cada dispositivo ve lo que armó para él.
  const [layouts, setLayouts] = useState(() => ({
    desktop: loadLayout(STORAGE_KEY, DEFAULT_LAYOUT),
    mobile: loadLayout(MOBILE_STORAGE_KEY, MOBILE_DEFAULT_LAYOUT),
  }))
  const mode = mobile ? 'mobile' : 'desktop'
  const layout = layouts[mode]
  const storageKey = mobile ? MOBILE_STORAGE_KEY : STORAGE_KEY
  const defaultLayout = mobile ? MOBILE_DEFAULT_LAYOUT : DEFAULT_LAYOUT
  const setLayout = useCallback((update: (current: LayoutCard[]) => LayoutCard[]) => {
    setLayouts((current) => ({ ...current, [mode]: update(current[mode]) }))
  }, [mode])
  const [tab, setTab] = useState<TabId>(loadTab)
  const lastTab = useRef<TabId>(tab)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // 'open' se separa del id para que el contenido siga visible mientras la hoja baja al cerrarse.
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [pull, setPull] = useState(0)
  const pullStart = useRef<number | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const [seenLate, setSeenLate] = useState<number | null>(null)
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(() => new Set())
  const [announcement, setAnnouncement] = useState('')
  const knownLates = useRef<Set<string> | null>(null)
  const [sheet, setSheet] = useState<{ id: string; open: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [open])

  const data = useMemo(() => buildPanelData({ students, classrooms, attendanceRecords, presentationRecords, today }), [attendanceRecords, classrooms, presentationRecords, students, today])

  useEffect(() => {
    if (editMode) localStorage.setItem(storageKey, JSON.stringify(layout))
  }, [editMode, layout, storageKey])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Algunos televisores/navegadores bloquean Fullscreen API.
    }
  }

  function saveLayout() {
    localStorage.setItem(storageKey, JSON.stringify(layout))
    setSavedNotice(true)
    window.setTimeout(() => setSavedNotice(false), 1800)
    setEditMode(false)
    setCatalogOpen(false)
  }

  function resetLayout() {
    setLayout(() => defaultLayout)
    localStorage.setItem(storageKey, JSON.stringify(defaultLayout))
  }

  function changeTab(next: TabId) {
    setTab(next)
    try { localStorage.setItem(TAB_KEY, next) } catch { /* sin almacenamiento: no se recuerda la pestaña */ }
    sectionRef.current?.scrollTo({ top: 0 })
  }

  function addCard(kind: CardKind) {
    if (layout.some((item) => item.kind === kind)) return
    const catalogCard = CATALOG.find((item) => item.kind === kind)
    if (!catalogCard) return
    setLayout((current) => [...current, { id: `${kind}-${Date.now()}`, kind, size: catalogCard.defaultSize }])
    // En celular la tarjeta nueva vive en su pestaña: se va a ella para que se vea que se añadió.
    if (mobile) {
      setCatalogOpen(false)
      changeTab(tabOfKind(kind))
    }
  }

  function removeCard(id: string) {
    setLayout((current) => current.filter((item) => item.id !== id))
  }

  function cycleSize(id: string) {
    setLayout((current) => current.map((item) => {
      if (item.id !== id) return item
      const next: CardSize = item.size === 'sm' ? 'md' : item.size === 'md' ? 'lg' : 'sm'
      return { ...item, size: next }
    }))
  }

  /** Sube o baja una tarjeta dentro de su pestaña (en celular no se arrastra: el dedo hace scroll). */
  function moveCard(id: string, direction: -1 | 1) {
    setLayout((current) => {
      const index = current.findIndex((item) => item.id === id)
      if (index < 0) return current
      const tabId = tabOfKind(current[index].kind)
      let target = index + direction
      while (target >= 0 && target < current.length && tabOfKind(current[target].kind) !== tabId) target += direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    if (!editMode) return
    setDraggedId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault()
    if (!editMode || !draggedId || draggedId === targetId) return
    setDropTargetId(targetId)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!editMode) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function onDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault()
    if (!editMode || !draggedId || draggedId === targetId) return
    setLayout((current) => {
      const sourceIndex = current.findIndex((item) => item.id === draggedId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDraggedId(null)
    setDropTargetId(null)
  }

  function onDragEnd() {
    setDraggedId(null)
    setDropTargetId(null)
  }

  const activeKinds = new Set(layout.map((item) => item.kind))
  const shownTabs = editMode ? TABS : TABS.filter((item) => layout.some((card) => tabOfKind(card.kind) === item.id))
  const activeTab = shownTabs.some((item) => item.id === tab) ? tab : (shownTabs[0]?.id ?? 'tardanzas')
  const mobileCards = layout.filter((item) => tabOfKind(item.kind) === activeTab)
  const tabbed = mobile || rotating
  const ActiveIcon = TABS.find((item) => item.id === activeTab)?.icon ?? Clock3
  const tabIds = shownTabs.map((item) => item.id).join(',')
  const zoomValue = rotating ? (mobile ? 1.15 : 1.35) : largeText ? 1.15 : 1
  // Hacia dónde se mueve el cambio de pestaña: lo nuevo entra desde el lado al que se va.
  const tabOrder = TABS.map((item) => item.id)
  const direction = tabOrder.indexOf(activeTab) >= tabOrder.indexOf(lastTab.current) ? 1 : -1
  const canFullscreen = Boolean(document.fullscreenEnabled)
  const newLates = seenLate === null ? 0 : Math.max(0, data.late - seenLate)

  // Cada carga de datos (realtime, sincronización o refresco manual) renueva "Actualizado hace…".
  useEffect(() => { setLastUpdate(Date.now()) }, [attendanceRecords, presentationRecords, students])
  useEffect(() => { lastTab.current = activeTab }, [activeTab])

  // Tardanza nueva (una que no estaba cuando se abrió el panel): su fila destella, y según las preferencias vibra o suena.
  useEffect(() => {
    if (!open) { knownLates.current = null; return }
    const current = data.lateStudents.map(({ student }) => student)
    const known = knownLates.current
    knownLates.current = new Set(current.map((student) => student.id))
    if (!known) return
    const fresh = current.filter((student) => !known.has(student.id))
    if (fresh.length === 0) return
    const ids = fresh.map((student) => student.id)
    setFlashing((existing) => new Set([...existing, ...ids]))
    window.setTimeout(() => setFlashing((existing) => new Set([...existing].filter((id) => !ids.includes(id)))), 6000)
    setAnnouncement(fresh.length === 1 ? `Nueva tardanza: ${fresh[0].firstName} ${fresh[0].lastName}.` : `${fresh.length} tardanzas nuevas.`)
    if (mobile && vibrateOnLate) haptic('alert', { force: true })
    if (soundOnLate) playFeedback('late', { sound: true, vibration: false })
  }, [data.lateStudents, open, mobile, vibrateOnLate, soundOnLate])
  useEffect(() => {
    if (activeTab === 'tardanzas') setSeenLate(data.late)
    else setSeenLate((current) => (current !== null && data.late < current ? data.late : current))
  }, [activeTab, data.late])

  useEffect(() => { if (!open) setRotating(false) }, [open])

  // Rotación: avanza a la siguiente sección cada N segundos (sin tocar la pestaña recordada del celular).
  useEffect(() => {
    if (!rotating || rotationPaused || !open) return
    const ids = tabIds.split(',')
    const timer = window.setInterval(() => {
      setTab((current) => (ids[(ids.indexOf(current) + 1) % ids.length] ?? ids[0]) as TabId)
    }, rotateSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [rotating, rotationPaused, open, rotateSeconds, tabIds, rotationRun])

  useEffect(() => {
    if (rotating) sectionRef.current?.scrollTo({ top: 0 })
  }, [activeTab, rotating])

  useEffect(() => {
    if (!rotating) return
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setRotating(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotating])

  function startRotation() {
    setMenuOpen(false)
    setEditMode(false)
    setCatalogOpen(false)
    setRotationPaused(false)
    setRotationRun((value) => value + 1)
    setRotating(true)
  }

  function toggleRotationPause() {
    // Al reanudar, la barra de progreso y el temporizador vuelven a empezar juntos.
    if (rotationPaused) setRotationRun((value) => value + 1)
    setRotationPaused((value) => !value)
  }

  function goToRotationTab(next: TabId) {
    setTab(next)
    setRotationRun((value) => value + 1)
  }

  function updatePrefs(patch: PanelPrefs) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento: la preferencia dura la sesión */ }
  }

  async function refresh() {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  // Jalar hacia abajo estando arriba del todo refresca (el navegador no lo hace dentro del panel).
  function onTouchStart(event: TouchEvent<HTMLElement>) {
    // Lo que ocurre dentro de una hoja (ficha, menú, compartir) no es gesto del panel.
    const inDialog = (event.target as HTMLElement).closest('[role="dialog"]')
    swipeStart.current = mobile && !inDialog ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
    if (inDialog) { pullStart.current = null; return }
    pullStart.current = mobile && !editMode && onRefresh && sectionRef.current?.scrollTop === 0 ? event.touches[0].clientY : null
  }
  function onTouchMove(event: TouchEvent<HTMLElement>) {
    if (pullStart.current === null) return
    const distance = event.touches[0].clientY - pullStart.current
    setPull(distance > 0 ? Math.min(distance * 0.5, 80) : 0)
  }
  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (pullStart.current !== null && pull >= PULL_TRIGGER) void refresh()
    pullStart.current = null
    setPull(0)
    // Deslizar de lado cambia de pestaña (solo si el gesto es claramente horizontal).
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.6) return
    const index = shownTabs.findIndex((item) => item.id === activeTab)
    const next = shownTabs[index + (dx < 0 ? 1 : -1)]
    if (next) changeTab(next.id)
  }
  function onTouchCancel() {
    swipeStart.current = null
    pullStart.current = null
    setPull(0)
  }

  const connectionChip = (compact: boolean) => (
    <div className={`flex items-center gap-2 rounded-xl border font-black ${compact ? 'h-10 px-2.5 text-xs' : 'h-11 px-3 text-sm sm:px-4'} ${realtimeConnected ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
      <LivePulse pulseKey={lastUpdate} active={realtimeConnected}>{realtimeConnected ? <Wifi size={compact ? 15 : 17} /> : <WifiOff size={compact ? 15 : 17} />}</LivePulse>
      <span className="sm:hidden">{realtimeConnected ? 'En vivo' : 'Reconectando…'}</span><span className="hidden sm:inline">{realtimeConnected ? 'Tiempo real conectado' : 'Reconectando…'}</span>
    </div>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={sectionRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-[#050b16] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <MotionConfig reducedMotion="user">
          <FlashContext.Provider value={flashing}>
          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
          <div style={zoomValue !== 1 ? { zoom: zoomValue } : undefined} className={mobile ? 'min-h-full px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] short:pb-[calc(3.5rem+env(safe-area-inset-bottom))]' : 'min-h-screen p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(.75rem+env(safe-area-inset-top))] sm:p-6 xl:p-8'}>
            {rotating ? (
              <header className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[#050b16]/95 px-3 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] backdrop-blur-xl sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
                <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-white/5" aria-hidden="true">
                  <div key={`${activeTab}-${rotationRun}`} className="h-full origin-left animate-liveProgress bg-sky-400 motion-reduce:animate-none" style={{ animationDuration: `${rotateSeconds}s`, animationPlayState: rotationPaused ? 'paused' : 'running' }} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-sky-300"><ActiveIcon size={26} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-[.24em] text-sky-300">Panel en vivo</p>
                    <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{TABS.find((item) => item.id === activeTab)?.label}</h1>
                  </div>
                  {!mobile && connectionChip(false)}
                  <LiveClock active={open} className="font-mono text-xl font-black tabular-nums text-slate-100 sm:text-3xl" />
                  <button type="button" onClick={toggleRotationPause} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 active:bg-white/10" aria-label={rotationPaused ? 'Reanudar rotación' : 'Pausar rotación'}>{rotationPaused ? <Play size={20} /> : <Pause size={20} />}</button>
                  <button type="button" onClick={() => setRotating(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 active:bg-white/10" aria-label="Salir del modo rotación"><X size={21} /></button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2" aria-live="polite">
                  <HeaderStat label="Tardanzas" value={data.late} tone="amber" onClick={() => goToRotationTab('tardanzas')} />
                  <HeaderStat label="Ingresaron" value={data.entered} tone="emerald" onClick={() => goToRotationTab('resumen')} />
                  <HeaderStat label="Sin marcar" value={data.pending} tone="slate" onClick={() => goToRotationTab('pendientes')} />
                </div>
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {shownTabs.map((item) => <button key={item.id} type="button" onClick={() => goToRotationTab(item.id)} aria-current={item.id === activeTab ? 'page' : undefined} className={`min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-black ${item.id === activeTab ? 'border-sky-400/50 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>{item.label}</button>)}
                </div>
                <StaleNotice since={lastUpdate} online={online} realtimeConnected={realtimeConnected} active={open} className="mt-2" />
              </header>
            ) : mobile ? (
              <header className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[#050b16]/95 px-3 pb-2.5 pt-[calc(.5rem+env(safe-area-inset-top))] backdrop-blur-xl short:static">
                <MinuteSweep />
                <div className="flex items-center gap-2">
                  {connectionChip(true)}
                  <LiveClock active={open} className="font-mono text-base font-black tabular-nums text-slate-100" />
                  <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => setEditMode((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-xl border ${editMode ? 'border-sky-400/50 bg-sky-400/15 text-sky-300' : 'border-white/10 bg-white/5 text-slate-300'}`} aria-label="Personalizar panel" aria-pressed={editMode}><SlidersHorizontal size={18} /></button>
                    <button type="button" onClick={() => setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-label="Más opciones"><MoreHorizontal size={19} /></button>
                    <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-label="Cerrar panel"><X size={20} /></button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Cifras del día" aria-live="polite">
                  <HeaderStat label="Tardanzas" value={data.late} tone="amber" onClick={() => changeTab('tardanzas')} />
                  <HeaderStat label="Ingresaron" value={data.entered} tone="emerald" onClick={() => changeTab('resumen')} />
                  <HeaderStat label="Sin marcar" value={data.pending} tone="slate" onClick={() => changeTab('pendientes')} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
                  <UpdatedAgo since={lastUpdate} active={open} />
                  <button type="button" onClick={() => setShareOpen(true)} className="ml-auto flex min-h-8 items-center gap-1.5 rounded-lg px-2 font-black text-slate-300 active:bg-white/10" aria-label="Compartir resumen"><Share2 size={14} />Compartir</button>
                  {onRefresh && <button type="button" onClick={() => void refresh()} disabled={refreshing} className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 font-black text-slate-400 active:bg-white/10" aria-label="Actualizar datos"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Actualizar</button>}
                </div>
                <StaleNotice since={lastUpdate} online={online} realtimeConnected={realtimeConnected} active={open} className="mt-2" />
              </header>
            ) : (
              <header className="relative flex flex-col gap-3 border-b border-white/10 pb-4 sm:gap-5 sm:pb-5 xl:flex-row xl:items-center xl:justify-between">
                <MinuteSweep />
                <div>
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-sky-300 sm:h-12 sm:w-12"><Activity size={23} /></div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[.24em] text-sky-300 sm:text-xs">Tesla Control Escolar</p>
                      <h1 className="mt-0.5 text-xl font-black tracking-tight sm:mt-1 sm:text-3xl">Panel en vivo</h1>
                    </div>
                  </div>
                  <LiveDate active={open} className="mt-2 text-xs font-semibold capitalize text-slate-400 sm:mt-3 sm:text-sm" />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  {connectionChip(false)}
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 font-mono text-lg font-black tabular-nums text-slate-100 sm:px-4 sm:text-2xl"><LiveClock active={open} /></div>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setEditMode((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-xl border ${editMode ? 'border-sky-400/50 bg-sky-400/15 text-sky-400' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`} aria-label="Personalizar panel">
                    <SlidersHorizontal size={19} />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setShareOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Compartir resumen"><Share2 size={19} /></motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setMenuOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Más opciones"><MoreHorizontal size={20} /></motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => void toggleFullscreen()} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Pantalla completa">
                    {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Cerrar panel"><X size={21} /></motion.button>
                </div>
              </header>
            )}
            {!mobile && !rotating && <StaleNotice since={lastUpdate} online={online} realtimeConnected={realtimeConnected} active={open} className="mt-3" />}

            {mobile && (pull > 0 || refreshing) && (
              <div style={{ height: refreshing ? 36 : pull }} className="grid place-items-end justify-center overflow-hidden pt-2 text-sky-300" aria-hidden="true">
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / PULL_TRIGGER) }} />
              </div>
            )}

            <AnimatePresence>
              {editMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3 overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-r from-sky-400/[.10] via-white/[.04] to-transparent sm:mt-5"
                >
                  <div className="flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-400/15 text-sky-400"><GripVertical size={20} /></div>
                      <div>
                        <p className="font-black">Personaliza tu panel</p>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-400">{mobile
                          ? 'Mueve cada tarjeta con las flechas, quítala con el ojo o añade tarjetas nuevas. Cada una vive en su pestaña.'
                          : 'Arrastra cualquier tarjeta para cambiar su posición. Usa el tamaño para hacer una tarjeta de ancho completo y colocarla debajo o encima de otra.'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCatalogOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-white/10"><Plus size={16} /> Añadir tarjeta {catalogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                      <button type="button" onClick={resetLayout} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-300 hover:bg-white/10"><RotateCcw size={16} /> Restablecer</button>
                      <button type="button" onClick={saveLayout} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-105"><Save size={16} /> Guardar</button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {catalogOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="border-t border-white/10">
                        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                          {CATALOG.filter((card) => !activeKinds.has(card.kind)).map((card) => (
                            <button key={card.kind} type="button" onClick={() => addCard(card.kind)} className="group rounded-2xl border border-white/8 bg-white/[.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400/20 hover:bg-white/[.06]">
                              <div className="flex items-start gap-3">
                                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-400"><LayoutDashboard size={18} /></div>
                                <div className="min-w-0"><p className="font-black text-slate-100">{card.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{card.description}</p></div>
                              </div>
                            </button>
                          ))}
                          {CATALOG.every((card) => activeKinds.has(card.kind)) && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm font-semibold text-slate-400 sm:col-span-2 xl:col-span-3">Todas las tarjetas disponibles ya están agregadas.</div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {tabbed ? (
              <motion.div key={activeTab} variants={CASCADE} initial="hidden" animate="show" className={mobile ? 'mt-3 grid grid-cols-1 items-start gap-3 [@media(orientation:landscape)]:grid-cols-2' : 'mt-4 grid grid-cols-12 items-start gap-4 xl:gap-5'}>
                {mobileCards.length === 0 && <div className={mobile ? '[@media(orientation:landscape)]:col-span-2' : 'col-span-12'}><Empty text="Esta pestaña no tiene tarjetas. Pulsa Personalizar para añadir." /></div>}
                {mobileCards.map((item, index) => (
                  <motion.div key={item.id} variants={CASCADE_ITEM} custom={{ direction, blur: !mobile }} className={mobile ? 'relative min-w-0' : `${sizeClass(item.size)} relative min-w-0`}>
                    {editMode && (
                      <div className="mb-1.5 flex items-center gap-1 rounded-2xl border border-sky-400/20 bg-sky-400/[.06] p-1.5">
                        <span className="min-w-0 flex-1 truncate pl-2 text-xs font-black uppercase tracking-wider text-slate-300">{CATALOG.find((card) => card.kind === item.kind)?.title}</span>
                        <button type="button" onClick={() => moveCard(item.id, -1)} disabled={index === 0} className="grid h-10 w-10 place-items-center rounded-xl text-slate-300 active:bg-white/10 disabled:opacity-30" aria-label="Subir tarjeta"><ArrowUp size={18} /></button>
                        <button type="button" onClick={() => moveCard(item.id, 1)} disabled={index === mobileCards.length - 1} className="grid h-10 w-10 place-items-center rounded-xl text-slate-300 active:bg-white/10 disabled:opacity-30" aria-label="Bajar tarjeta"><ArrowDown size={18} /></button>
                        <button type="button" onClick={() => removeCard(item.id)} className="grid h-10 w-10 place-items-center rounded-xl text-red-300 active:bg-red-500/15" aria-label="Quitar tarjeta"><EyeOff size={18} /></button>
                      </div>
                    )}
                    {renderCard(item.kind, data, students.length, mobile, mobile ? (id) => setSheet({ id, open: true }) : undefined)}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div layout className="mt-4 grid grid-cols-12 gap-3 sm:mt-6 sm:gap-4 xl:gap-5">
                <AnimatePresence mode="popLayout">
                  {layout.map((item, index) => {
                    const catalog = CATALOG.find((card) => card.kind === item.kind)
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.5, delay: index * 0.06 }, y: { type: 'spring', stiffness: 200, damping: 24, delay: index * 0.06 } }}
                        className={`${sizeClass(item.size)} relative min-w-0`}
                        draggable={editMode}
                        onDragStart={(event) => onDragStart(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                        onDragEnter={(event) => onDragEnter(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                        onDragOver={(event) => onDragOver(event as unknown as DragEvent<HTMLDivElement>)}
                        onDrop={(event) => onDrop(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                        onDragEnd={onDragEnd}
                      >
                        {editMode && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`pointer-events-none absolute inset-1 z-20 rounded-[28px] border-2 border-dashed ${dropTargetId === item.id ? 'border-sky-400/80 bg-sky-400/[.05]' : 'border-white/10'}`}
                          />
                        )}
                        {editMode && (
                          <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#081120]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                            <button type="button" title="Arrastrar" className="grid h-8 w-8 cursor-grab place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><GripVertical size={16} /></button>
                            <button type="button" title={`Cambiar tamaño: ${item.size.toUpperCase()}`} onClick={() => cycleSize(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><Maximize2 size={15} /></button>
                            <button type="button" title="Quitar tarjeta" onClick={() => removeCard(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/15 hover:text-red-300"><EyeOff size={15} /></button>
                          </div>
                        )}
                        {renderCard(item.kind, data, students.length, false)}
                        {editMode && <span className="absolute bottom-3 left-3 z-30 rounded-lg bg-black/35 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-400 backdrop-blur">{catalog?.title}</span>}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            )}

            {mobile && !rotating && (
              <nav aria-label="Secciones del panel" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#07101d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl">
                  {shownTabs.map((item) => {
                    const Icon = item.icon
                    const selected = item.id === activeTab
                    return (
                      <button key={item.id} type="button" onClick={() => changeTab(item.id)} aria-current={selected ? 'page' : undefined} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-black short:min-h-11 short:flex-row short:gap-1.5 short:text-xs ${selected ? 'text-white' : 'text-slate-400 active:text-slate-300'}`}>
                        {selected && <motion.span layoutId="live-tab-active" className="absolute inset-x-2 inset-y-1 rounded-xl bg-sky-400/10 ring-1 ring-sky-400/25" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                        <Icon size={21} className="relative" />
                        <span className="relative">{item.label}</span>
                        {item.id === 'tardanzas' && !selected && newLates > 0 && <span className="absolute right-[calc(50%-1.9rem)] top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-slate-950" aria-label={`${newLates} tardanzas nuevas`}>+{newLates}</span>}
                      </button>
                    )
                  })}
                </div>
              </nav>
            )}

            <AnimatePresence>
              {savedNotice && (
                <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.2 }} className={`fixed right-4 z-[120] flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300 shadow-2xl backdrop-blur-xl sm:right-6 ${mobile ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))]'}`}><CheckCircle2 size={17} /> Distribución guardada</motion.div>
              )}
            </AnimatePresence>

            {(() => {
              const sheetStudent = sheet ? data.studentById.get(sheet.id) : undefined
              return (
                <LiveSheet open={Boolean(sheet?.open && sheetStudent)} onClose={() => setSheet((current) => current && { ...current, open: false })} title={sheetStudent ? `${sheetStudent.firstName} ${sheetStudent.lastName}` : 'Alumno'} subtitle="Estado de hoy">
                  {sheetStudent && <StudentSheetBody student={sheetStudent} classroom={data.classroomById.get(sheetStudent.classroomId)} record={data.attendanceByStudent.get(sheetStudent.id)} incidents={data.incidents.filter((incident) => incident.studentId === sheetStudent.id)} />}
                </LiveSheet>
              )
            })()}

            <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} getSummary={() => buildSummary(data, students.length)} />

            <LiveSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Panel en vivo" subtitle="Opciones">
              <LiveDate active={menuOpen} className="px-1 pb-3 text-sm font-semibold capitalize text-slate-400" />
              <div className="space-y-1">
                <MenuAction icon={<Share2 size={19} />} label="Compartir resumen" description="Imagen o texto de las tardanzas" onClick={() => { setMenuOpen(false); setShareOpen(true) }} />
                <MenuAction icon={<Play size={19} />} label="Modo rotación" description={`Cambia de sección solo cada ${rotateSeconds} s, con letra grande. Ideal para la pantalla del patio`} onClick={startRotation} />
                <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pl-[3.75rem]">
                  <span className="text-xs font-bold text-slate-400">Cambiar cada</span>
                  {ROTATE_CHOICES.map((seconds) => <button key={seconds} type="button" onClick={() => updatePrefs({ rotateSeconds: seconds })} aria-pressed={rotateSeconds === seconds} className={`min-h-9 rounded-full border px-3 text-xs font-black ${rotateSeconds === seconds ? 'border-sky-400/50 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>{seconds} s</button>)}
                </div>
                <MenuAction icon={<SlidersHorizontal size={19} />} label="Personalizar panel" description="Añadir, quitar y ordenar tarjetas" onClick={() => { setMenuOpen(false); setEditMode(true) }} />
                <MenuToggle icon={<Sun size={19} />} label="Mantener pantalla encendida" description={keepAwake ? 'Activado: gasta más batería' : 'Desactivado: la pantalla se apaga sola'} checked={keepAwake} onChange={(value) => updatePrefs({ keepAwake: value })} />
                <MenuToggle icon={<Volume2 size={19} />} label="Sonido con tardanza nueva" description="Un aviso corto cada vez que entra una tardanza" checked={soundOnLate} onChange={(value) => { updatePrefs({ sound: value }); if (value) playFeedback('late', { sound: true, vibration: false }) }} />
                {mobile && <MenuToggle icon={<Vibrate size={19} />} label="Vibrar con tardanza nueva" checked={vibrateOnLate} onChange={(value) => updatePrefs({ vibrate: value })} />}
                <MenuToggle icon={<Type size={19} />} label="Texto grande" checked={largeText} onChange={(value) => updatePrefs({ largeText: value })} />
                {canFullscreen && <MenuAction icon={fullscreen ? <Minimize size={19} /> : <Expand size={19} />} label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => { setMenuOpen(false); void toggleFullscreen() }} />}
              </div>
            </LiveSheet>
          </div>
          </FlashContext.Provider>
          </MotionConfig>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function HeaderStat({ label, value, tone, onClick }: { label: string; value: number; tone: 'amber' | 'emerald' | 'slate'; onClick: () => void }) {
  const toneClass = tone === 'amber' ? 'border-amber-400/25 bg-amber-500/10 text-amber-300' : tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-200'
  // Cuando la cifra sube, la tarjeta da un latido con un halo del color de la cifra.
  const controls = useAnimationControls()
  const previous = useRef(value)
  useEffect(() => {
    if (value > previous.current) void controls.start({ scale: [1, 1.07, 1], transition: { duration: 0.6, ease: 'easeOut' } })
    previous.current = value
  }, [value, controls])
  return <motion.button animate={controls} type="button" onClick={onClick} className={`min-w-0 rounded-xl border px-3 py-1.5 text-left active:brightness-125 ${toneClass}`}><span className="block text-2xl leading-none"><Odometer value={value} className="font-black" /></span><span className="mt-1 block truncate text-xs font-black uppercase tracking-wider opacity-80">{label}</span></motion.button>
}

function MenuToggle({ icon, label, description, checked, onChange }: { icon: ReactNode; label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-white/10">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs font-medium text-slate-400">{description}</span>}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`} /></span>
    </button>
  )
}

function MenuAction({ icon, label, description, onClick }: { icon: ReactNode; label: string; description?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-white/10"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs font-medium text-slate-400">{description}</span>}</span></button>
}
