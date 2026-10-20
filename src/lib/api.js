// LLM 客户端：OpenAI 兼容协议直连（BYOK，Key 仅存本地）
// 未配置 Key 时自动进入演示模式（返回内置示例，保证产品流程完整可体验）
// 行程编排的兜底不走这里——见 geo.js 的本地规则引擎 fallbackPlan

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function callLLM(settings, messages, { temperature = 0.7 } = {}) {
  if (!settings.apiKey) return mockComplete(messages)
  const res = await fetch(settings.endpoint.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature,
      stream: false,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`模型接口返回 ${res.status}：${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('模型返回为空，请检查模型名称是否正确')
  return content
}

export async function callVision(settings, prompt, images, { temperature = 0.4 } = {}) {
  if (!settings.apiKey || !settings.visionModel) return sleep(700).then(() => DEMO.visionReview)
  const content = [
    { type: 'text', text: prompt },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
  const res = await fetch(settings.endpoint.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.visionModel,
      messages: [{ role: 'user', content }],
      temperature,
      stream: false,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`视觉模型返回 ${res.status}：${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const out = data?.choices?.[0]?.message?.content
  if (!out) throw new Error('视觉模型返回为空，请检查视觉模型名称是否正确')
  return out
}

export async function testConnection(settings) {
  await callLLM(settings, [{ role: 'user', content: '请只回复两个字：连接' }], { temperature: 0 })
  return true
}

export function extractJSON(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const start = body.search(/[[{]/)
  if (start < 0) return null
  const open = body[start]
  const end = body.lastIndexOf(open === '{' ? '}' : ']')
  if (end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch (e) {
    return null
  }
}

/* ---------------- 演示模式 ---------------- */

function mockComplete(messages) {
  const user = messages.find((m) => m.role === 'user')?.content || ''
  return sleep(700).then(() => {
    if (user.includes('【攻略原文】')) return DEMO.guideParse
    if (user.includes('【行程纪要】')) return demoJournal(user)
    return '（演示模式：当前未配置 API Key，返回的是内置示例。请在「设置」中填入 Key 后获得真实生成。）'
  })
}

// 演示模式的手记撰写：从传入的行程纪要里读出真实天数与地点，生成对应文案
function demoJournal(userContent) {
  const data = extractJSON(userContent)
  if (!data?.days) return JSON.stringify(DEMO.journal)
  const intro = `${data.title || '这趟旅程'}，${data.days.length} 天，约 ${(data.totalSteps || 0).toLocaleString()} 步。不赶场，把攻略里的机位一个个走成了自己的照片。`
  const captions = {}
  data.days.forEach((d, i) => {
    const names = (d.stops || []).map((s) => s.name)
    if (!names.length) {
      captions[d.id] = `第 ${i + 1} 天 · ${d.date}：留白日。睡到自然醒，走得最少的一天往往记得最清楚。`
    } else {
      captions[d.id] = `第 ${i + 1} 天 · ${d.date}：${names.join(' → ')}。${d.steps ? `这天走了约 ${Number(d.steps).toLocaleString()} 步。` : ''}`
    }
  })
  return JSON.stringify({ intro, captions })
}

const DEMO = {
  guideParse: JSON.stringify({
    places: [
      {
        name: '浅草寺',
        area: '台东区',
        stayMin: 90,
        why: '东京最古老的寺庙，清晨的雷门值得专程',
        checkin: {
          spot: '雷门与五重塔之间，靠石灯笼低角度仰拍',
          composition: '对称构图，五重塔放右上三分线',
          pose: '逆光剪影，抬手回望',
          bestTime: '7:00-8:30 人最少',
          caption: '雷门前的风，比攻略里温柔',
        },
        tips: '仲见世商店街 9 点后才热闹，想拍空街必须早到',
        confidence: 0.95,
      },
      {
        name: '東京スカイツリー',
        area: '墨田区',
        stayMin: 60,
        why: '不上塔也值得，隅田公园河岸视角免费',
        checkin: {
          spot: '隅田公園河岸，把塔与倒影一起收进画面',
          composition: '低机位贴近水面，横构图上方留白',
          pose: '侧身仰头看塔，手扶栏杆',
          bestTime: '日落前 30 分钟到蓝调时刻',
          caption: '塔比想象中更温柔',
        },
        tips: '浅草寺步行到河边约 15 分钟，可同天串联',
        confidence: 0.9,
      },
    ],
  }),
  visionReview: `（演示模式·打卡点评）这张照片的主体清楚，水平线基本平。两个小建议：① 画面前景稍空，可以往左挪半步，把石灯笼带进左下角做前景层次；② 曝光略亮，天空的高光有点溢出，拍摄时把曝光补偿压 0.3 档，蓝调时刻的颜色会更浓。整体已经很有旅行的呼吸感，保持这个感觉。`,
  journal: {
    intro: '五天四晚，把攻略里的机位一个个走成了自己的照片。',
    captions: {
      0: '第 1 天：築地場外市場 → 銀座。玉子烧和清晨的蒸汽。',
      1: '第 2 天：浅草寺 → 東京スカイツリー → 上野公園·アメ横。走得最多的一天，雷门前的空街值得早起。',
      2: '第 3 天：明治神宮 → 竹下通り → 渋谷。在城市中央走进一段森林，再走进全世界最忙的路口。',
      3: '第 4 天：新宿御苑 → 秋葉原。红叶和霓虹，一天装下两种颜色。',
      4: '第 5 天：留白日。走得最少的一天，往往记得最清楚。',
    },
  },
}
