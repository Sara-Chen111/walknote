import React, { useState } from 'react'
import { uid } from '../lib/storage'
import { fileToDataURL } from '../lib/image'
import { callLLM, callVision, extractJSON } from '../lib/api'
import { guideParseMessages } from '../lib/prompts'
import { Field, Empty, Spinner, Tag } from '../components/ui.jsx'

// 攻略采集箱：用户主动导入（粘贴链接/正文、上传截图）→ AI 解析 → 人工确认 → 进入景点池
// 合规设计说明见 docs/03-数据源与合规方案.md：不做自动抓取，原文仅在本机内存处理

export default function CollectView({ ctx, onBack }) {
  const { settings } = ctx
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [added, setAdded] = useState({})

  const applyParsed = (places) => {
    if (!places?.length) throw new Error('没有解析出景点，试试补充更具体的攻略内容')
    setCandidates(places.map((p) => ({ stayMin: 60, kind: 'optional', ...p, id: uid(), checkin: { ...(p.checkin || {}) } })))
    ctx.setCollects([
      { id: uid(), excerpt: (raw || '（截图解析）').slice(0, 120), createdAt: Date.now(), count: places.length },
      ...ctx.state.collects,
    ].slice(0, 20))
  }

  const parseText = async () => {
    if (!raw.trim()) {
      setErr('先粘贴攻略内容（笔记正文、复制的文字）或上传截图')
      return
    }
    setBusy(true)
    setErr('')
    setCandidates(null)
    setAdded({})
    try {
      const text = await callLLM(settings, guideParseMessages(raw), { temperature: 0.3 })
      applyParsed(extractJSON(text)?.places)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const parseImage = async (file) => {
    if (!file) return
    setBusy(true)
    setErr('')
    setCandidates(null)
    setAdded({})
    try {
      const url = await fileToDataURL(file, 1280, 0.85)
      const prompt = `这是旅行攻略截图。请提取其中所有"可执行的景点与打卡建议"，输出纯 JSON：
{ "places": [ { "name": "景点名", "area": "区域", "stayMin": 60, "why": "为什么值得去", "checkin": { "spot": "机位", "composition": "构图", "pose": "姿势", "bestTime": "最佳时段", "caption": "一句文案" }, "tips": "注意事项", "confidence": 0.9 } ] }
机位等信息若图里没有，根据内容合理补全；只提取具体地点。`
      const text = await callVision(settings, prompt, [url])
      applyParsed(extractJSON(text)?.places)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const patchCandidate = (id, patch) => setCandidates((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const patchCheckin = (id, patch) => setCandidates((list) => list.map((c) => (c.id === id ? { ...c, checkin: { ...c.checkin, ...patch } } : c)))

  const addOne = (c) => {
    if (!c.name.trim()) return
    ctx.addPoolPlace({
      name: c.name.trim(),
      area: c.area || '',
      stayMin: Number(c.stayMin) || 60,
      kind: c.kind,
      why: c.why || '',
      checkin: c.checkin,
      tips: c.tips || '',
      source: '攻略导入',
    })
    setAdded((a) => ({ ...a, [c.id]: true }))
  }

  const addAll = () => {
    ;(candidates || []).forEach((c) => { if (!added[c.id]) addOne(c) })
  }

  const remaining = (candidates || []).filter((c) => !added[c.id]).length

  return (
    <>
      <div className="page-head">
        <button className="ghost small" onClick={onBack}>← 回规划台</button>
        <h1>攻略采集箱</h1>
      </div>

      <div className="banner info">
        把小红书攻略「分享」给行记：粘贴笔记正文/链接文字，或上传攻略截图。解析结果只进本机，不做自动抓取、不留存原文。
      </div>
      {err && <div className="banner error">{err}</div>}

      <section className="card">
        <Field label="攻略正文 / 链接文字" hint="建议一次粘贴 1-2 篇相关笔记，内容越完整解析越准">
          <textarea
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'例：浅草寺一定要早上 7 点去，雷门前没人……\n打卡机位：雷门和五重塔中间的石灯笼旁，低角度仰拍……'}
          />
        </Field>
        <div className="row-actions">
          <label className="upload-link">
            ＋ 上传攻略截图
            <input type="file" accept="image/*" hidden onChange={(e) => { parseImage(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <div className="spacer" />
          <button className="primary" disabled={busy} onClick={parseText}>
            {busy ? <><Spinner />解析中…</> : '解析成候选景点'}
          </button>
        </div>
      </section>

      {candidates && (
        <section className="card">
          <div className="card-head">
            <h2>解析结果 <span className="cnt">{candidates.length}</span></h2>
            {remaining > 0 && <button className="small" onClick={addAll}>全部加入池子（{remaining}）</button>}
          </div>
          {candidates.map((c) => (
            <div className={`cand-card ${added[c.id] ? 'added' : ''}`} key={c.id}>
              <div className="grid cols3">
                <Field label="景点名">
                  <input value={c.name} onChange={(e) => patchCandidate(c.id, { name: e.target.value })} />
                </Field>
                <Field label="区域">
                  <input value={c.area || ''} onChange={(e) => patchCandidate(c.id, { area: e.target.value })} />
                </Field>
                <Field label="停留（分钟）">
                  <input type="number" value={c.stayMin} onChange={(e) => patchCandidate(c.id, { stayMin: e.target.value })} />
                </Field>
              </div>
              {c.why && <div className="cand-why">{c.why}</div>}
              <div className="checkin-edit">
                <Field label="机位">
                  <input value={c.checkin.spot || ''} onChange={(e) => patchCheckin(c.id, { spot: e.target.value })} />
                </Field>
                <div className="grid cols2">
                  <Field label="构图">
                    <input value={c.checkin.composition || ''} onChange={(e) => patchCheckin(c.id, { composition: e.target.value })} />
                  </Field>
                  <Field label="姿势">
                    <input value={c.checkin.pose || ''} onChange={(e) => patchCheckin(c.id, { pose: e.target.value })} />
                  </Field>
                </div>
                <div className="grid cols2">
                  <Field label="最佳时段">
                    <input value={c.checkin.bestTime || ''} onChange={(e) => patchCheckin(c.id, { bestTime: e.target.value })} />
                  </Field>
                  <Field label="文案">
                    <input value={c.checkin.caption || ''} onChange={(e) => patchCheckin(c.id, { caption: e.target.value })} />
                  </Field>
                </div>
              </div>
              <div className="row-actions">
                <span className={`chip ${c.kind === 'must' ? 'chip-must' : ''}`} onClick={() => patchCandidate(c.id, { kind: 'must' })}>必去</span>
                <span className={`chip ${c.kind === 'optional' ? 'chip-opt' : ''}`} onClick={() => patchCandidate(c.id, { kind: 'optional' })}>次选</span>
                {typeof c.confidence === 'number' && (
                  <Tag tone={c.confidence < 0.7 ? 'warn' : 'default'}>置信 {Math.round(c.confidence * 100)}%</Tag>
                )}
                <div className="spacer" />
                <button className="small" disabled={added[c.id]} onClick={() => addOne(c)}>
                  {added[c.id] ? '✓ 已加入' : '加入景点池'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!candidates && !busy && (
        <Empty big="解析出的景点会出现在这里">
          确认名称与打卡建议后，逐个（或批量）加入景点池
        </Empty>
      )}

      {ctx.state.collects.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>导入记录</h2></div>
          {ctx.state.collects.map((h) => (
            <div className="hist-row" key={h.id}>
              <span className="hist-excerpt">{h.excerpt}…</span>
              <span className="hist-meta">{h.count} 个景点</span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
