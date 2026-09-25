import apiClient from './client';

export const getRebalanceStatus = () => apiClient.get('/admin/rebalance/status');
export const triggerRebalance = () => apiClient.post('/admin/rebalance');
