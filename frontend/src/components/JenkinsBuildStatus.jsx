import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { axiosInstance } from '../lib/api';

export const JenkinsBuildStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socket = useWebSocket();

  useEffect(() => {
    // Initial load
    fetchPipelineStatus();

    // Subscribe to real-time updates
    if (socket) {
      socket.emit('subscribe:jenkins-status');
      socket.on('jenkins:status-update', (data) => {
        setStatus(data);
      });
    }

    // Poll every 10 seconds as fallback
    const interval = setInterval(fetchPipelineStatus, 10000);

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('jenkins:status-update');
      }
    };
  }, [socket]);

  const fetchPipelineStatus = async () => {
    try {
      const response = await axiosInstance.get('/jenkins/pipeline/status');
      setStatus(response.data);
      setError(null);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to fetch Jenkins status');
      console.error('Jenkins status error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center p-4">Loading Jenkins status...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;
  if (!status) return null;

  const getStatusColor = (s) => {
    switch (s) {
      case 'RUNNING': return 'bg-blue-500';
      case 'SUCCESS': return 'bg-green-500';
      case 'FAILURE': return 'bg-red-500';
      case 'FAILED': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getProgressBarColor = (p) => {
    if (p >= 80) return 'bg-green-500';
    if (p >= 50) return 'bg-blue-500';
    if (p >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 m-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Jenkins Pipeline</h2>
        <div className={`px-4 py-2 rounded text-white font-semibold ${getStatusColor(status.status)}`}>
          {status.status}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-gray-600 text-sm">Build Number</p>
          <p className="text-2xl font-bold text-gray-800">{status.buildNumber || 'N/A'}</p>
        </div>
        <div>
          <p className="text-gray-600 text-sm">Job</p>
          <p className="text-lg font-semibold text-gray-800 truncate">{status.jobName}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {status.status === 'RUNNING' && (
        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Progress</span>
            <span className="text-sm font-bold text-gray-700">{status.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${getProgressBarColor(status.progress)} transition-all duration-500`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Last Builds */}
      <div className="grid grid-cols-2 gap-4">
        {status.lastBuild && (
          <div className="border border-gray-200 rounded p-3 bg-gray-50">
            <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Last Build</p>
            <p className="text-lg font-bold text-gray-800">#{status.lastBuild.number}</p>
            <p className={`text-sm font-semibold ${status.lastBuild.status === 'RUNNING' ? 'text-blue-600' : 'text-green-600'}`}>
              {status.lastBuild.status}
            </p>
          </div>
        )}
        {status.lastCompletedBuild && (
          <div className="border border-gray-200 rounded p-3 bg-gray-50">
            <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Last Completed</p>
            <p className="text-lg font-bold text-gray-800">#{status.lastCompletedBuild.number}</p>
            <p className="text-xs text-gray-600 mt-1">
              {Math.round(status.lastCompletedBuild.duration / 1000)}s
            </p>
          </div>
        )}
      </div>

      {/* Jenkins URL Link */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 font-semibold inline-flex items-center"
        >
          View in Jenkins →
        </a>
      </div>
    </div>
  );
};

export default JenkinsBuildStatus;
