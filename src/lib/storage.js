// 本地优先存储：行程数据存 localStorage；打卡照片与参考图存 IndexedDB（界面只持有缩略图）
// 首次打开自动载入演示行程（东京 5 天 · 海外 / 上海 4 天 · 国内），保证不配置任何 Key 也能完整体验全流程

const KEY = 'walknote-state-v1'
const PHOTO_DB = 'walknote-photos'
const PHOTO_STORE = 'photos'

const randHex = (n) => {
  const bytes = new Uint8Array(n)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const uid = () =>
  'id-' + (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : randHex(8) + '-' + Date.now().toString(36))

export const STEP_TIERS = {
  low: { label: '1 万步 · 慢充', budget: 10000 },
  mid: { label: '2 万步 · 标准', budget: 20000 },
  high: { label: '3 万步 · 特种兵', budget: 30000 },
}

export const TRANSPORT_MODES = {
  walk: { label: '纯步行', walkMax: 2500 },
  transit: { label: '公交地铁 + 步行', walkMax: 1500 },
  taxi: { label: '打车为主', walkMax: 600 },
}

export function defaultSettings() {
  return {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4-flash',
    visionModel: 'glm-4v-flash',
    amapKey: '',
    orsKey: '',
  }
}

export const ENDPOINT_PRESETS = [
  { name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', visionModel: 'glm-4v-flash' },
  { name: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-chat', visionModel: '' },
  { name: 'Kimi (月之暗面)', endpoint: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', visionModel: 'moonshot-v1-8k-vision-preview' },
]

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // 新增的设置项（如 amapKey）用默认值补齐，老数据无缝升级
      return {
        trip: saved.trip || demoTrip(),
        collects: saved.collects || [],
        settings: { ...defaultSettings(), ...(saved.settings || {}) },
      }
    }
  } catch (e) {
    console.warn('读取本地数据失败，改用演示数据', e)
  }
  return { trip: demoTrip(), collects: [], settings: defaultSettings() }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.error('保存失败（可能是存储空间已满）', e)
  }
}

const isoAfter = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function newTrip() {
  return {
    id: uid(),
    title: '我的旅行',
    city: '',
    startDate: isoAfter(7),
    endDate: isoAfter(11),
    lodging: { name: '', lat: null, lng: null },
    lodgings: [],
    defaults: { tier: 'mid', transportMode: 'transit', dayStart: '09:00', dayEnd: '21:00' },
    pool: [],
    days: [],
    journal: { intro: '', captions: {} },
  }
}

export function newLodging(name = '', lat = null, lng = null) {
  return { id: uid(), name, lat, lng }
}

/* ---------------- 演示行程：东京 5 天 ---------------- */

