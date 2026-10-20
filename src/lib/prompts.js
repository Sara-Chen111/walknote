// 提示词模板：攻略解析员 / 行程编排员 / 打卡点评员 / 手记撰写员
// 约定：结构化任务一律要求纯 JSON 输出（解析失败有本地兜底），硬约束（步数、时间）由代码校验

export function guideParseMessages(raw) {
  return [
    {
      role: 'system',
      content: `你是旅行攻略解析员。用户会给你一段来自小红书等平台的旅行攻略（可能是正文、链接摘要或图片 OCR 文字）。
请从中提取"可执行的景点与打卡建议"，输出纯 JSON（不要任何解释文字），格式：
{
  "places": [
    {
      "name": "景点名（保留原文用词；口语化俗称也照收）",
      "area": "所在区域/商圈（没有就留空）",
      "stayMin": 建议停留分钟数（整数，没有依据就给 60）,
      "why": "一句话：为什么值得去",
      "checkin": {
        "spot": "推荐机位/拍摄点（原文没有就根据内容合理补全）",
        "composition": "构图建议",
        "pose": "姿势/动作建议",
        "bestTime": "最佳时段",
        "caption": "一句适合发朋友圈的文案（20 字内）"
      },
      "tips": "注意事项（排队/闭馆日/交通等，没有就留空）",
      "confidence": 0.0-1.0 的置信度（景点名越模糊越低）
    }
  ]
}
要求：只提取具体地点，过滤纯主观感想；同一地点不重复。`,
    },
    { role: 'user', content: `【攻略原文】\n${raw}\n\n请输出 JSON。` },
  ]
}

export function itineraryMessages(trip) {
  const pool = (trip.pool || []).map((p) => ({
    name: p.name, area: p.area, kind: p.kind, stayMin: p.stayMin, why: p.why,
  }))
  const constraints = {
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayStart: trip.defaults.dayStart,
    dayEnd: trip.defaults.dayEnd,
    stepTier: trip.defaults.tier,
    transportMode: trip.defaults.transportMode,
    lodging: trip.lodging?.name || '未设置',
  }
  return [
    {
      role: 'system',
      content: `你是行程编排员。根据约束把景点池安排进每一天，输出纯 JSON（不要解释文字），格式：
{ "days": [ { "date": "YYYY-MM-DD", "stops": [ { "name": "景点名", "stayMin": 整数, "reason": "一句话安排理由" } ] } ] }
硬性要求：
1) 必去（must）景点必须全部安排进行程；次选（optional）尽量安排；
2) 同一天内的景点必须地理上顺路（考虑住宿点位置），避免来回折返；
3) 每天安排的景点数量要考虑体力：慢充 1 万步档 2-3 个，标准 2 万步档 3-4 个，特种兵 3 万步档 5-6 个；
4) 天数与日期必须与约束中的起止日期一致；留白也是安排（不必塞满每一天）；
5) 景点名必须使用景点池中的原名，不要自行发明景点或编造营业时间。`,
    },
    {
      role: 'user',
      content: `【行程约束】\n${JSON.stringify(constraints, null, 2)}\n\n【景点池】\n${JSON.stringify(pool, null, 2)}\n\n请输出 JSON。`,
    },
  ]
}

export function photoReviewPrompt(placeName, checkin) {
  return `你是旅行打卡点评员。用户拍了一张"${placeName}"的打卡照。
该景点的攻略建议是：机位「${checkin?.spot || '未提供'}」，构图「${checkin?.composition || '未提供'}」，姿势「${checkin?.pose || '未提供'}」。
请看图后用 3-5 句话点评：① 和攻略建议的差距或呼应；② 构图/曝光/时机上最值得改进的一点；③ 一句鼓励。
语气像朋友，不要打分，不要长篇大论。`
}

export function journalMessages(trip, stats) {
  const days = (trip.days || []).map((d, i) => ({
    id: d.id,
    date: d.date,
    stops: (d.stops || []).map((s) => ({ name: s.name, photos: (s.photos || []).length, caption: s.checkin?.caption || '' })),
    steps: d.stats?.steps || 0,
  }))
  return [
    {
      role: 'system',
      content: `你是旅行手记撰写员。根据行程纪要写 H5 手记的文案，输出纯 JSON（不要解释文字），格式：
{ "intro": "整趟旅程的引言（60-120 字，有画面感、不浮夸）", "captions": { "天数 id": "该天配文（40-80 字，含当天地点名）" } }
要求：captions 的 key 必须是纪要里每天的原 id；语气是第一人称的旅行手记，不写攻略话术，不用"必去/打卡圣地"这类词。`,
    },
    {
      role: 'user',
      content: `【行程纪要】\n${JSON.stringify({ title: trip.title, days, totalSteps: stats?.totalSteps || 0 }, null, 2)}\n\n请输出 JSON。`,
    },
  ]
}
