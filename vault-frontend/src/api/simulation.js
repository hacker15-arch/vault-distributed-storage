import apiClient from './client';

export const simulateSlowNode = (nodeName, delaySeconds = 2.0) =>
  apiClient.post(`/admin/nodes/${nodeName}/slow`, { delay_seconds: delaySeconds });

export const simulateNodePartition = (nodeName) =>
  apiClient.post(`/admin/nodes/${nodeName}/partition`);

export const removeNodePartition = (nodeName) =>
  apiClient.post(`/admin/nodes/${nodeName}/unpartition`);

export const getPartitionStatus = () => apiClient.get('/admin/partition/status');

export const simulateSplitBrain = (partitionA, partitionB) =>
  apiClient.post('/admin/partition/simulate', { partition_a: partitionA, partition_b: partitionB });

export const healClusterPartitions = () => apiClient.post('/admin/partition/heal');

export const corruptReplica = (nodeName, objectName, version) => {
  const url = version ? `/admin/nodes/${nodeName}/corrupt/${objectName}?version=${version}` : `/admin/nodes/${nodeName}/corrupt/${objectName}`;
  return apiClient.post(url);
};