export function demoTrip() {
  const places = [
    {
      name: '浅草寺', area: '台东区', lat: 35.7148, lng: 139.7967, kind: 'must', stayMin: 90,
      why: '东京最古老的寺庙，清晨的雷门值得专程',
      checkin: { spot: '雷门与五重塔之间，靠石灯笼低角度仰拍', composition: '对称构图，五重塔放右上三分线', pose: '逆光剪影，抬手回望', bestTime: '7:00-8:30 人最少', caption: '雷门前的风，比攻略里温柔' },
      tips: '仲见世商店街 9 点后才热闹，想拍空街必须早到',
    },
    {
      name: '東京スカイツリー', area: '墨田区', lat: 35.7101, lng: 139.8107, kind: 'optional', stayMin: 60,
      why: '不上塔也值得，隅田公园河岸视角免费',
      checkin: { spot: '隅田公園河岸，把塔与倒影一起收进画面', composition: '低机位贴近水面，横构图上方留白', pose: '侧身仰头看塔，手扶栏杆', bestTime: '日落前 30 分钟到蓝调时刻', caption: '塔比想象中更温柔', },
      tips: '浅草寺步行到河边约 15 分钟，可同天串联',
    },
    {
      name: '上野公園·アメ横', area: '台东区', lat: 35.7106, lng: 139.7747, kind: 'optional', stayMin: 75,
      why: '博物馆群 + 市井商店街，补给好去处',
      checkin: { spot: 'アメ横入口招牌下，人流做前景', composition: '竖构图，招牌压在顶部三分之一', pose: '边走边回头抓拍', bestTime: '11:00 前后摊位全开', caption: '烟火气最浓的一段街' },
      tips: '周末人流极大，工作日更舒服',
    },
    {
      name: '明治神宮', area: '涩谷区', lat: 35.6764, lng: 139.6993, kind: 'must', stayMin: 80,
      why: '城市中央的一片森林，11 月银杏正好',
      checkin: { spot: '南参道大鸟居正下方，广角贴地拍', composition: '鸟居占满上半部，人物站中线远端', pose: '站定回望，或合掌侧影', bestTime: '8 点前光斜、人少', caption: '在城市中央，走进一段森林' },
      tips: '参道是石子路，穿好走的鞋',
    },
    {
      name: '竹下通り', area: '原宿', lat: 35.6717, lng: 139.7030, kind: 'optional', stayMin: 50,
      why: '原宿文化街，和明治神宫一街之隔',
      checkin: { spot: '巷口彩色招牌前，长焦压缩背景', composition: '竖构图让招牌填满画面', pose: '手拿可丽饼自然走动', bestTime: '10:00 开店后人渐多', caption: '彩色招牌下的甜味' },
      tips: '和明治神宫动线天然顺路，先宫后街',
    },
    {
      name: '渋谷スクランブル交差点', area: '涩谷区', lat: 35.6595, lng: 139.7005, kind: 'must', stayMin: 50,
      why: '全世界最忙的路口，蓝调时刻必看',
      checkin: { spot: '站前楼上咖啡馆窗口俯拍十字路口', composition: '俯拍人流对角线，等绿灯一次放行', pose: '人群中央停一秒抓拍', bestTime: '17:30 后蓝调时刻', caption: '全世界最忙的路口，我站了十秒' },
      tips: 'SHIBUYA SKY 展望台需提前网上预约',
    },
    {
      name: '新宿御苑', area: '新宿区', lat: 35.6852, lng: 139.7100, kind: 'optional', stayMin: 90,
      why: '11 月红叶与银杏的双料庭院',
      checkin: { spot: '日本庭园湖边，用枫叶当前景框住湖面', composition: '前景虚化 + 湖面倒影二分', pose: '坐在长椅侧身看湖', bestTime: '开园 9:00 即入，光线柔和', caption: '一片叶子掉进湖心的时间' },
      tips: '周一闭园，出发前确认',
    },
    {
      name: '築地場外市場', area: '中央区', lat: 35.6654, lng: 139.7707, kind: 'must', stayMin: 70,
      why: '玉子烧和海胆的早晨，9 点最鲜',
      checkin: { spot: '老铺挂帘前，蒸汽做氛围', composition: '平视近景，把挂帘和暖帘字拍全', pose: '捧碗低头，热气挡半张脸', bestTime: '9:00-11:00 店家刚开', caption: '玉子烧和清晨的蒸汽' },
      tips: '多数店只开到中午，务必上午去',
    },
    {
      name: '銀座', area: '中央区', lat: 35.6717, lng: 139.7650, kind: 'optional', stayMin: 60,
      why: '傍晚的银座大街，橱窗灯光刚好',
      checkin: { spot: '四丁目十字路口，视线沿街拉出纵深', composition: '长焦压缩街景，路灯做点线', pose: '背对镜头走向路口', bestTime: '17:00 亮灯后', caption: '橱窗亮起时，城市换了一种语言' },
      tips: '周末下午中央通步行者天国，可在马路中间拍照',
    },
    {
      name: '秋葉原', area: '千代田区', lat: 35.6984, lng: 139.7731, kind: 'optional', stayMin: 70,
      why: '电器街与动漫文化的密度巅峰',
      checkin: { spot: '中央通高架下，霓虹招牌当背景', composition: '海报墙前平视，人物在一侧留白', pose: '举相机互拍', bestTime: '19:00 后霓虹全亮', caption: '这里连空气都亮着' },
      tips: '和上野公园可同日串联，地铁两站',
    },
  ]

  return buildDemoTrip({
    title: '东京 5 天 · 演示行程',
    city: '东京',
    startDate: '2026-11-05',
    endDate: '2026-11-09',
    lodging: { name: '新宿站附近', lat: 35.6896, lng: 139.7006 },
    places,
    plan: [
      { date: '2026-11-05', tier: 'mid', transportMode: 'transit', stops: ['築地場外市場', '銀座'] },
      { date: '2026-11-06', tier: 'high', transportMode: 'transit', stops: ['浅草寺', '東京スカイツリー', '上野公園·アメ横', '秋葉原'] },
      { date: '2026-11-07', tier: 'mid', transportMode: 'transit', stops: ['明治神宮', '竹下通り', '渋谷スクランブル交差点'] },
      { date: '2026-11-08', tier: 'low', transportMode: 'walk', stops: ['新宿御苑'] },
      { date: '2026-11-09', tier: 'mid', transportMode: 'taxi', stops: [] },
    ],
  })
}

