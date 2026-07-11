import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getStats           = ()                 => api.get('/stats')
export const getParameters      = ()                 => api.get('/parameters')
export const getLocations       = ()                 => api.get('/locations')
export const getDates           = ()                 => api.get('/dates')
export const getUploadLog       = ()                 => api.get('/upload-log')
export const getMasterDataset   = (params)           => api.get('/master-dataset', { params })
export const getParameterAnalysis = (params)         => api.get('/parameter-analysis', { params })

export const uploadFiles = (formData, onProgress) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  })

export const deleteUpload = (id) => api.delete(`/upload/${id}`)

export const exportMaster = (params) => {
  const qs = new URLSearchParams(params).toString()
  window.open(`/api/export/master?${qs}`, '_blank')
}

export const exportAnalysis = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  window.open(`/api/export/analysis?${qs}`, '_blank')
}

export const exportParamMean = (parameter) => {
  window.open(`/api/export/parameter-mean?parameter=${encodeURIComponent(parameter)}`, '_blank')
}

export const exportParamStdDev = (parameter) => {
  window.open(`/api/export/parameter-stddev?parameter=${encodeURIComponent(parameter)}`, '_blank')
}

export default api
