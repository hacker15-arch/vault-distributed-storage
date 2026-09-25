import apiClient from './client';

export const listObjects = () => apiClient.get('/objects');
export const getObjectMetadata = (objectName) => apiClient.get(`/objects/${objectName}/metadata`);
export const getObjectVersions = (objectName) => apiClient.get(`/objects/${objectName}/versions`);
export const verifyObjectIntegrity = (objectName, version) => {
  const url = version ? `/objects/${objectName}/verify?version=${version}` : `/objects/${objectName}/verify`;
  return apiClient.get(url);
};

export const deleteObject = (objectName) => apiClient.delete(`/objects/${objectName}`);

export const uploadObject = (objectName, fileOrBuffer, onUploadProgress) => {
  const config = {
    headers: {
      'Content-Type': fileOrBuffer.type || 'application/octet-stream',
    },
    onUploadProgress,
  };
  return apiClient.put(`/objects/${objectName}`, fileOrBuffer, config);
};

export const downloadObjectUrl = (objectName, version) => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  return version ? `${baseURL}/objects/${objectName}?version=${version}` : `${baseURL}/objects/${objectName}`;
};