/* ---------------- 演示行程：上海 4 天（国内 · 高德坐标 GCJ-02） ---------------- */

export function demoShanghaiTrip() {
  const places = [
    {
      name: '南京东路步行街', area: '黄浦区', lat: 31.2353, lng: 121.4800, kind: 'must', stayMin: 60,
      why: '上海最经典的开场，一路走到外滩',
      checkin: { spot: '世纪广场钟楼下，长焦压缩人流', composition: '竖构图，纵深拉到远处霓虹招牌', pose: '独行背影，或牵手回望', bestTime: '19:00 后霓虹全亮', caption: '霓虹亮起来的时候，整条街都在发光' },
      tips: '周末人流极大，拍摄注意脚下；工作日傍晚更从容',
    },
    {
      name: '外滩', area: '黄浦区', lat: 31.2397, lng: 121.4903, kind: 'must', stayMin: 80,
      why: '对岸三件套与万国建筑群同框，蓝调时刻必看',
      checkin: { spot: '陈毅广场沿江栏杆第二段，东方明珠放左上', composition: '横构图三等分，江面留一分', pose: '侧身倚栏杆看对岸', bestTime: '日落后 30 分钟蓝调时刻', caption: '对岸的灯，替我说了晚安' },
      tips: '22:00 后景观灯熄灭，别去太晚',
    },
    {
      name: '豫园·城隍庙', area: '黄浦区', lat: 31.2270, lng: 121.4921, kind: 'must', stayMin: 90,
      why: '九曲桥与湖心亭，灯笼初亮时最有味道',
      checkin: { spot: '九曲桥中段拱桥位，湖心亭做背景', composition: '对称构图，屋檐压顶部三分线', pose: '提一盏灯笼的侧影', bestTime: '16:00-18:00 灯笼初亮', caption: '一桥九曲，走到哪里都是檐角' },
      tips: '豫园园区周一闭园，城隍庙街区全天开放',
    },
    {
      name: '静安寺', area: '静安区', lat: 31.2249, lng: 121.4455, kind: 'optional', stayMin: 50,
      why: '金顶与车流同框，城市与古刹的反差',
      checkin: { spot: '久光百货门前天桥，金顶与车流同框', composition: '长焦压缩，金顶居右上', pose: '无人物，纯建筑', bestTime: '傍晚亮灯后', caption: '金色屋顶下面是车水马龙' },
      tips: '寺内拍照注意避开佛像',
    },
    {
      name: '武康路·安福路', area: '徐汇区', lat: 31.2075, lng: 121.4370, kind: 'must', stayMin: 90,
      why: '梧桐区慢充日，武康大楼是必拍的一张',
      checkin: { spot: '武康大楼斜对面路口，等红灯时的人流做前景', composition: '竖构图，大楼弧线占满右侧', pose: '骑行或散步抓拍', bestTime: '09:00 前光斜、人少', caption: '梧桐叶落在肩膀上的那条路' },
      tips: '网红机位周末排队，工作日早晨几乎不用等',
    },
    {
      name: '徐家汇书院', area: '徐汇区', lat: 31.1946, lng: 121.4376, kind: 'optional', stayMin: 60,
      why: '一个上午交给书架，雨天备选',
      checkin: { spot: '三层中庭楼梯转角，仰拍书架长廊', composition: '对称 + 引导线', pose: '拿一本书低头走过', bestTime: '09:00 开馆刚入场', caption: '把一个上午交给书架' },
      tips: '馆内禁用三脚架',
    },
    {
      name: '上海博物馆·人民广场', area: '黄浦区', lat: 31.2286, lng: 121.4747, kind: 'optional', stayMin: 90,
      why: '青铜器与鸽子共享一个广场',
      checkin: { spot: '北门石阶回望人民大道', composition: '对称构图压中轴线', pose: '石阶坐姿远景', bestTime: '闭馆前 1 小时人最少', caption: '青铜器与鸽子共享一个广场' },
      tips: '需公众号预约，周一闭馆',
    },
    {
      name: '新天地', area: '黄浦区', lat: 31.2220, lng: 121.4692, kind: 'optional', stayMin: 60,
      why: '石库门砖拱里的新上海下午',
      checkin: { spot: '石库门弄堂砖拱下', composition: '框架构图，砖拱做前景', pose: '弄堂中回眸', bestTime: '下午茶时间光线最柔', caption: '石库门里装着新上海的下午' },
      tips: '',
    },
    {
      name: '田子坊', area: '黄浦区', lat: 31.2103, lng: 121.4692, kind: 'optional', stayMin: 70,
      why: '弄堂二楼露台俯拍巷道，和新天地顺路',
      checkin: { spot: '弄堂二楼咖啡馆露台，俯拍巷道纵深', composition: '俯拍巷道对角线', pose: '露台咖啡杯做前景', bestTime: '工作日下午', caption: '巷子再窄，也装得下一下午' },
      tips: '周末限流，工作日从容',
    },
    {
      name: '陆家嘴·三件套', area: '浦东新区', lat: 31.2397, lng: 121.4998, kind: 'must', stayMin: 60,
      why: '天桥环形步道免费，比观景台出片',
      checkin: { spot: '陆家嘴天桥环形步道，三件套仰拍', composition: '竖构图超广角，三栋楼呈放射', pose: '仰头伸手贴楼', bestTime: '日落前后，顺光转蓝调', caption: '抬头，脖子交给上海天际线' },
      tips: '天桥环形步道免费开放',
    },
    {
      name: '苏州河·四行仓库', area: '静安区', lat: 31.2472, lng: 121.4660, kind: 'optional', stayMin: 50,
      why: '弹孔墙对岸的河滨步道，安静的一段路',
      checkin: { spot: '仓库西墙对岸河滨步道，拍完整弹孔墙', composition: '正面平视横构图', pose: '无人物，墙即主角', bestTime: '上午顺光', caption: '河这边是 2026，河那边是 1937' },
      tips: '纪念馆需预约，外墙随时可拍',
    },
  ]

  return buildDemoTrip({
    title: '上海 4 天 · 演示行程',
    city: '上海',
    startDate: '2026-11-05',
    endDate: '2026-11-08',
    lodging: { name: '人民广场附近', lat: 31.2323, lng: 121.4691 },
    places,
    plan: [
      { date: '2026-11-05', tier: 'mid', transportMode: 'transit', stops: ['南京东路步行街', '外滩', '豫园·城隍庙'] },
      { date: '2026-11-06', tier: 'low', transportMode: 'transit', stops: ['武康路·安福路', '徐家汇书院'] },
      { date: '2026-11-07', tier: 'mid', transportMode: 'transit', stops: ['上海博物馆·人民广场', '新天地', '田子坊'] },
      { date: '2026-11-08', tier: 'high', transportMode: 'transit', stops: ['静安寺', '陆家嘴·三件套', '苏州河·四行仓库'] },
    ],
  })
}

