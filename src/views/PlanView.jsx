import React, { useState } from 'react'
import { STEP_TIERS, TRANSPORT_MODES, newTrip, newLodging, demoTrip, demoShanghaiTrip, demoHakoneFujiTrip } from '../lib/storage'
import { fallbackPlan, stopFromPlace, fmtKm, legLinks, LEG_LABEL, MAP_SOURCE_LABEL, weekdayCN, dateRange } from '../lib/geo'
import { callLLM, extractJSON } from '../lib/api'
import { itineraryMessages } from '../lib/prompts'
import CollectView from './CollectView.jsx'
import { Field, Empty, Spinner, Tag, StepsBar } from '../components/ui.jsx'

export default function PlanView({ ctx }) {
  const { trip, settings } = ctx
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showTripForm, setShowTripForm] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const setSub = ctx.setPlanSub

  if (ctx.planSub === 'collect') return <CollectView ctx={ctx} onBack={() => setSub('main')} />

  const generate = async () => {
    if (!trip.pool.length) {
      setErr('景点池是空的：先「导入攻略」粘贴小红书内容，或手动添加景点')
      return
    }
    setBusy(true)
    setErr('')
    let days = null
    if (settings.apiKey) {
      try {
        const text = await callLLM(settings, itineraryMessages(trip), { temperature: 0.5 })
        const data = extractJSON(text)
        if (data?.days?.length) days = mapLLMDays(data, trip)
      } catch (e) {
        setErr('模型编排失败，已改用本地规则引擎兜底：' + e.message)
      }
    }
    if (!days) days = fallbackPlan(trip)
    ctx.setTripDays(days)
    await ctx.recompute()
    setBusy(false)
  }

  const clearDays = () => {
    if (!confirm('清空当前逐日行程？（景点池保留）')) return
    ctx.setTripDays([])
  }

  return (
    <>
      {!settings.apiKey && (
        <div className="banner info">
          演示模式：未配置模型 Key，行程编排使用「本地规则引擎」（必去优先 + 就近排序 + 步数校验）。在「设置」填入 Key 后切换为 AI 编排。
        </div>
      )}
      {err && <div className="banner error">{err}</div>}

      <section className="card">
        <div className="card-head">
          <h2>行程卡</h2>
          <button className="ghost small" onClick={() => setShowTripForm(!showTripForm)}>{showTripForm ? '收起' : '编辑'}</button>
        </div>
        <div className="kv">
          <span>{trip.startDate} — {trip.endDate} · {dateRange(trip.startDate, trip.endDate).length} 天</span>
          <span>{trip.city ? `城市：${trip.city}` : '城市：未设置'}</span>
          <span>住宿：{trip.lodging?.name || '未设置'}</span>
          <span>默认：{STEP_TIERS[trip.defaults.tier]?.label} · {TRANSPORT_MODES[trip.defaults.transportMode]?.label}</span>
        </div>
        {showTripForm && <TripForm ctx={ctx} />}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>景点池 <span className="cnt">{trip.pool.length}</span></h2>
          <div className="row-actions">
            <button className="small" onClick={() => setSub('collect')}>＋ 导入攻略</button>
            <button className="small" onClick={() => setManualOpen(!manualOpen)}>＋ 手动添加</button>
          </div>
        </div>
        {manualOpen && (
          <ManualPlaceForm
            onAdd={(p) => { ctx.addPoolPlace(p); setManualOpen(false) }}
            onCancel={() => setManualOpen(false)}
          />
        )}
        {trip.pool.length === 0 ? (
          <Empty big="景点池还是空的">把小红书攻略粘进「导入攻略」，AI 会解析出景点和打卡建议</Empty>
        ) : (
          trip.pool.map((p) => (
            <div className="pool-row" key={p.id}>
              <div className="pool-name">
                {p.name}
                {p.area && <small>{p.area}</small>}
              </div>
              <div className="kind-switch">
                <span className={`chip ${p.kind === 'must' ? 'chip-must' : ''}`} onClick={() => ctx.setPoolKind(p.id, 'must')}>必去</span>
                <span className={`chip ${p.kind === 'optional' ? 'chip-opt' : ''}`} onClick={() => ctx.setPoolKind(p.id, 'optional')}>次选</span>
              </div>
              <button className="ghost small" onClick={() => ctx.removePoolPlace(p.id)}>删</button>
            </div>
          ))
        )}
      </section>

      <div className="gen-row">
        <button className="primary big" disabled={busy || ctx.recomputing} onClick={generate}>
          {busy ? <><Spinner />编排中…</> : '按步数预算生成行程'}
        </button>
        {trip.days.length > 0 && <button className="ghost small" onClick={clearDays}>清空行程</button>}
      </div>

      {trip.days.map((day, di) => (
        <DayCard key={day.id} day={day} index={di} ctx={ctx} trip={trip} />
      ))}
    </>
  )
}

