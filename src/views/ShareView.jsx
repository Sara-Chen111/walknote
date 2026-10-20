import React, { useState } from 'react'
import { tripStats, weekdayCN } from '../lib/geo'
import { buildH5, downloadFile } from '../lib/export'
import { callLLM, extractJSON } from '../lib/api'
import { journalMessages } from '../lib/prompts'
import { Empty, Spinner } from '../components/ui.jsx'

// 展页：行后的一键 H5 手记。文案可 AI 起草可手改；导出单文件 HTML（照片内嵌），发文件即分享

export default function ShareView({ ctx }) {
  const { trip, settings } = ctx
  const stats = tripStats(trip)
  const journal = trip.journal || { intro: '', captions: {} }
  const days = trip.days || []
  const [busy, setBusy] = useState('') // '' | 'copy' | 'h5'
  const [h5, setH5] = useState('')
  const [err, setErr] = useState('')

  if (!days.length) {
    return <Empty big="还没有可展示的行程">先去规划台生成行程、在计划本里打卡拍照，再回来生成 H5 手记</Empty>
  }

  const patchJournal = (patch) => ctx.patchTrip({ journal: { ...journal, ...patch } })

  const writeCopy = async () => {
    setBusy('copy')
    setErr('')
    try {
      const text = await callLLM(settings, journalMessages(trip, stats), { temperature: 0.8 })
      const data = extractJSON(text)
      if (!data?.intro) throw new Error('文案生成失败，请重试')
      patchJournal({ intro: data.intro, captions: { ...journal.captions, ...(data.captions || {}) } })
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const makeH5 = async () => {
    setBusy('h5')
    setErr('')
    try {
      setH5(await buildH5(trip))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const download = () => h5 && downloadFile(`行记-${trip.title}.html`, h5)

  const copyHTML = async () => {
    if (!h5) return
    try {
      await navigator.clipboard.writeText(h5)
      setErr('')
    } catch (e) {
      setErr('复制失败，可以用「下载 HTML」')
    }
  }

  return (
    <>
      {err && <div className="banner error">{err}</div>}

      <section className="card">
        <div className="stat-strip">
          <span><b>{stats.dayCount}</b> 天</span>
          <span><b>{stats.stopCount}</b> 个地点</span>
          <span><b>{stats.totalSteps.toLocaleString()}</b> 步</span>
          <span><b>{stats.photoCount}</b> 张照片</span>
          <span><b>{stats.doneCount}</b> 次打卡</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>手记文案</h2>
          <button className="small" disabled={busy === 'copy'} onClick={writeCopy}>
            {busy === 'copy' ? <><Spinner />撰写中…</> : settings.apiKey ? 'AI 撰写文案' : '撰写文案（演示）'}
          </button>
        </div>
        <textarea
          rows={3}
          placeholder="整趟旅程的引言（会出现在 H5 封面下方）"
          value={journal.intro}
          onChange={(e) => patchJournal({ intro: e.target.value })}
        />
        {days.map((d, i) => (
          <div key={d.id} className="caption-row">
            <label>第 {i + 1} 天 · {d.date.slice(5)} {weekdayCN(d.date)}</label>
            <textarea
              rows={2}
              placeholder={`${(d.stops || []).map((s) => s.name).join(' → ') || '留白日'} 的配文`}
              value={journal.captions?.[d.id] || ''}
              onChange={(e) => patchJournal({ captions: { ...journal.captions, [d.id]: e.target.value } })}
            />
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>生成 H5 手记</h2>
          <div className="row-actions">
            <button className="small" disabled={busy === 'h5'} onClick={makeH5}>
              {busy === 'h5' ? <><Spinner />生成中…</> : '生成 / 刷新预览'}
            </button>
            <button className="small" disabled={!h5} onClick={download}>下载 HTML</button>
            <button className="small" disabled={!h5} onClick={copyHTML}>复制 HTML</button>
          </div>
        </div>
        <div className="hint-line">
          单文件 HTML：照片已内嵌，发文件给朋友 / 传任意静态托管即可分享。做好后记得先「下载 HTML」留档。
        </div>
        {h5 ? (
          <iframe className="h5-preview" title="H5 预览" srcDoc={h5} />
        ) : (
          <Empty big="点击「生成 / 刷新预览」">按天排版的手记页会在这里预览</Empty>
        )}
      </section>
    </>
  )
}
