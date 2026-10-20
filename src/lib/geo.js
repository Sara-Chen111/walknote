// 步数引擎：距离换算、分段交通决策、预算校验、时间轴推演
// 步行距离优先用 OpenRouteService 真实路网；未配置 key 时降级为直线距离 × 1.25（界面标注"估算"）

import { STEP_TIERS, TRANSPORT_MODES, uid } from './storage'

export const M_PER_STEP = 0.74 // 成人平均步幅（米）：1 万步 ≈ 7.4 km
export const WALK_SPEED = 1.25 // m/s ≈ 4.5 km/h

export const stepsFromMeters = (m) => Math.round(m / M_PER_STEP)
export const metersForSteps = (steps) => Math.round(steps * M_PER_STEP)
export const fmtKm = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m')

export function haversine(a, b) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

// 中国大陆范围粗判：境内走高德（GCJ-02 坐标），境外走 OpenRouteService（WGS-84）
export const inChina = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && lat > 3 && lat < 54 && lng > 73 && lng < 136

// 路线数据源选择：双点都在境内且有高德 Key → amap；有 ORS Key → ors；否则估算
export function pickProvider(provider, a, b) {
  if (provider?.amapKey && inChina(a?.lat, a?.lng) && inChina(b?.lat, b?.lng)) return 'amap'
  if (provider?.orsKey) return 'ors'
  return 'estimate'
}

const routeCache = new Map()
const transitCache = new Map()

const AMAP = 'https://restapi.amap.com/v3'
const amapCoord = (p) => `${p.lng},${p.lat}` // 高德接口是「经度,纬度」顺序

async function amapWalking(key, a, b) {
  const url = `${AMAP}/direction/walking?origin=${amapCoord(a)}&destination=${amapCoord(b)}&key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const dist = Number(data?.route?.paths?.[0]?.distance)
  if (data?.status !== '1' || !dist) return null
  return { meters: Math.round(dist), source: 'amap' }
}

async function orsWalking(key, a, b) {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const dist = data?.routes?.[0]?.summary?.distance
  return dist ? { meters: Math.round(dist), source: 'ors' } : null
}

export async function walkRoute(provider, a, b) {
  const mode = pickProvider(provider, a, b)
  const cacheKey = `${mode}|${a.lat},${a.lng}→${b.lat},${b.lng}`
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey)

  let result = null
  if (mode !== 'estimate' && a.lat && b.lat) {
    try {
      result = mode === 'amap' ? await amapWalking(provider.amapKey, a, b) : await orsWalking(provider.orsKey, a, b)
    } catch (e) {
      // 网络失败静默降级为估算
    }
  }
  if (!result) {
    const meters = Math.round(haversine(a, b) * 1.25)
    result = { meters, source: 'estimate' }
  }
  routeCache.set(cacheKey, result)
  return result
}

// 高德公交换乘：返回真实的接驳步行距离与乘车时长；无方案或境外返回 null（回落到公式估算）
export async function amapTransit(provider, a, b) {
  if (pickProvider(provider, a, b) !== 'amap' || !provider.city) return null
  const cacheKey = `${a.lat},${a.lng}→${b.lat},${b.lng}|${provider.city}`
  if (transitCache.has(cacheKey)) return transitCache.get(cacheKey)
  let result = null
  try {
    const url = `${AMAP}/direction/transit/integrated?origin=${amapCoord(a)}&destination=${amapCoord(b)}&city=${encodeURIComponent(provider.city)}&key=${encodeURIComponent(provider.amapKey)}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const t = data?.route?.transits?.[0]
      if (data?.status === '1' && t?.duration) {
        result = {
          walkMeters: Math.round(Number(t.walking_distance) || 0),
          transitMin: Math.round(Number(t.duration) / 60),
          source: 'amap',
        }
      }
    }
  } catch (e) {
    // 静默回落
  }
  transitCache.set(cacheKey, result)
  return result
}

// 单段交通决策：在步行上限内走路；超出则按交通档次选择换乘/打车
export function planLeg(meters, mode) {
  const cfg = TRANSPORT_MODES[mode] || TRANSPORT_MODES.transit
  if (meters <= cfg.walkMax) return { type: 'walk', walkMeters: meters, transitMin: 0, meters }
  if (mode === 'walk') {
    return { type: 'walk', walkMeters: meters, transitMin: 0, meters, warn: `单段步行 ${fmtKm(meters)}，超出舒适范围，建议拆天或改交通档` }
  }
  if (mode === 'taxi') {
    return { type: 'taxi', walkMeters: 80, transitMin: 0, meters }
  }
  // 公交地铁：含两端接驳步行；市内按 ≈15km/h 含候车换乘，城际（>20km，特急/新干线/高速巴士）按 ≈43km/h + 换乘缓冲
  const km = meters / 1000
  const transitMin = Math.round(km > 20 ? km * 1.4 + 15 : km * 4 + 8)
  return { type: 'transit', walkMeters: 500, transitMin, meters }
}

