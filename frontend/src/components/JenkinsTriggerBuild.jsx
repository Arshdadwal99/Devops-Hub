import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/AuthContext';

export const JenkinsTriggerBuild = ({ onBuildTriggered }) => {
  const [repository, setRepository] = useState('devops-hub');
  const [branch, setBranch] = useState('main');
  const [environment, setEnvironment] = useState('production');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const { token } = useAuth();

  const handleTrigger = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const payload = {
        repository: { name: repository },
        commit: {
          sha: `commit-${Date.now()}`,
          message: message || `Build triggered from dashboard - ${new Date().toLocaleString()}`,
          author: { name: 'Dashboard' },
        },
        branch,
        environment,
      };

      const response = await axios.post('/api/jenkins/trigger', payload, config);

      if (response.data.success || response.data.buildNumber) {
        setSuccess(`✅ Build #${response.data.buildNumber} triggered successfully!`);
        onBuildTriggered?.(response.data);
        
        // Reset form
        setMessage('');
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(response.data.error || 'Failed to trigger build');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to trigger build');
      console.error('Trigger build error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 m-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Trigger Build</h2>

      <form onSubmit={handleTrigger} className="space-y-4">
        {/* Repository */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Repository</label>
          <input
            type="text"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-blue-500"
            placeholder="Repository name"
          />
        </div>

        {/* Branch */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          >
            <option value="main">main</option>
            <option value="develop">develop</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
        </div>

        {/* Environment */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Environment</label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Commit Message (Optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            placeholder="Enter commit message for this build"
            rows="3"
          />
        </div>

        {/* Messages */}
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
        {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{success}</div>}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full px-6 py-3 rounded font-bold text-white transition-colors ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {loading ? 'Triggering...' : 'Trigger Build Now'}
        </button>
      </form>
    </div>
  );
};

export default JenkinsTriggerBuild;
