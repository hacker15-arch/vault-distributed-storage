import apiClient from './client';

export const getRepairStatus = () => apiClient.get('/admin/repair/status');
export const repairSingleObject = (objectName, version) => {
  const url = version ? `/admin/repair/${objectName}?version=${version}` : `/admin/repair/${objectName}`;
  return apiClient.post(url);
};
export const repairCluster = () => apiClient.post('/admin/repair');
