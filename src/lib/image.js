// 图片处理：本地压缩（canvas），避免原图撑爆存储与 H5 导出体积

export function fileToDataURL(file, maxSize = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(drawToDataURL(img, maxSize, quality))
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = reader.result
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function drawToDataURL(img, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export function makeThumb(dataURL, maxSize = 360, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(drawToDataURL(img, maxSize, quality))
    img.onerror = () => resolve('')
    img.src = dataURL
  })
}
