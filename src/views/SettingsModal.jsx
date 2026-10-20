import React, { useState } from 'react'
import { ENDPOINT_PRESETS } from '../lib/storage'
import { testConnection } from '../lib/api'
import { downloadFile } from '../lib/export'
import { Field, Modal, Spinner } from '../components/ui.jsx'

export default function SettingsModal({ ctx, onClose }) {
  const [draft, setDraft] = useState({ ...ctx.settings })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const upd = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const applyPreset = (name) => {
    const p = ENDPOINT_PRESETS.find((x) => x.name === name)
    if (p) upd({ endpoint: p.endpoint, model: p.model, visionModel: p.visionModel })
  }

  const test = async () => {
    setBusy(true)
    setMsg('')
    try {
      await testConnection(draft)
      setMsg('✓ 连接成功')
    } catch (e) {
      setMsg('✗ ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    ctx.setSettings(draft)
    onClose()
  }

  const exportData = () =>
    downloadFile('walknote-数据备份.json', JSON.stringify(ctx.state, null, 2), 'application/json')

  return (
    <Modal
      title="设置"
      onClose={onClose}
      foot={
        <>
          <button className="ghost small" onClick={onClose}>取消</button>
          <button className="primary small" onClick={save}>保存</button>
        </>
      }
    >
      <div className="field">
        <label>模型服务（文本）</label>
        <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
          <option value="">选择预设快速填充…</option>
          {ENDPOINT_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <Field label="接口地址（OpenAI 兼容）">
        <input value={draft.endpoint} onChange={(e) => upd({ endpoint: e.target.value })} />
      </Field>
      <Field label="API Key" hint="仅存本机浏览器，不上传任何服务器">
        <input type="password" value={draft.apiKey} onChange={(e) => upd({ apiKey: e.target.value })} placeholder="未配置则进入演示模式" />
      </Field>
      <div className="grid cols2">
        <Field label="文本模型">
          <input value={draft.model} onChange={(e) => upd({ model: e.target.value })} />
        </Field>
        <Field label="视觉模型" hint="用于解析攻略截图（轻微多模态）">
          <input value={draft.visionModel} onChange={(e) => upd({ visionModel: e.target.value })} placeholder="如 glm-4v-flash" />
        </Field>
      </div>

      <hr className="sep" />
      <div className="field">
        <label>地图路网（步数计算）</label>
        <div className="hint">引擎按坐标自动选源：境内用高德、境外用 OpenRouteService；都未配置则按直线距离估算并标注「估算值」</div>
      </div>
      <Field
        label="高德 Web 服务 Key（国内）"
        hint="lbs.amap.com 注册并完成个人认证，创建「Web 服务」类型 Key（免费 15 万次/月）。启用后境内步行距离与公交换乘按真实路网计算；Key 不要设置域名白名单"
      >
        <input value={draft.amapKey} onChange={(e) => upd({ amapKey: e.target.value })} placeholder="境内行程建议配置" />
      </Field>
      <Field
        label="OpenRouteService Key（海外）"
        hint="openrouteservice.org 免费注册（2000 次/日）。日本等境外行程按步行路网计算真实距离"
      >
        <input value={draft.orsKey} onChange={(e) => upd({ orsKey: e.target.value })} placeholder="境外行程建议配置" />
      </Field>

      <div className="row-actions">
        <button className="small" disabled={busy} onClick={test}>
          {busy ? <><Spinner />测试中…</> : '测试连接'}
        </button>
        <button className="ghost small" onClick={exportData}>导出数据备份（JSON）</button>
        {msg && <span className="test-msg">{msg}</span>}
      </div>
      <div className="hint-line" style={{ marginTop: 10 }}>
        行程数据存本机 localStorage，打卡照片存浏览器 IndexedDB；换浏览器/清缓存前请先导出备份。
      </div>
    </Modal>
  )
}