/* ---------------- 示例行程：箱根·富士山 5 天（分段住宿 · 东京→箱根→河口湖→羽田） ---------------- */
// 演示「换宿行程」：东京 2 晚（新宿）→ 箱根温泉 1 晚（汤本）→ 河口湖 1 晚 → 回羽田。下午抵达、下午航班离境
// 坐标 WGS-84（境外走 ORS / 估算）。日期为示例，班次、营业时间均为规划窗口，出发前核对

export function demoHakoneFujiTrip() {
  const lodgings = [
    { id: 'lod-shinjuku', name: '新宿·酒店（西口/都厅侧）', lat: 35.6910, lng: 139.6992 },
    { id: 'lod-hakone', name: '箱根湯本·温泉旅館', lat: 35.2327, lng: 139.1067 },
    { id: 'lod-kawaguchi', name: '河口湖·富士見の宿', lat: 35.5068, lng: 138.7663 },
    { id: 'lod-haneda', name: '羽田机场·第 3 航站楼', lat: 35.5494, lng: 139.7798 },
  ]

  const places = [
    {
      name: '東京都庁展望台', area: '新宿', lat: 35.6844, lng: 139.6931, kind: 'must', stayMin: 60,
      why: '免费 202 米夜景，落地当天最省力的「看一眼东京」',
      checkin: { spot: '南展望室靠西侧窗，新宿楼群做前景，晴天远处是富士山轮廓', composition: '广角贴窗，楼群占下三分之二、天空留一分', pose: '背对镜头看窗外，手扶玻璃', bestTime: '16:30 日落后进入蓝调时刻（11 月下旬东京日落约 16:30）', caption: '第一天，在 202 米的窗前认了一下明天要去的方向' },
      tips: '南展望室开到 22:00（北展望室 17:30 关），免费；入口安检简单；周二正常开放',
    },
    {
      name: '思い出横丁', area: '新宿西口', lat: 35.6935, lng: 139.6994, kind: 'optional', stayMin: 60,
      why: '一条巷子的东京烟火，落地日的晚餐',
      checkin: { spot: '巷口红灯笼下，烤串摊蒸汽做氛围', composition: '竖构图，灯笼压顶部、人物在巷道中央', pose: '坐吧台捧碗，侧脸对蒸汽', bestTime: '19:00-21:00 最热闹', caption: '一条巷子，装下了第一晚的东京' },
      tips: '多数店只收现金；人多时顺着巷子换一家即可',
    },
    {
      name: '明治神宮', area: '涩谷区', lat: 35.6764, lng: 139.6993, kind: 'must', stayMin: 80,
      why: '城市中央的一片森林，11 月下旬外苑银杏正好',
      checkin: { spot: '南参道大鸟居正下方，广角贴地拍', composition: '鸟居占满上半部，人物站中线远端', pose: '站定回望，或合掌侧影', bestTime: '8 点前光斜、人少', caption: '在城市中央，走进一段森林' },
      tips: '参道是石子路，穿好走的鞋；从新宿南下两站即到原宿',
    },
    {
      name: '竹下通り', area: '原宿', lat: 35.6717, lng: 139.7030, kind: 'optional', stayMin: 90,
      why: '原宿文化街，和明治神宫一街之隔，顺带解决午餐',
      checkin: { spot: '巷口彩色招牌前，长焦压缩背景', composition: '竖构图让招牌填满画面', pose: '手拿可丽饼自然走动', bestTime: '10:00 开店后人渐多', caption: '彩色招牌下的甜味' },
      tips: '先宫后街，动线天然顺路',
    },
    {
      name: '渋谷スクランブル交差点', area: '涩谷区', lat: 35.6595, lng: 139.7005, kind: 'must', stayMin: 240,
      why: '全世界最忙的路口：下午逛商圈、咖啡等蓝调、路口收尾再吃晚饭',
      checkin: { spot: '站前楼上咖啡馆窗口俯拍十字路口', composition: '俯拍人流对角线，等绿灯一次放行', pose: '人群中央停一秒抓拍', bestTime: '16:30 后蓝调时刻', caption: '全世界最忙的路口，我站了十秒' },
      tips: 'SHIBUYA SKY 展望台需提前网上预约，不预约就在路口和天桥拍；忠犬八公像在站前',
    },
    {
      name: '箱根強羅', area: '箱根', lat: 35.2403, lng: 139.0245, kind: 'optional', stayMin: 40,
      why: '登山铁道终点、缆车起点，箱根环线的真正起点',
      checkin: { spot: '強羅駅前坡道回望登山电车进站', composition: '斜坡做引导线，红色车厢在画面上三分', pose: '背包侧身等车', bestTime: '上午到达时', caption: '从这一站开始，往山里走' },
      tips: '新宿→箱根湯本 浪漫特快约 85 分钟 → 登山铁道约 40 分钟到強羅；箱根周游券（Hakone Free Pass）两日券覆盖登山铁道/缆车/空中缆车/海贼船/巴士，在新宿小田急窗口买',
    },
    {
      name: '大涌谷', area: '箱根', lat: 35.2525, lng: 139.0248, kind: 'must', stayMin: 60,
      why: '火山口的硫磺蒸汽与黑玉蛋，晴天正对富士山',
      checkin: { spot: '大涌谷駅观景台，蒸汽口在画面下方、富士山在远处', composition: '蒸汽做前景仰拍山体，富士放右上三分线', pose: '举黑玉蛋回眸', bestTime: '10:00 前后云少、蒸汽旺', caption: '在火山口吃了一颗据说能延寿七年的蛋' },
      tips: '強羅 → 早雲山（登山缆车）→ 大涌谷（空中缆车）；硫化氢浓度高时部分步道封闭；山上比市区冷 5-8℃，带防风外套',
    },
    {
      name: '箱根神社·平和の鳥居', area: '元箱根', lat: 35.2025, lng: 139.1084, kind: 'must', stayMin: 70,
      why: '芦ノ湖里长出来的红色鸟居，箱根最出圈的一张',
      checkin: { spot: '水中鸟居正面栈桥右侧，湖面做留白', composition: '鸟居居中对称，湖面占下半，长焦压缩对岸山', pose: '站在鸟居侧石阶上拍剪影，或栈桥尽头回望', bestTime: '15:00 后排队较短；想拍无人鸟居得等隙或早上', caption: '湖里长出一座红色的门' },
      tips: '大涌谷 → 桃源台（空中缆车）→ 元箱根港（海贼船约 30 分钟）→ 步行约 10 分钟到神社；鸟居拍照有排队，11 月旺季 20-40 分钟；回汤本坐 H 线巴士约 35 分钟',
    },
    {
      name: '御殿場プレミアム・アウトレット', area: '御殿场', lat: 35.2933, lng: 139.0966, kind: 'optional', stayMin: 150,
      why: '箱根到河口湖的必经中转，晴天店铺屋顶后就是富士山全貌',
      checkin: { spot: '摩天轮旁的天桥，富士山在店铺屋顶后露全貌', composition: '富士居中，屋顶线条做引导线', pose: '购物袋当道具，侧身看山', bestTime: '上午到中午顺光', caption: '购物车的尽头是富士山' },
      tips: '箱根湯本 → 御殿場駅 箱根登山巴士约 50 分钟，再乘免费接驳到奥特莱斯；午餐在美食广场解决；行李可用园区寄存柜',
    },
    {
      name: '河口湖畔·湖畔步道', area: '河口湖', lat: 35.5085, lng: 138.7678, kind: 'must', stayMin: 90,
      why: '傍晚湖畔看富士山暮色，11 月下旬初雪富士配红叶',
      checkin: { spot: '河口湖大桥东侧湖畔步道，正对富士山与倒影', composition: '富士与倒影各占一半，桥做前景斜线', pose: '坐在湖畔石阶侧身看山', bestTime: '16:00-17:00 暮色（晨间湖面更静，倒影更完整）', caption: '湖替山把妆容又画了一遍' },
      tips: '御殿場 → 河口湖駅 富士急巴士约 60-70 分钟；傍晚气温接近 0℃；河口湖红叶回廊 11 月中下旬有夜间点灯（当年日期出发前查）',
    },
    {
      name: '新倉山浅間公園', area: '富士吉田', lat: 35.4995, lng: 138.8684, kind: 'must', stayMin: 60,
      why: '忠灵塔与富士山同框，日本最经典的一张明信片机位',
      checkin: { spot: '展望台（398 级台阶上）忠灵塔左下、富士山右上的经典位', composition: '塔在左下三分线、富士在右上三分线，中间留空', pose: '台阶上远眺背影，或塔前站定仰望', bestTime: '07:00-08:30 顺光、山顶云最少、人最少（11 月下旬日出约 06:30）', caption: '五层塔替我数了数富士的雪' },
      tips: '河口湖駅 → 下吉田駅（富士急行约 15 分钟）步行约 15 分钟上台阶；或从河口湖酒店打车约 20 分钟直达山脚（早班更省时间）；清晨风大注意保暖；08:15 前下山回河口湖駅赶巴士',
    },
  ]

  return buildDemoTrip({
    title: '箱根·富士山 5 天 · 分段住宿示例',
    city: '东京',
    startDate: '2027-11-23',
    endDate: '2027-11-27',
    lodging: lodgings[0],
    lodgings,
    source: '分段住宿示例',
    places,
    plan: [
      {
        date: '2027-11-23', tier: 'low', transportMode: 'transit', dayStart: '16:30', dayEnd: '21:30',
        stops: ['東京都庁展望台', '思い出横丁'],
        note: '下午抵达羽田，入境取行李预留 90-120 分钟；利木津巴士直达新宿（约 60-80 分钟，不用搬行李换乘）或京急→品川换山手线（约 45 分钟）。放下行李再出门，今天只在新宿周边走。',
      },
      {
        date: '2027-11-24', tier: 'mid', transportMode: 'transit', dayStart: '08:30', dayEnd: '21:00',
        stops: ['明治神宮', '竹下通り', '渋谷スクランブル交差点'],
        note: '东京城市日，全程在新宿—原宿—涩谷西线上，地铁两站内。今天顺便在新宿小田急窗口买好箱根周游券，并确认明早浪漫特快座位。',
      },
      {
        date: '2027-11-25', tier: 'mid', transportMode: 'transit', dayStart: '08:00', dayEnd: '20:00',
        startLodgingId: 'lod-shinjuku', endLodgingId: 'lod-hakone',
        stops: ['箱根強羅', '大涌谷', '箱根神社·平和の鳥居'],
        note: '换宿日 ①：新宿 → 浪漫特快 → 箱根湯本（先把行李放旅馆或用车站寄存）→ 登山铁道 → 強羅 → 缆车 → 大涌谷 → 空中缆车 → 桃源台 → 海贼船 → 元箱根 → 神社 → 巴士回汤本。旅馆一泊二食，晚餐入席时间（通常 18:00-18:30）定死回程巴士。',
      },
      {
        date: '2027-11-26', tier: 'mid', transportMode: 'transit', dayStart: '09:00', dayEnd: '19:00',
        startLodgingId: 'lod-hakone', endLodgingId: 'lod-kawaguchi',
        stops: ['御殿場プレミアム・アウトレット', '河口湖畔·湖畔步道'],
        note: '换宿日 ②：箱根湯本 → 御殿場（登山巴士约 50 分钟）→ 奥特莱斯午餐购物 → 富士急巴士 → 河口湖（约 60-70 分钟）。16:00 前到河口湖酒店，傍晚湖畔看山。周五，奥特莱斯不堵。',
      },
      {
        date: '2027-11-27', tier: 'low', transportMode: 'transit', dayStart: '06:40', dayEnd: '12:30',
        startLodgingId: 'lod-kawaguchi', endLodgingId: 'lod-haneda',
        stops: ['新倉山浅間公園'],
        note: '离境日（以下午航班为例）：按起飞前 3 小时到羽田 T3 倒推，河口湖 08:30-09:00 前出发。两条路：① 河口湖駅 新宿高速巴士（约 1h45，早高峰可能晚 20-30 分钟）→ 新宿 → 羽田利木津约 60 分钟；② 富士急×京急「河口湖→羽田空港」直达高速巴士（约 2h45，班次少，有早班就选它）。行李：前一天问旅馆/黑猫柜台能否「空港宅急便」寄到羽田（有时限），不行就随身带，河口湖駅有寄存柜。',
      },
    ],
  })
}

