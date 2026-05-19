import { createContext, useCallback, useContext, useState } from 'react'

const ScreeningContext = createContext(null)

export function ScreeningProvider({ children }) {
  const [files, setFiles]                   = useState([])
  const [previewUrls, setPreviewUrls]       = useState({})
  const [fileError, setFileError]           = useState(null)
  const [screeningResult, setScreeningResult] = useState(null)
  const [screeningError, setScreeningError] = useState(null)

  const applyFiles = useCallback((rawList) => {
    const valid = [...rawList].filter((f) =>
      ['image/jpeg', 'image/jpg', 'image/png'].includes(f.type)
    )
    const skipped = rawList.length - valid.length

    if (valid.length === 0) {
      setFileError('No valid images found. Only JPG and PNG files are supported.')
      return
    }
    if (valid.length > 100) {
      setFileError(`Maximum 100 images per batch. You selected ${valid.length}.`)
      return
    }

    const urls = {}
    valid.forEach((f) => { urls[f.name] = URL.createObjectURL(f) })

    setPreviewUrls((prev) => {
      Object.values(prev).forEach(URL.revokeObjectURL)
      return urls
    })
    setFiles(valid)
    setFileError(skipped > 0 ? `${skipped} non-image file(s) were ignored.` : null)
    setScreeningResult(null)
    setScreeningError(null)
  }, [])

  const reset = useCallback((fileInputRef) => {
    setPreviewUrls((prev) => {
      Object.values(prev).forEach(URL.revokeObjectURL)
      return {}
    })
    setFiles([])
    setFileError(null)
    setScreeningResult(null)
    setScreeningError(null)
    if (fileInputRef?.current) fileInputRef.current.value = ''
  }, [])

  const value = {
    files,
    previewUrls,
    fileError,
    screeningResult,
    setScreeningResult,
    screeningError,
    setScreeningError,
    applyFiles,
    reset,
  }

  return (
    <ScreeningContext.Provider value={value}>
      {children}
    </ScreeningContext.Provider>
  )
}

export function useScreening() {
  const ctx = useContext(ScreeningContext)
  if (ctx === null) {
    throw new Error('useScreening() must be used inside a <ScreeningProvider>.')
  }
  return ctx
}
