import React, { useCallback, useEffect, useRef, useState } from 'react'
import { loadState, saveState, uid, savePhoto, deletePhoto } from './lib/storage'
import { recomputeTrip } from './lib/geo'
import { fileToDataURL, makeThumb } from './lib/image'
import PlanView from './views/PlanView.jsx'
import JournalView from './views/JournalView.jsx'
import ShareView from './views/ShareView.jsx'
import SettingsModal from './views/SettingsModal.jsx'

export default function App() {
  const [state, setState] = useState(loadState)
  const [tab, setTab] = useState('plan') // plan | journal | share
  const [planSub, setPlanSub] = useState('main') // main | collect（采集箱是规划台的子页面）
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recomputing, setRecomputing] = useState(false)

  useEffect(() => saveState(state), [state])

  // 行程的唯一事实源：ref 与 state 同步更新，避免异步计算读到旧值
  const tripRef = useRef(state.trip)
  const settingsRef = useRef(state.settings)
  useEffect(() => { tripRef.current = state.trip }, [state.trip])
  useEffect(() => { settingsRef.current = state.settings }, [state.settings])

  const updateTrip = useCallback((fn) => {
    const next = fn(tripRef.current)
    tripRef.current = next
    setState((s) => ({ ...s, trip: next }))
    return next
  }, [])

  const recompute = useCallback(async (t0) => {
    const t = t0 || tripRef.current
    setRecomputing(true)
    try {
      const { amapKey, orsKey } = settingsRef.current
      const next = await recomputeTrip(t, { amapKey, orsKey })
      updateTrip((cur) => ({ ...cur, days: next.days }))
    } finally {
      setRecomputing(false)
    }
  }, [updateTrip])

  const loadTrip = useCallback(async (t) => {
    updateTrip(() => t)
    await recompute(t)
  }, [recompute, updateTrip])

  const { amapKey, orsKey } = state.settings
  useEffect(() => { recompute() }, [recompute, amapKey, orsKey]) // 启动时与地图 Key 变更后重算步数/时间轴

  const ctx = {
    state,
    settings: state.settings,
    setSettings: (settings) => setState((s) => ({ ...s, settings })),
    setCollects: (collects) => setState((s) => ({ ...s, collects })),
    trip: state.trip,
    tab, setTab, planSub, setPlanSub,
    goTab: (key) => {
      setTab(key)
      if (key === 'plan') setPlanSub('main')
    },
    recomputing, recompute, loadTrip, updateTrip,
    patchTrip: (patch) => updateTrip((t) => ({ ...t, ...patch })),
    patchDay: (dayId, patch) => updateTrip((t) => ({ ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) })),
    patchStop: (dayId, stopId, patch) => updateTrip((t) => ({
      ...t,
      days: t.days.map((d) => d.id !== dayId ? d : { ...d, stops: d.stops.map((st) => (st.id === stopId ? { ...st, ...patch } : st)) }),
    })),
    addPoolPlace: (place) => updateTrip((t) => {
      const existing = t.pool.find((p) => p.name === place.name)
      if (existing) {
        // 同名景点合并：补齐空缺信息，不产生重复项
        return {
          ...t,
          pool: t.pool.map((p) => p.name !== place.name ? p : {
            ...p,
            kind: p.kind,
            stayMin: place.stayMin || p.stayMin,
            why: p.why || place.why,
            tips: p.tips || place.tips,
            area: p.area || place.area,
            lat: p.lat ?? place.lat,
            lng: p.lng ?? place.lng,
            checkin: { ...place.checkin, ...Object.fromEntries(Object.entries(p.checkin || {}).filter(([, v]) => v)) },
          }),
        }
      }
      return { ...t, pool: [...t.pool, { id: uid(), kind: 'optional', stayMin: 60, ...place }] }
    }),
    removePoolPlace: (id) => updateTrip((t) => ({ ...t, pool: t.pool.filter((p) => p.id !== id) })),
    setPoolKind: (id, kind) => updateTrip((t) => ({ ...t, pool: t.pool.map((p) => (p.id === id ? { ...p, kind } : p)) })),
    setTripDays: (days) => updateTrip((t) => ({ ...t, days })),
    addPhotos: async (dayId, stopId, files) => {
      for (const file of files) {
        const full = await fileToDataURL(file)
        const thumb = await makeThumb(full)
        const id = uid()
        await savePhoto({ id, full, thumb })
        updateTrip((t) => ({
          ...t,
          days: t.days.map((d) => d.id !== dayId ? d : {
            ...d,
            stops: d.stops.map((st) => st.id !== stopId ? st : { ...st, photos: [...(st.photos || []), { id, thumb }] }),
          }),
        }))
      }
    },
    setRefShot: async (dayId, stopId, file) => {
      const full = await fileToDataURL(file, 1200, 0.82)
      const thumb = await makeThumb(full)
      const id = uid()
      await savePhoto({ id, full, thumb })
      ctx.patchStop(dayId, stopId, { refShot: { id, thumb } })
    },
    removePhoto: async (dayId, stopId, photoId, kind = 'photo') => {
      try { await deletePhoto(photoId) } catch (e) { /* 照片可能已不存在 */ }
      updateTrip((t) => ({
        ...t,
        days: t.days.map((d) => d.id !== dayId ? d : {
          ...d,
          stops: d.stops.map((st) => {
            if (st.id !== stopId) return st
            if (kind === 'ref') return { ...st, refShot: null }
            return { ...st, photos: (st.photos || []).filter((p) => p.id !== photoId) }
          }),
        }),
      }))
    },
  }

  const tabs = [
    { key: 'plan', label: '规划台', ico: '🗺' },
    { key: 'journal', label: '计划本', ico: '📔' },
    { key: 'share', label: '展页', ico: '✨' },
  ]

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="seal">记</span>
          <span className="bserif">行记</span>
          <small>WalkNote</small>
        </div>
        <div className="trip-title" title={state.trip?.title}>{state.trip?.title}</div>
        <button className="ghost small" onClick={() => setSettingsOpen(true)}>
          ⚙ 设置{state.settings.apiKey ? '' : ' · 演示'}
        </button>
      </header>

      <main className="main">
        {tab === 'plan' && <PlanView ctx={ctx} />}
        {tab === 'journal' && <JournalView ctx={ctx} />}
        {tab === 'share' && <ShareView ctx={ctx} />}
      </main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => ctx.goTab(t.key)}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </div>
        ))}
      </nav>

      {settingsOpen && <SettingsModal ctx={ctx} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