function buildDemoTrip({ title, city, startDate, endDate, lodging, lodgings = [], places, plan, source = '演示数据' }) {
  const pool = places.map((p) => ({ id: uid(), source, ...p }))
  const stop = (name) => {
    const p = pool.find((x) => x.name === name)
    return {
      id: uid(), placeId: p.id, name: p.name, lat: p.lat, lng: p.lng,
      stayMin: p.stayMin, kind: p.kind, checkin: { ...p.checkin },
      refShot: null, photos: [], status: 'todo', note: '',
    }
  }
  const days = plan.map((d) => ({
    id: uid(), dayStart: '09:00', dayEnd: '21:00', note: '', startLodgingId: null, endLodgingId: null,
    ...d, stops: d.stops.map(stop),
  }))
  return {
    id: uid(),
    title, city, startDate, endDate, lodging, lodgings,
    defaults: { tier: 'mid', transportMode: 'transit', dayStart: '09:00', dayEnd: '21:00' },
    pool,
    days,
    journal: { intro: '', captions: {} },
  }
}

/* ---------------- 照片库（IndexedDB） ---------------- */

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePhoto(photo) {
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite')
    tx.objectStore(PHOTO_STORE).put(photo)
    tx.oncomplete = () => resolve(photo.id)
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadPhoto(id) {
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deletePhoto(id) {
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite')
    tx.objectStore(PHOTO_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