export const legMinutes = (leg) => {
  if (!leg) return 0
  const walkMin = Math.round((leg.walkMeters || 0) / WALK_SPEED / 60)
  if (leg.type === 'walk') return walkMin
  if (leg.type === 'transit') return (leg.transitMin || 0) + walkMin
  return Math.round(((leg.meters || 0) / 1000) * 2.5 + 3) + walkMin // 打车 ≈24km/h + 上车 3 分钟
}

export const toMinutes = (hhmm) => {
  const [h, m] = (hhmm || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const fromMinutes = (min) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`

// 逐日成本计算：出发地↔景点、景点↔景点、末站↔当晚宿 的每段步行距离 → 步数 → 与预算比对；同时推演到点时间
// day.lodging = 当天出发地，day.endLodging = 当晚住宿（分段住宿时两者不同；缺省都回落到行程默认住宿）
// provider = { amapKey, orsKey, city }：境内公交段优先取高德真实换乘数据，否则用公式估算
export async function annotateDay(day, provider = {}) {
  const stops = day.stops || []
  const asAnchor = (l, fallbackName) => (l?.lat ? { ...l, name: l.name || fallbackName, lodging: true } : null)
  const lodging = asAnchor(day.lodging, '住宿')
  const endLodging = asAnchor(day.endLodging, '当晚宿') || lodging
  const legs = []
  let walkMeters = 0
  let transitMin = 0
  let taxiCount = 0
  const sources = new Set()

  const addLeg = async (a, b) => {
    if (!a?.lat || !b?.lat) return null
    const r = await walkRoute(provider, a, b)
    let leg = { ...planLeg(r.meters, day.transportMode), source: r.source, from: a, to: b }
    if (leg.type === 'transit') {
      const real = await amapTransit(provider, a, b)
      if (real) leg = { ...leg, ...real, realTransit: true }
    }
    walkMeters += leg.walkMeters
    transitMin += leg.transitMin || 0
    if (leg.type === 'taxi') taxiCount++
    sources.add(leg.source)
    return leg
  }

  for (let i = 0; i < stops.length; i++) {
    legs.push(await addLeg(i === 0 ? lodging : stops[i - 1], stops[i]))
  }
  let returnLeg = null
  if (stops.length) {
    returnLeg = await addLeg(stops[stops.length - 1], endLodging)
  } else if (lodging && endLodging && (lodging.lat !== endLodging.lat || lodging.lng !== endLodging.lng)) {
    returnLeg = await addLeg(lodging, endLodging) // 纯移动日：没有景点，只有换宿
  }

  const budget = STEP_TIERS[day.tier]?.budget || 20000
  const steps = stepsFromMeters(walkMeters)
  const mapSource = sources.has('amap') ? 'amap' : sources.has('ors') ? 'ors' : 'estimate'
  const stats = {
    walkMeters, steps, budget, transitMin, taxiCount,
    over: steps > budget,
    estimate: mapSource === 'estimate',
    mapSource,
    hasLodging: !!lodging,
    changesLodging: !!(lodging && endLodging && (lodging.lat !== endLodging.lat || lodging.lng !== endLodging.lng)),
  }
  return computeTimeline({ ...day, legs, returnLeg, stats })
}

export function computeTimeline(day) {
  const stops = (day.stops || []).map((s) => ({ ...s }))
  let cursor = toMinutes(day.dayStart || '09:00')
  stops.forEach((s, i) => {
    const leg = day.legs?.[i]
    if (leg) cursor += legMinutes(leg)
    s.arrive = fromMinutes(cursor)
    cursor += s.stayMin || 60
  })
  if (day.returnLeg) cursor += legMinutes(day.returnLeg)
  const dayEnd = toMinutes(day.dayEnd || '21:00')
  return { ...day, stops, stats: { ...(day.stats || {}), end: fromMinutes(cursor), overTime: cursor > dayEnd } }
}

// 解析每天的出发地/当晚宿：day.startLodgingId / endLodgingId 指向 trip.lodgings，缺省回落到行程默认住宿
export function resolveDayLodging(trip, day) {
  const list = trip.lodgings || []
  const find = (id) => (id && list.find((l) => l.id === id)) || null
  return {
    lodging: find(day.startLodgingId) || trip.lodging || null,
    endLodging: find(day.endLodgingId) || trip.lodging || null,
  }
}

export async function recomputeTrip(trip, provider = {}) {
  const p = { ...provider, city: trip.city || '' }
  const days = []
  for (const d of trip.days || []) days.push(await annotateDay({ ...d, ...resolveDayLodging(trip, d) }, p))
  return { ...trip, days }
}

/* ---------------- 本地规则编排（无 Key 时的生成引擎，也是 LLM 失败时的兜底） ---------------- */

export const STOP_CAP_PER_DAY = 5

export function dateRange(startISO, endISO) {
  const out = []
  const start = new Date(startISO || Date.now())
  const end = new Date(endISO || startISO || Date.now())
  if (isNaN(start) || isNaN(end) || end < start) return [new Date().toISOString().slice(0, 10)]
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
    if (out.length > 30) break
  }
  return out
}

export function stopFromPlace(p, extra = {}) {
  return {
    id: uid(), placeId: p.id, name: p.name, lat: p.lat, lng: p.lng,
    stayMin: p.stayMin || 60, kind: p.kind || 'optional', checkin: { ...(p.checkin || {}) },
    refShot: null, photos: [], status: 'todo', note: '', ...extra,
  }
}

function orderByNearest(places, lodging) {
  const rest = [...places]
  const out = []
  let cur = lodging && lodging.lat ? lodging : null
  while (rest.length) {
    let best = 0
    if (cur) {
      let bestD = Infinity
      rest.forEach((p, idx) => {
        const d = p.lat && cur.lat ? haversine(cur, p) : idx
        if (d < bestD) { bestD = d; best = idx }
      })
    }
    const p = rest.splice(best, 1)[0]
    out.push(p)
    cur = p.lat ? p : cur
  }
  return out
}

export function fallbackPlan(trip) {
  const dates = dateRange(trip.startDate, trip.endDate)
  const must = trip.pool.filter((p) => p.kind === 'must')
  const optional = trip.pool.filter((p) => p.kind === 'optional')
  const buckets = dates.map(() => [])
  let cursor = 0
  const assign = (list) => list.forEach((p) => {
    for (let tryIdx = 0; tryIdx < dates.length * 2; tryIdx++) {
      const i = cursor % dates.length
      cursor++
      if (buckets[i].length < STOP_CAP_PER_DAY) { buckets[i].push(p); break }
    }
  })
  assign(must)
  assign(optional)
  return dates.map((date, i) => ({
    id: uid(),
    date,
    dayStart: trip.defaults.dayStart,
    dayEnd: trip.defaults.dayEnd,
    tier: trip.defaults.tier,
    transportMode: trip.defaults.transportMode,
    note: '',
    stops: orderByNearest(buckets[i], trip.lodging).map((p) => stopFromPlace(p)),
  }))
}

/* ---------------- 深链与统计 ---------------- */

export const gmapsDirLink = (a, b, mode = 'walking') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`

export const yahooTransitLink = (fromName, toName) =>
  `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}`

// 高德 URI API（网页版）：无需 Key，境内路段的核对入口
export const amapDirLink = (a, b, mode = 'walk') => {
  const pt = (p) => `${p.lng},${p.lat},${encodeURIComponent(p.name || '')}`
  return `https://uri.amap.com/navigation?from=${pt(a)}&to=${pt(b)}&mode=${mode}&coordinate=gaode&callnative=0`
}

// 按路段所在地域选择核对链接：境内走高德，境外走 Google Maps（日本公交另给 Yahoo!乗換案内）
export function legLinks(leg) {
  const { from, to, type } = leg
  if (!from?.lat || !to?.lat) return { map: null, transit: null, provider: null }
  if (inChina(from.lat, from.lng) && inChina(to.lat, to.lng)) {
    const mode = type === 'walk' ? 'walk' : type === 'taxi' ? 'car' : 'bus'
    return { map: amapDirLink(from, to, mode), transit: type === 'transit' ? amapDirLink(from, to, 'bus') : null, provider: 'amap' }
  }
  const mode = type === 'walk' ? 'walking' : type === 'taxi' ? 'driving' : 'transit'
  const transit = type === 'transit' && from.name && to.name && !from.lodging && !to.lodging ? yahooTransitLink(from.name, to.name) : null
  return { map: gmapsDirLink(from, to, mode), transit, provider: 'gmaps' }
}

export const LEG_LABEL = { walk: '步行', transit: '公交地铁', taxi: '打车' }
export const MAP_SOURCE_LABEL = { amap: '高德路网计算', ors: '真实路网计算', estimate: '距离为估算值' }

export const weekdayCN = (iso) =>
  ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(iso).getDay()] || ''

export function tripStats(trip) {
  const days = trip.days || []
  const places = (trip.pool || []).length
  let totalSteps = 0
  let totalWalk = 0
  let photoCount = 0
  let doneCount = 0
  let stopCount = 0
  days.forEach((d) => {
    totalSteps += d.stats?.steps || 0
    totalWalk += d.stats?.walkMeters || 0
    ;(d.stops || []).forEach((s) => {
      stopCount++
      photoCount += (s.photos || []).length
      if (s.status === 'done') doneCount++
    })
  })
  return { dayCount: days.length, places, stopCount, totalSteps, totalWalk, photoCount, doneCount }
}
