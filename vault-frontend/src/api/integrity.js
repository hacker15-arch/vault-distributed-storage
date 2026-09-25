import apiClient from './client';

export const runClusterScrub = () => apiClient.post('/admin/scrub');
