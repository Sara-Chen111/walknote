import React, { useEffect, useState } from 'react'
import { loadPhoto } from '../lib/storage'

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, foot }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
        {foot && <div className="foot">{foot}</div>}
      </div>
    </div>
  )
}

export function Empty({ big, children }) {
  return (
    <div className="empty">
      <div className="big">{big}</div>
      {children}
    </div>
  )
}

export function Tag({ tone = 'default', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

export function Spinner() {
  return <span className="spinner" />
}

export function StepsBar({ steps, budget }) {
  const pct = Math.min(100, Math.round((steps / (budget || 1)) * 100))
  const tone = steps > budget ? 'over' : pct > 85 ? 'warn' : 'ok'
  return (
    <div className={`steps-bar ${tone}`}>
      <div className="fill" style={{ width: pct + '%' }} />
      <span className="label">
        {(steps || 0).toLocaleString()} / {(budget || 0).toLocaleString()} 步
      </span>
    </div>
  )
}

export function Lightbox({ id, onClose }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    loadPhoto(id).then((p) => alive && setUrl(p?.full || p?.thumb || ''))
    return () => { alive = false }
  }, [id])
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt="" /> : <Spinner />}
      </div>
    </div>
  )
}
