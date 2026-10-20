// H5 手记导出：单文件 HTML（照片 base64 内嵌），发文件即可分享
// 这是产品的分享飞轮起点：行后产物天然想被发出去，页脚即产品的签名

import { loadPhoto } from './storage'
import { tripStats, weekdayCN } from './geo'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

async function resolvePhotos(ids) {
  const map = {}
  for (const id of ids) {
    try {
      const p = await loadPhoto(id)
      if (p?.full) map[id] = p.full
    } catch (e) {
      // 单张读取失败不影响整体导出
    }
  }
  return map
}

export async function buildH5(trip) {
  const stats = tripStats(trip)
  const ids = []
  ;(trip.days || []).forEach((d) =>
    (d.stops || []).forEach((s) => {
      ;(s.photos || []).forEach((p) => ids.push(p.id))
      if (s.refShot?.id) ids.push(s.refShot.id)
    }),
  )
  const photos = await resolvePhotos(ids)
  const journal = trip.journal || { intro: '', captions: {} }

  const daySections = (trip.days || [])
    .map((d, i) => {
      const caption = journal.captions?.[d.id] || ''
      const stops = (d.stops || []).map((s) => stopBlock(s, photos)).join('')
      const steps = d.stats?.steps || 0
      return `<section class="day">
  <div class="day-head">
    <span class="day-no">第 ${i + 1} 天</span>
    <span class="day-date">${esc(d.date)} ${weekdayCN(d.date)}</span>
    ${steps ? `<span class="day-steps">≈ ${steps.toLocaleString()} 步</span>` : ''}
  </div>
  ${caption ? `<p class="day-caption">${esc(caption)}</p>` : ''}
  ${stops || '<p class="blank">留白日。走得最少的一天，往往记得最清楚。</p>'}
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(trip.title)} · 旅行手记</title>
<style>
  :root { --paper:#f4f1e8; --panel:#fffdf7; --ink:#26241d; --soft:#5f594c; --faint:#8d8676; --accent:#2f6a5e; --line:#e4ddc9; --gold:#b3822f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.75 -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 0 18px 56px; }
  .cover { text-align:center; padding: 64px 8px 40px; }
  .cover .kicker { color: var(--accent); letter-spacing: .5em; font-size: 12px; }
  .cover h1 { font-family: 'Songti SC','Noto Serif SC',Georgia,serif; font-size: 32px; margin: 14px 0 6px; letter-spacing: 2px; }
  .cover .dates { color: var(--faint); font-size: 13px; letter-spacing: 1px; }
  .stats { display:flex; justify-content:center; gap: 26px; margin-top: 26px; }
  .stats b { display:block; font-family:'Songti SC',Georgia,serif; font-size: 20px; }
  .stats span { font-size: 11px; color: var(--faint); }
  .intro { background: var(--panel); border:1px solid var(--line); border-radius: 12px; padding: 18px 20px; color: var(--soft); font-size: 14px; margin: 8px 0 34px; }
  .day { margin-bottom: 44px; }
  .day-head { display:flex; align-items:baseline; gap:10px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
  .day-no { font-family:'Songti SC',Georgia,serif; font-weight:700; font-size: 18px; }
  .day-date { color: var(--faint); font-size: 13px; }
  .day-steps { margin-left:auto; color: var(--accent); font-size: 13px; }
  .day-caption { color: var(--soft); font-size: 14px; margin: 14px 0 0; }
  .stop { margin-top: 26px; }
  .stop-head { display:flex; gap: 12px; align-items: baseline; }
  .time { font-family:'Songti SC',Georgia,serif; color: var(--gold); font-weight: 700; font-size: 15px; min-width: 48px; }
  .name { font-weight: 700; font-size: 16px; }
  .checkin { margin: 8px 0 0 60px; color: var(--soft); font-size: 13.5px; }
  .checkin p { margin: 3px 0; }
  .quote { color: var(--accent); font-family:'Songti SC',Georgia,serif; }
  .photos { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 0 60px; }
  .photos img { width:100%; border-radius: 8px; display:block; }
  .compare { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 0 60px; }
  .compare figure { margin:0; }
  .compare img { width:100%; border-radius: 8px; display:block; }
  .compare figcaption { text-align:center; font-size: 11px; color: var(--faint); margin-top: 4px; }
  .note { margin: 10px 0 0 60px; color: var(--soft); font-size: 13.5px; font-style: italic; }
  .blank { color: var(--faint); font-size: 14px; margin-top: 18px; }
  footer { text-align:center; color: var(--faint); font-size: 12px; margin-top: 30px; border-top: 1px dashed var(--line); padding-top: 20px; }
  footer b { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <div class="kicker">旅行手记</div>
    <h1>${esc(trip.title)}</h1>
    <div class="dates">${esc(trip.startDate)} — ${esc(trip.endDate)}</div>
    <div class="stats">
      <span><b>${stats.dayCount}</b>天</span>
      <span><b>${stats.stopCount}</b>个地点</span>
      <span><b>${stats.totalSteps.toLocaleString()}</b>步</span>
      <span><b>${stats.photoCount}</b>张照片</span>
    </div>
  </div>
  ${journal.intro ? `<p class="intro">${esc(journal.intro)}</p>` : ''}
  ${daySections || '<p class="blank">还没有行程内容。</p>'}
  <footer>由 <b>行记 WalkNote</b> 生成 · 不赶场的旅行计划本</footer>
</div>
</body>
</html>`
}

function stopBlock(stop, photos) {
  const c = stop.checkin || {}
  const own = (stop.photos || []).map((p) => photos[p.id]).filter(Boolean)
  const ref = stop.refShot?.id ? photos[stop.refShot.id] : null
  const checkinLines = [
    c.spot ? `<p>📷 机位 · ${esc(c.spot)}</p>` : '',
    c.composition ? `<p>🖼 构图 · ${esc(c.composition)}</p>` : '',
    c.pose ? `<p>🙆 姿势 · ${esc(c.pose)}</p>` : '',
    c.bestTime ? `<p>🕐 时段 · ${esc(c.bestTime)}</p>` : '',
    c.caption ? `<p class="quote">“${esc(c.caption)}”</p>` : '',
  ].join('')
  const compare =
    ref && own[0]
      ? `<div class="compare">
  <figure><img src="${ref}" alt="" /><figcaption>攻略参考</figcaption></figure>
  <figure><img src="${own[0]}" alt="" /><figcaption>我的打卡</figcaption></figure>
</div>`
      : ''
  const ownRest = ref && own[0] ? own.slice(1) : own
  return `<article class="stop">
  <div class="stop-head"><span class="time">${esc(stop.arrive || '')}</span><span class="name">${esc(stop.name)}</span></div>
  ${checkinLines ? `<div class="checkin">${checkinLines}</div>` : ''}
  ${compare}
  ${ownRest.length ? `<div class="photos">${ownRest.map((u) => `<img src="${u}" alt="" />`).join('')}</div>` : ''}
  ${stop.note ? `<p class="note">「${esc(stop.note)}」</p>` : ''}
</article>`
}

export function downloadFile(filename, text, mime = 'text/html;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
