import apiClient from './client';

export const listNodes = () => apiClient.get('/nodes');
export const getNodeDetails = (nodeName) => apiClient.get(`/nodes/${nodeName}`);
export const setNodeOnline = (nodeName) => apiClient.post(`/nodes/${nodeName}/online`);
export const setNodeOffline = (nodeName) => apiClient.post(`/nodes/${nodeName}/offline`);
export const probeSingleNode = (nodeName) => apiClient.get(`/admin/nodes/${nodeName}/health`);