/* 把 LLM 返回的行程映射到本地数据结构：按日期对齐已有的天，保住 id 与手动改动 */
function mapLLMDays(data, trip) {
  const existing = trip.days || []
  return (data.days || []).map((d) => {
    const found = existing.find((e) => e.date === d.date)
    const date = d.date || found?.date
    if (!date) return null
    const stops = (d.stops || [])
      .map((s) => {
        const p = trip.pool.find((x) => x.name === s.name) || trip.pool.find((x) => s.name && x.name.includes(s.name))
        if (!p) return null
        return stopFromPlace(p, { stayMin: s.stayMin || p.stayMin })
      })
      .filter(Boolean)
    return {
      id: found?.id || 'day-' + date,
      date,
      dayStart: trip.defaults.dayStart,
      dayEnd: trip.defaults.dayEnd,
      tier: found?.tier || trip.defaults.tier,
      transportMode: found?.transportMode || trip.defaults.transportMode,
      note: '',
      stops,
    }
  }).filter(Boolean)
}

function TripForm({ ctx }) {
  const t = ctx.trip
  const set = (patch) => ctx.patchTrip(patch)
  return (
    <div className="form-block">
      <div className="grid cols2">
        <Field label="行程名称">
          <input value={t.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="城市" hint="境内填中文城市名（如 上海），用于高德公交换乘">
          <input value={t.city || ''} placeholder="如 上海 / 东京" onChange={(e) => set({ city: e.target.value })} />
        </Field>
      </div>
      <div className="grid cols2">
        <Field label="出发日期">
          <input type="date" value={t.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="返程日期">
          <input type="date" value={t.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
      </div>
      <div className="grid cols3">
        <Field label="默认住宿点">
          <input value={t.lodging?.name || ''} placeholder="如 新宿·酒店" onChange={(e) => set({ lodging: { ...t.lodging, name: e.target.value } })} />
        </Field>
        <Field label="纬度" hint="境内用高德坐标（GCJ-02）">
          <input value={t.lodging?.lat ?? ''} placeholder="35.6910" onChange={(e) => set({ lodging: { ...t.lodging, lat: parseFloat(e.target.value) || null } })} />
        </Field>
        <Field label="经度">
          <input value={t.lodging?.lng ?? ''} placeholder="139.6992" onChange={(e) => set({ lodging: { ...t.lodging, lng: parseFloat(e.target.value) || null } })} />
        </Field>
      </div>
      <div className="field">
        <label>住宿点清单（分段住宿用）</label>
        <div className="hint">换宿行程（如 东京 → 箱根 → 河口湖）：把每个住宿点加进清单，再在每天的「出发 / 当晚宿」里选择；单点住宿可只填上面的默认住宿</div>
      </div>
      {(t.lodgings || []).map((l, i) => (
        <div className="lodging-row-edit" key={l.id}>
          <input
            className="lg-name"
            value={l.name}
            placeholder={`住宿点 ${i + 1} 名称`}
            onChange={(e) => set({ lodgings: t.lodgings.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)) })}
          />
          <input
            className="lg-xy"
            value={l.lat ?? ''}
            placeholder="纬度"
            onChange={(e) => set({ lodgings: t.lodgings.map((x) => (x.id === l.id ? { ...x, lat: parseFloat(e.target.value) || null } : x)) })}
          />
          <input
            className="lg-xy"
            value={l.lng ?? ''}
            placeholder="经度"
            onChange={(e) => set({ lodgings: t.lodgings.map((x) => (x.id === l.id ? { ...x, lng: parseFloat(e.target.value) || null } : x)) })}
          />
          <button className="ghost small" onClick={() => set({ lodgings: t.lodgings.filter((x) => x.id !== l.id) })}>删</button>
        </div>
      ))}
      <div className="row-actions" style={{ marginBottom: 12 }}>
        <button className="small" onClick={() => set({ lodgings: [...(t.lodgings || []), newLodging()] })}>＋ 添加住宿点</button>
      </div>
      <div className="grid cols2">
        <Field label="每天出发时间">
          <input type="time" value={t.defaults.dayStart} onChange={(e) => set({ defaults: { ...t.defaults, dayStart: e.target.value } })} />
        </Field>
        <Field label="每天收尾时间">
          <input type="time" value={t.defaults.dayEnd} onChange={(e) => set({ defaults: { ...t.defaults, dayEnd: e.target.value } })} />
        </Field>
      </div>
      <div className="grid cols2">
        <Field label="默认步数档位">
          <select value={t.defaults.tier} onChange={(e) => set({ defaults: { ...t.defaults, tier: e.target.value } })}>
            {Object.entries(STEP_TIERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="默认交通档次">
          <select value={t.defaults.transportMode} onChange={(e) => set({ defaults: { ...t.defaults, transportMode: e.target.value } })}>
            {Object.entries(TRANSPORT_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="row-actions" style={{ flexWrap: 'wrap' }}>
        <button className="small" onClick={() => { if (confirm('新建空白行程会替换当前行程，确定？')) ctx.loadTrip(newTrip()) }}>新建空白行程</button>
        <button className="small" onClick={() => { if (confirm('载入「上海 4 天」演示会替换当前行程，确定？')) ctx.loadTrip(demoShanghaiTrip()) }}>载入上海演示</button>
        <button className="small" onClick={() => { if (confirm('载入「东京 5 天」演示会替换当前行程，确定？')) ctx.loadTrip(demoTrip()) }}>载入东京演示</button>
        <button className="small" onClick={() => { if (confirm('载入「箱根·富士山 5 天（分段住宿示例）」会替换当前行程，确定？')) ctx.loadTrip(demoHakoneFujiTrip()) }}>载入箱根·富士山（换宿示例）</button>
      </div>
    </div>
  )
}

function ManualPlaceForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ name: '', area: '', stayMin: 60, lat: '', lng: '', kind: 'optional' })
  const upd = (patch) => setForm((f) => ({ ...f, ...patch }))
  const submit = () => {
    if (!form.name.trim()) return
    onAdd({
      name: form.name.trim(),
      area: form.area,
      stayMin: Number(form.stayMin) || 60,
      lat: parseFloat(form.lat) || null,
      lng: parseFloat(form.lng) || null,
      kind: form.kind,
      source: '手动添加',
    })
  }
  return (
    <div className="form-block">
      <div className="grid cols2">
        <Field label="景点名">
          <input value={form.name} onChange={(e) => upd({ name: e.target.value })} placeholder="如 清水寺" />
        </Field>
        <Field label="区域">
          <input value={form.area} onChange={(e) => upd({ area: e.target.value })} placeholder="如 东山区" />
        </Field>
      </div>
      <div className="grid cols3">
        <Field label="建议停留（分钟）">
          <input type="number" value={form.stayMin} onChange={(e) => upd({ stayMin: e.target.value })} />
        </Field>
        <Field label="纬度" hint="境内用高德坐标（GCJ-02）">
          <input value={form.lat} onChange={(e) => upd({ lat: e.target.value })} placeholder="31.2075" />
        </Field>
        <Field label="经度">
          <input value={form.lng} onChange={(e) => upd({ lng: e.target.value })} placeholder="121.4370" />
        </Field>
      </div>
      <div className="row-actions">
        <span className={`chip ${form.kind === 'must' ? 'chip-must' : ''}`} onClick={() => upd({ kind: 'must' })}>必去</span>
        <span className={`chip ${form.kind === 'optional' ? 'chip-opt' : ''}`} onClick={() => upd({ kind: 'optional' })}>次选</span>
        <div className="spacer" />
        <button className="ghost small" onClick={onCancel}>取消</button>
        <button className="small" onClick={submit}>加入池子</button>
      </div>
    </div>
  )
}

function DayCard({ day, index, ctx, trip }) {
  const stats = day.stats || {}
  const poolAvailable = trip.pool.filter((p) => !day.stops.some((s) => s.placeId === p.id))
  const patchAndRecompute = (patch) => { ctx.patchDay(day.id, patch); ctx.recompute() }
  const moveStop = (i, dir) => {
    const stops = [...day.stops]
    const j = i + dir
    if (j < 0 || j >= stops.length) return
    ;[stops[i], stops[j]] = [stops[j], stops[i]]
    patchAndRecompute({ stops })
  }
  const removeStop = (i) => patchAndRecompute({ stops: day.stops.filter((_, k) => k !== i) })
  const addStop = (placeId) => {
    const p = trip.pool.find((x) => x.id === placeId)
    if (!p) return
    patchAndRecompute({ stops: [...day.stops, stopFromPlace(p)] })
  }

  const lodgings = trip.lodgings || []
  const lodgingOptions = (
    <>
      <option value="">默认 · {trip.lodging?.name || '未设置'}</option>
      {lodgings.map((l) => <option key={l.id} value={l.id}>{l.name || '未命名住宿'}</option>)}
    </>
  )

  return (
    <section className="card day-card">
      <div className="day-head">
        <div className="day-title"><b>第 {index + 1} 天</b> · {day.date} {weekdayCN(day.date)}{stats.changesLodging && <Tag tone="warn">换宿日</Tag>}</div>
        <div className="day-sel">
          <select value={day.tier} onChange={(e) => patchAndRecompute({ tier: e.target.value })}>
            {Object.entries(STEP_TIERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={day.transportMode} onChange={(e) => patchAndRecompute({ transportMode: e.target.value })}>
            {Object.entries(TRANSPORT_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      {(lodgings.length > 0 || day.startLodgingId || day.endLodgingId) && (
        <div className="lodging-row">
          <span>出发</span>
          <select value={day.startLodgingId || ''} onChange={(e) => patchAndRecompute({ startLodgingId: e.target.value || null })}>{lodgingOptions}</select>
          <span>当晚宿</span>
          <select value={day.endLodgingId || ''} onChange={(e) => patchAndRecompute({ endLodgingId: e.target.value || null })}>{lodgingOptions}</select>
        </div>
      )}
      <div className="day-time-row">
        <span>出发</span>
        <input type="time" value={day.dayStart || '09:00'} onChange={(e) => patchAndRecompute({ dayStart: e.target.value })} />
        <span>收尾</span>
        <input type="time" value={day.dayEnd || '21:00'} onChange={(e) => patchAndRecompute({ dayEnd: e.target.value })} />
      </div>

      <StepsBar steps={stats.steps || 0} budget={stats.budget || 20000} />
      <div className="day-meta">
        {day.stops.length
          ? `预计 ${day.dayStart} 出发，${stats.end || '—'} 结束 · 步行 ${fmtKm(stats.walkMeters || 0)}${stats.transitMin ? ` · 乘车约 ${stats.transitMin} 分钟` : ''}${stats.taxiCount ? ` · 打车 ${stats.taxiCount} 段` : ''}${MAP_SOURCE_LABEL[stats.mapSource] ? ' · ' + MAP_SOURCE_LABEL[stats.mapSource] : ''}`
          : '留白日（无安排）'}
      </div>
      {stats.over && (
        <div className="banner warn">
          超出本日步数预算 {(stats.steps - stats.budget).toLocaleString()} 步：可以删一个点、降交通档的步行量，或把点挪到留白日。
        </div>
      )}
      {stats.overTime && <div className="banner warn">预计时间超出每天的 {day.dayEnd} 收尾线，建议精简。</div>}

      <div className="timeline">
        {day.stops.map((s, i) => (
          <React.Fragment key={s.id}>
            {day.legs?.[i] && <LegRow leg={day.legs[i]} />}
            <div className="stop-row">
              <div className="stop-time">{s.arrive}</div>
              <div className="stop-main">
                <div className="stop-name">
                  {s.name} {s.kind === 'must' && <Tag tone="must">必去</Tag>}
                </div>
                <div className="stop-sub">
                  停留 {s.stayMin} 分钟{s.checkin?.spot ? ' · 已配打卡卡' : ''}
                </div>
              </div>
              <div className="stop-ops">
                <button className="ghost small" onClick={() => moveStop(i, -1)}>↑</button>
                <button className="ghost small" onClick={() => moveStop(i, 1)}>↓</button>
                <button className="ghost small" onClick={() => removeStop(i)}>✕</button>
              </div>
            </div>
          </React.Fragment>
        ))}
        {day.returnLeg && <LegRow leg={day.returnLeg} />}
      </div>

      <div className="day-foot">
        <select value="" onChange={(e) => e.target.value && addStop(e.target.value)}>
          <option value="">＋ 从景点池加一个点到这天…</option>
          {poolAvailable.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.kind === 'must' ? '（必去）' : ''}</option>
          ))}
        </select>
        <textarea
          className="day-note"
          rows={2}
          placeholder="当天备注：交通衔接、硬约束、订票提醒…"
          value={day.note || ''}
          onChange={(e) => ctx.patchDay(day.id, { note: e.target.value })}
        />
      </div>
    </section>
  )
}

function LegRow({ leg }) {
  const fromLabel = leg.from?.lodging ? (leg.from.name || '出发') : leg.from?.name || '上一站'
  const toLabel = leg.to?.lodging ? (leg.to.name || '当晚宿') : leg.to?.name || '下一站'
  const walkSteps = Math.round((leg.walkMeters || 0) / 0.74)
  const links = legLinks(leg)
  return (
    <div className="leg-row">
      <span className="leg-route">{fromLabel} → {toLabel}</span>
      <span className={`leg-type leg-${leg.type}`}>{LEG_LABEL[leg.type] || leg.type}</span>
      <span className="leg-info">
        {fmtKm(leg.meters)} · 步行 {fmtKm(leg.walkMeters || 0)} ≈ {walkSteps.toLocaleString()} 步
        {leg.type === 'transit' && ` · 乘车约 ${leg.transitMin} 分钟`}
        {leg.realTransit && ' · 实时换乘'}
        {leg.source === 'estimate' && ' · 估算'}
      </span>
      <span className="leg-links">
        {links.transit && <a href={links.transit} target="_blank" rel="noreferrer">查换乘</a>}
        {links.map && (
          <a href={links.map} target="_blank" rel="noreferrer">{links.provider === 'amap' ? '高德' : '地图'}</a>
        )}
      </span>
      {leg.warn && <div className="leg-warn">{leg.warn}</div>}
    </div>
  )
}
