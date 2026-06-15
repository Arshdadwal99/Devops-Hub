import { useEffect, useState, useRef } from "react";
import { useSocketContext } from "../lib/SocketContext";
import { getImageHistory, getImageDetails } from "../lib/api";
import "../styles/ImageRegistry.css";

function getLogMessage(log) {
  if (log == null) return "";
  if (typeof log !== "object") return String(log);
  return log.message || log.error || JSON.stringify(log);
}

function getLogTimestamp(log) {
  return log && typeof log === "object" && log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();
}

export default function ImageRegistry() {
  const socket = useSocketContext();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [pushingImages, setPushingImages] = useState(new Set());
  const [pushLogs, setPushLogs] = useState({});
  const logsEndRef = useRef({});

  // Load initial image history
  useEffect(() => {
    loadImageHistory();
  }, []);

  // Setup socket listeners
  useEffect(() => {
    if (!socket?.isConnected) return;

    socket.emit("subscribe:images");

    const handlePushStarted = (event) => {
      console.log("[Socket] Push started:", event);
      setImages((current) =>
        current.map((img) =>
          img.imageId === event.imageId
            ? { ...img, status: "PUSHING", pushStartedAt: new Date() }
            : img
        )
      );
      setPushingImages((current) => new Set(current).add(event.imageId));
      setPushLogs((current) => ({
        ...current,
        [event.imageId]: ["Push started..."],
      }));
    };

    const handlePushLog = (event) => {
      console.log("[Socket] Push log:", event);
      setPushLogs((current) => ({
        ...current,
        [event.imageId]: [...(current[event.imageId] || []), event.message || event],
      }));
      // Auto-scroll to bottom
      setTimeout(() => {
        logsEndRef.current[event.imageId]?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    };

    const handlePushCompleted = (event) => {
      console.log("[Socket] Push completed:", event);
      setImages((current) =>
        current.map((img) =>
          img.imageId === event.imageId
            ? {
                ...img,
                status: event.status,
                pushedAt: new Date(),
                pushDuration: event.duration,
                dockerHubUrl: event.dockerHubUrl,
                pushError: event.error,
              }
            : img
        )
      );
      setPushingImages((current) => {
        const newSet = new Set(current);
        newSet.delete(event.imageId);
        return newSet;
      });
      setPushLogs((current) => ({
        ...current,
        [event.imageId]: [
          ...(current[event.imageId] || []),
          event.error ? `Error: ${event.error}` : "Push completed successfully!",
        ],
      }));
    };

    socket.on("push:started", handlePushStarted);
    socket.on("push:log", handlePushLog);
    socket.on("push:completed", handlePushCompleted);

    return () => {
      socket.off("push:started", handlePushStarted);
      socket.off("push:log", handlePushLog);
      socket.off("push:completed", handlePushCompleted);
    };
  }, [socket, socket?.isConnected]);

  async function loadImageHistory() {
    try {
      setLoading(true);
      const response = await getImageHistory();
      if (response.success) {
        setImages(response.images || []);
      } else {
        setError(response.error || "Failed to load image history");
      }
    } catch (err) {
      setError(err.message || "Failed to load image history");
      console.error("Error loading image history:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageClick(image) {
    try {
      const response = await getImageDetails(image.imageId);
      if (response.success) {
        setSelectedImage(response.image);
        setPushLogs((current) => ({
          ...current,
          [response.image.imageId]: Array.isArray(response.image.pushLogs) ? response.image.pushLogs : [],
        }));
        setShowDetails(true);
      }
    } catch (err) {
      setError("Failed to load image details");
      console.error("Error loading image details:", err);
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case "PENDING":
        return "#ffa500"; // orange
      case "PUSHING":
        return "#1e90ff"; // blue
      case "SUCCESS":
        return "#4caf50"; // green
      case "FAILED":
        return "#f44336"; // red
      default:
        return "#999";
    }
  }

  function formatDate(date) {
    if (!date) return "-";
    return new Date(date).toLocaleString();
  }

  function formatSize(bytes) {
    if (!bytes) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  function formatDuration(ms) {
    if (!ms) return "-";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }

  return (
    <div className="image-registry-container">
      <div className="registry-header">
        <h1>🐋 Image Registry</h1>
        <p>Review Docker images published by automated pipelines</p>
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading image history...</p>
        </div>
      ) : images.length === 0 ? (
        <div className="empty-state">
          <p>No images pushed yet</p>
          <p>Images will appear after GitHub Actions publishes them to Docker Hub</p>
        </div>
      ) : (
        <>
          <div className="images-grid">
            {images.map((image) => (
              <div
                key={image._id}
                className={`image-card ${image.status.toLowerCase()}`}
                onClick={() => handleImageClick(image)}
              >
                <div className="image-card-header">
                  <div className="image-status">
                    <div
                      className="status-dot"
                      style={{ backgroundColor: getStatusColor(image.status) }}
                    ></div>
                    <span className="status-text">{image.status}</span>
                  </div>
                  {pushingImages.has(image.imageId) && (
                    <div className="pushing-indicator">Pushing...</div>
                  )}
                </div>

                <div className="image-card-body">
                  <h3 className="image-name">{image.imageName}</h3>
                  <p className="image-tag">
                    <strong>Tag:</strong> {image.tag}
                  </p>
                  <p className="image-build-id">
                    <strong>Build ID:</strong> {image.buildId.substring(0, 12)}...
                  </p>

                  {image.dockerHubUrl && (
                    <p className="image-url">
                      <strong>URL:</strong>
                      <a href={image.dockerHubUrl} target="_blank" rel="noopener noreferrer">
                        View on Docker Hub
                      </a>
                    </p>
                  )}

                  {image.size && (
                    <p className="image-size">
                      <strong>Size:</strong> {formatSize(image.size)}
                    </p>
                  )}

                  <p className="image-pushed-at">
                    <strong>Pushed:</strong> {formatDate(image.pushedAt)}
                  </p>

                  {image.pushDuration && (
                    <p className="image-duration">
                      <strong>Duration:</strong> {formatDuration(image.pushDuration)}
                    </p>
                  )}

                  {image.pushError && (
                    <p className="image-error">
                      <strong>Error:</strong> {image.pushError}
                    </p>
                  )}
                </div>

                <div className="image-card-footer">
                  <button
                    className="btn-details"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick(image);
                    }}
                  >
                    View Details
                  </button>

                  {image.dockerHubUrl && (
                    <button
                      className="btn-copy-url"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(image.dockerHubUrl);
                      }}
                    >
                      Copy URL
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Image Details Modal */}
      {showDetails && selectedImage && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedImage.imageName}:{selectedImage.tag}</h2>
              <button className="btn-close" onClick={() => setShowDetails(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="details-section">
                <h3>Image Information</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Image ID</span>
                    <span className="detail-value">{selectedImage.imageId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Build ID</span>
                    <span className="detail-value">{selectedImage.buildId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Repository</span>
                    <span className="detail-value">{selectedImage.repository}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span
                      className="detail-value status-badge"
                      style={{ color: getStatusColor(selectedImage.status) }}
                    >
                      {selectedImage.status}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Size</span>
                    <span className="detail-value">{formatSize(selectedImage.size)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Duration</span>
                    <span className="detail-value">{formatDuration(selectedImage.pushDuration)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Pushed At</span>
                    <span className="detail-value">{formatDate(selectedImage.pushedAt)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Digest</span>
                    <span className="detail-value">{selectedImage.digest || "-"}</span>
                  </div>
                </div>
              </div>

              {selectedImage.dockerHubUrl && (
                <div className="details-section">
                  <h3>Docker Hub</h3>
                  <div className="docker-hub-link">
                    <a
                      href={selectedImage.dockerHubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selectedImage.dockerHubUrl}
                    </a>
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(selectedImage.dockerHubUrl)}
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
              )}

              {pushLogs[selectedImage.imageId] && pushLogs[selectedImage.imageId].length > 0 && (
                <div className="details-section">
                  <h3>Push Logs</h3>
                  <div className="logs-container">
                    {pushLogs[selectedImage.imageId].map((log, idx) => (
                      <div key={idx} className="log-line">
                        <span className="log-time">
                          {getLogTimestamp(log)}
                        </span>
                        <span className="log-message">{getLogMessage(log)}</span>
                      </div>
                    ))}
                    <div ref={(el) => (logsEndRef.current[selectedImage.imageId] = el)}></div>
                  </div>
                </div>
              )}

              {selectedImage.pushError && (
                <div className="details-section error-section">
                  <h3>Error Details</h3>
                  <pre className="error-details">{selectedImage.pushError}</pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowDetails(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
