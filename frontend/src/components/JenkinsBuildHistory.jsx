import React, { useCallback, useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

function formatLogEntry(entry) {
  if (entry == null) return "";
  if (typeof entry !== "object") return String(entry);

  const parts = [];
  if (entry.timestamp) parts.push(new Date(entry.timestamp).toLocaleString());
  if (entry.level) parts.push(String(entry.level).toUpperCase());
  parts.push(entry.message || entry.error || JSON.stringify(entry));
  return parts.filter(Boolean).join(" | ");
}

export const JenkinsBuildHistory = ({ limit = 10 }) => {
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [buildDetails, setBuildDetails] = useState(null);
  const [logs, setLogs] = useState(null);
  const { token } = useAuth();

  const fetchBuildHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(`/jenkins/history?limit=${limit}`);
      setBuilds(response.data.builds || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch build history');
      console.error('Build history error:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchBuildHistory();
  }, [fetchBuildHistory]);

  const fetchBuildDetails = async (buildNumber) => {
    try {
      const response = await axiosInstance.get(`/jenkins/builds/${buildNumber}`);
      setBuildDetails(response.data);
      setSelectedBuild(buildNumber);
    } catch (err) {
      console.error('Failed to fetch build details:', err);
    }
  };

  const fetchBuildLogs = async (buildNumber) => {
    try {
      const response = await axiosInstance.get(`/jenkins/builds/${buildNumber}/logs`);
      setLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const buildLogText = Array.isArray(logs?.logs)
    ? logs.logs.map(formatLogEntry).join('\n')
    : typeof logs?.logs === "string"
      ? logs.logs
      : 'No logs available';

  const getStatusBadge = (status) => {
    const colors = {
      SUCCESS: 'bg-green-100 text-green-800',
      FAILURE: 'bg-red-100 text-red-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      ABORTED: 'bg-gray-100 text-gray-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status] || colors.PENDING;
  };

  if (loading) return <div className="p-4 text-center">Loading build history...</div>;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 m-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Build History</h2>
        <button
          onClick={fetchBuildHistory}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-semibold"
        >
          Refresh
        </button>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

      {builds.length === 0 ? (
        <p className="text-gray-500">No builds found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Build #</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Branch</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Duration</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Time</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((build) => (
                <tr key={build.buildNumber} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-blue-600">#{build.buildNumber}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(build.status)}`}>
                      {build.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{build.sourceCode?.branch || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {build.duration ? Math.round(build.duration / 1000) + 's' : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {build.timestamp ? new Date(build.timestamp).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => fetchBuildDetails(build.buildNumber)}
                      className="text-blue-500 hover:text-blue-700 text-sm font-semibold mr-2"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => fetchBuildLogs(build.buildNumber)}
                      className="text-green-500 hover:text-green-700 text-sm font-semibold"
                    >
                      Logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Build Details Modal */}
      {buildDetails && (
        <div className="mt-6 p-4 border-2 border-blue-200 rounded bg-blue-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-bold text-gray-800">Build #{buildDetails.buildNumber} Details</h3>
            <button
              onClick={() => setBuildDetails(null)}
              className="text-gray-500 hover:text-gray-700 font-bold"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-600 font-semibold">Status</p>
              <p className="text-lg font-bold text-gray-800">{buildDetails.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-semibold">Duration</p>
              <p className="text-lg font-bold text-gray-800">
                {buildDetails.duration ? Math.round(buildDetails.duration / 1000) + 's' : 'Running'}
              </p>
            </div>
            {buildDetails.stages && (
              <div className="col-span-2">
                <p className="text-xs text-gray-600 font-semibold mb-2">Stages</p>
                <div className="space-y-2">
                  {buildDetails.stages.map((stage, idx) => (
                    <div key={idx} className="flex items-center">
                      <span
                        className={`inline-block w-3 h-3 rounded-full mr-2 ${
                          stage.status === 'SUCCESS'
                            ? 'bg-green-500'
                            : stage.status === 'RUNNING'
                            ? 'bg-blue-500'
                            : 'bg-red-500'
                        }`}
                      ></span>
                      <span className="text-sm">{stage.name}</span>
                      <span className="text-xs text-gray-600 ml-2">({stage.duration / 1000}s)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Build Logs Modal */}
      {logs && (
        <div className="mt-6 p-4 border-2 border-green-200 rounded bg-green-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-bold text-gray-800">Build Logs</h3>
            <button
              onClick={() => setLogs(null)}
              className="text-gray-500 hover:text-gray-700 font-bold"
            >
              ✕
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto max-h-64 text-sm">
            {buildLogText}
          </pre>
        </div>
      )}
    </div>
  );
};

export default JenkinsBuildHistory;
