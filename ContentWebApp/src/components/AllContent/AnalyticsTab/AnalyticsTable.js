import React, { useMemo } from "react";
import "../shared/tables.css";
import "../shared/utilities.css";

const AnalyticsTable = ({ data }) => {
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Calculate user actions count
  const getActionsCount = (userActions) => {
    return userActions ? userActions.length : 0;
  };

  // Get content played count
  const getContentCount = (streamPlayback) => {
    return streamPlayback ? streamPlayback.length : 0;
  };

  // Sort data by created_at descending (most recent first)
  const sortedData = useMemo(() => {
    return [...data].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="no-content">
        No analytics data available for the selected date range.
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="content-table">
        <thead>
          <tr>
            <th className="table-header">Phone Number</th>
            <th className="table-header">Start Time</th>
            <th className="table-header">End Time</th>
            <th className="table-header">Duration</th>
            <th className="table-header">FSM ID</th>
            <th className="table-header">Current State</th>
            <th className="table-header">Actions</th>
            <th className="table-header">Content Played</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((log) => (
            <tr key={log._id} className="table-row-white">
              <td className="table-cell">{log.phone_number}</td>
              <td className="table-cell">{formatDate(log.created_at)}</td>
              <td className="table-cell">
                {log.stopped_at ? formatDate(log.stopped_at) : "In Progress"}
              </td>
              <td className="table-cell">{log.duration || "N/A"}</td>
              <td className="table-cell">
                <span className="table-cell-secondary">
                  {log.fsm_id ? log.fsm_id.substring(0, 8) + "..." : "N/A"}
                </span>
              </td>
              <td className="table-cell">
                <span className="table-cell-secondary">
                  {log.current_state_id || "N/A"}
                </span>
              </td>
              <td className="table-cell">
                {getActionsCount(log.user_actions)}
              </td>
              <td className="table-cell">
                {getContentCount(log.stream_playback)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AnalyticsTable;
