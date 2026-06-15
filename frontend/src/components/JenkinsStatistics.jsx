import React, { useCallback, useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const JenkinsStatistics = ({ days = 30 }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token } = useAuth();

  const generateChartData = useCallback((data) => {
    return [
      {
        name: 'Success',
        value: data.successCount || 0,
      },
      {
        name: 'Failure',
        value: data.failureCount || 0,
      },
      {
        name: 'Other',
        value: (data.totalBuilds || 0) - (data.successCount || 0) - (data.failureCount || 0),
      },
    ];
  }, []);

  const fetchStatistics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(`/jenkins/statistics?days=${days}`);
      
      // Transform data for charts
      if (response.data.stats) {
        setStats({
          ...response.data.stats,
          chartData: generateChartData(response.data.stats),
        });
      } else {
        setStats(response.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to fetch statistics');
      console.error('Statistics error:', err);
    } finally {
      setLoading(false);
    }
  }, [days, generateChartData]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  if (loading) return <div className="p-4 text-center">Loading statistics...</div>;
  if (error) return <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>;
  if (!stats) return null;

  const successRate = stats.successRate || 0;
  const avgDuration = stats.avgDuration ? Math.round(stats.avgDuration / 1000) : 0;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 m-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Build Statistics (Last {days} Days)</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm font-semibold">Total Builds</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats.totalBuilds || 0}</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm font-semibold">Successful</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{stats.successCount || 0}</p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm font-semibold">Failed</p>
          <p className="text-3xl font-bold text-red-600 mt-2">{stats.failureCount || 0}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm font-semibold">Success Rate</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">{successRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Average Duration */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-4 mb-8">
        <p className="text-gray-600 text-sm font-semibold">Average Build Duration</p>
        <p className="text-3xl font-bold text-orange-600 mt-2">{avgDuration}s</p>
      </div>

      {/* Build Status Distribution Chart */}
      {stats.chartData && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Build Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By Status Breakdown */}
      {stats.byStatus && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Breakdown by Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div
                key={status}
                className={`rounded-lg p-4 text-center ${
                  status === 'SUCCESS'
                    ? 'bg-green-50 border border-green-200'
                    : status === 'FAILURE'
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <p className="text-sm font-semibold text-gray-600">{status}</p>
                <p className="text-2xl font-bold text-gray-800 mt-2">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <button
        onClick={fetchStatistics}
        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-semibold transition-colors"
      >
        Refresh Statistics
      </button>
    </div>
  );
};

export default JenkinsStatistics;
