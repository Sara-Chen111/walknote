import React, { useState } from 'react'
import { computeTimeline, fmtKm, weekdayCN } from '../lib/geo'
import { Empty, StepsBar, Lightbox } from '../components/ui.jsx'

// 计划本：一天一页。时间轴 + 打卡动作 + 上传打卡照 + 勾选完成
// 行中离线可用（数据在本机）；「今天」自动定位到当天页

export default function JournalView({ ctx }) {
  const { trip } = ctx
  const days = trip.days || []
  const today = new Date().toISOString().slice(0, 10)
  const todayIdx = days.findIndex((d) => d.date === today)
  const [dayIdx, setDayIdx] = useState(todayIdx >= 0 ? todayIdx : 0)
  const [lightbox, setLightbox] = useState(null)

  if (!days.length) {
    return <Empty big="还没有行程">先去「规划台」生成行程，计划本会自动排好每天一页</Empty>
  }

  const idx = Math.min(dayIdx, days.length - 1)
  const day = computeTimeline(days[idx])
  const stats = day.stats || {}
  const doneCount = day.stops.filter((s) => s.status === 'done').length

  return (
    <>
      <div className="day-chips">
        {days.map((d, i) => (
          <span key={d.id} className={`chip day-chip ${i === idx ? 'chip-active' : ''}`} onClick={() => setDayIdx(i)}>
            D{i + 1}
            <small>{d.date.slice(5)}{d.date === today ? ' · 今天' : ''}</small>
          </span>
        ))}
      </div>

      <section className="card day-page">
        <div className="day-head">
          <div className="day-title"><b>第 {idx + 1} 天</b> · {day.date} {weekdayCN(day.date)}</div>
          <div className="day-meta">
            ≈{(stats.steps || 0).toLocaleString()} 步 · {fmtKm(stats.walkMeters || 0)} · 已打卡 {doneCount}/{day.stops.length}
          </div>
        </div>
        <StepsBar steps={stats.steps || 0} budget={stats.budget || 20000} />
        {(day.legs?.[0]?.from?.name || day.returnLeg?.to?.name) && (
          <div className="lodging-view">
            🏨 {day.legs?.[0]?.from?.name || '—'} → 🛏 {day.returnLeg?.to?.name || '—'}
          </div>
        )}
        {day.note && <div className="day-note-view">{day.note}</div>}

        {day.stops.length === 0 && <Empty big="留白日">今天没有安排，睡到自然醒</Empty>}
        {day.stops.map((s) => (
          <JournalStop key={s.id} day={day} stop={s} ctx={ctx} onOpen={setLightbox} />
        ))}
      </section>

      {lightbox && <Lightbox id={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

function JournalStop({ day, stop, ctx, onOpen }) {
  const c = stop.checkin || {}
  const hasCheckin = c.spot || c.composition || c.pose || c.bestTime || c.caption
  const patch = (p) => ctx.patchStop(day.id, stop.id, p)

  const onFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length) ctx.addPhotos(day.id, stop.id, files)
    e.target.value = ''
  }
  const onRef = (e) => {
    const f = e.target.files?.[0]
    if (f) ctx.setRefShot(day.id, stop.id, f)
    e.target.value = ''
  }

  return (
    <div className={`jstop ${stop.status === 'done' ? 'done' : ''}`}>
      <div className="jstop-head">
        <span className="stop-time">{stop.arrive}</span>
        <span className="jstop-name">{stop.name}</span>
        <label className="done-check">
          <input
            type="checkbox"
            checked={stop.status === 'done'}
            onChange={(e) => patch({ status: e.target.checked ? 'done' : 'todo' })}
          />
          已打卡
        </label>
      </div>

      {hasCheckin ? (
        <div className="checkin-card">
          {c.spot && <div className="ci-row"><span className="ci-label">机位</span><span>{c.spot}</span></div>}
          {c.composition && <div className="ci-row"><span className="ci-label">构图</span><span>{c.composition}</span></div>}
          {c.pose && <div className="ci-row"><span className="ci-label">姿势</span><span>{c.pose}</span></div>}
          {c.bestTime && <div className="ci-row"><span className="ci-label">时段</span><span>{c.bestTime}</span></div>}
          {c.caption && <div className="ci-row"><span className="ci-label">文案</span><span className="quote">“{c.caption}”</span></div>}
        </div>
      ) : (
        <div className="ci-empty">这张打卡卡还是空的 · 去「规划台 → 导入攻略」获取机位建议</div>
      )}

      <div className="ref-line">
        {stop.refShot ? (
          <span className="ref-thumb">
            <img src={stop.refShot.thumb} alt="" onClick={() => onOpen(stop.refShot.id)} />
            <span>攻略参考</span>
            <button className="ghost small" onClick={() => ctx.removePhoto(day.id, stop.id, stop.refShot.id, 'ref')}>删</button>
          </span>
        ) : (
          <label className="upload-link">
            ＋ 上传攻略参考图（可做同款对比）
            <input type="file" accept="image/*" hidden onChange={onRef} />
          </label>
        )}
      </div>

      <div className="photo-grid">
        {(stop.photos || []).map((p) => (
          <div key={p.id} className="thumb-wrap">
            <img src={p.thumb} alt="" onClick={() => onOpen(p.id)} />
            <button className="thumb-del" onClick={() => ctx.removePhoto(day.id, stop.id, p.id)}>✕</button>
          </div>
        ))}
        <label className="thumb-add">
          ＋
          <input type="file" accept="image/*" multiple hidden onChange={onFiles} />
        </label>
      </div>

      <textarea
        className="note"
        rows={2}
        placeholder="随手记一句…（会出现在 H5 手记里）"
        value={stop.note || ''}
        onChange={(e) => patch({ note: e.target.value })}
      />
    </div>
  )
}
