import apiClient from './client';

export const getHealth = () => apiClient.get('/health');
export const getClusterHealth = () => apiClient.get('/admin/health/cluster');
export const triggerHealthProbe = () => apiClient.post('/admin/health/probe');
