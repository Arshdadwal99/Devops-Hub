import { useCallback, useEffect, useState } from "react";
import { generateConfiguration } from "../lib/api.js";

const COLORS = {
  page: "#0D1117",
  card: "#161B22",
  cardAlt: "#0D1117",
  border: "#30363D",
  text: "#F0F6FC",
  muted: "#8B949E",
  body: "#C9D1D9",
  button: "#21262D",
  green: "#3FB950",
  yellow: "#D29922",
  red: "#F85149",
};

export default function RepositoryAnalysisModal({ analysis, isOpen, onClose, repoName, owner, repo, onGenerateComplete }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClose = useCallback(() => {
    setIsGenerating(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") handleClose();
    }

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        window.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [handleClose, isOpen]);

  if (!isOpen || !analysis) return null;

  const stack = analysis.stack || analysis.technologies || [];
  const dockerfileExists = analysis.dockerfileExists ?? analysis.hasDocker ?? false;
  const dockerComposeExists = analysis.dockerComposeExists ?? analysis.hasDockerCompose ?? false;
  const jenkinsfileExists = analysis.jenkinsfileExists ?? analysis.hasJenkinsfile ?? false;
  const githubActionsExists = analysis.githubActionsExists ?? analysis.hasGitHubActions ?? false;
  const environmentExists = analysis.environmentExampleExists ?? analysis.hasEnvironmentExample ?? false;
  const deploymentScore = analysis.deploymentScore ?? analysis.deploymentReadinessScore ?? 0;
  const recommendations = analysis.recommendations || [];

  const score = Math.max(0, Math.min(100, deploymentScore));
  const scoreState = score <= 40 ? "missing" : score <= 70 ? "warning" : "ready";
  const scoreLabel = score <= 40 ? "Needs work" : score <= 70 ? "Review recommended" : "Deployment ready";
  const ciReady = jenkinsfileExists || githubActionsExists;

  const handleGenerateFiles = async () => {
    try {
      setIsGenerating(true);
      
      // Call the API to generate configuration files
      const result = await generateConfiguration(owner, repo, analysis);
      
      if (result.success) {
        // Show success toast
        if (typeof window !== "undefined" && window.showToast) {
          window.showToast({
            type: "success",
            title: "Files Generated Successfully",
            message: `Generated Dockerfile, docker-compose.yml, .dockerignore, and .env.example`
          });
        }
        
        // Call callback if provided
        if (onGenerateComplete) {
          onGenerateComplete(result);
        }
      } else {
        throw new Error(result.message || "Failed to generate files");
      }
    } catch (error) {
      console.error("Generate files error:", error);
      if (typeof window !== "undefined" && window.showToast) {
        window.showToast({
          type: "error",
          title: "Generation Failed",
          message: error.message || "Failed to generate configuration files"
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.78)",
        }}
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <section
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="repository-analysis-title"
          style={{
            width: "min(900px, 100%)",
            maxHeight: "88vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.page,
            boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          }}
        >
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              padding: "20px 24px",
              borderBottom: `1px solid ${COLORS.border}`,
              background: COLORS.page,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Repository analysis
              </div>
              <h2 id="repository-analysis-title" style={{ margin: "4px 0 0", color: COLORS.text, fontSize: 22, fontWeight: 700 }}>
                Deployment Readiness Report
              </h2>
              <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: 14 }}>{repoName}</p>
            </div>
            <Badge state={scoreState} label={scoreLabel} />
          </header>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: COLORS.page }}>
            <Section title="Deployment Score" icon="%" first>
              <div className="grid gap-4 md:grid-cols-[160px_1fr] md:items-center">
                <div>
                  <div style={{ color: COLORS.text, fontSize: 40, fontWeight: 750, lineHeight: 1 }}>{score}%</div>
                  <div style={{ color: toneColor(scoreState), fontSize: 14, fontWeight: 650, marginTop: 6 }}>{scoreLabel}</div>
                </div>
                <div>
                  <div style={{ height: 10, borderRadius: 999, background: COLORS.button, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${score}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: toneColor(scoreState),
                        transition: "width 250ms ease",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs" style={{ color: COLORS.muted }}>
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Technology Stack" icon="{}">
              {stack.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {stack.map((item) => (
                    <span
                      key={item}
                      style={{
                        background: COLORS.button,
                        color: COLORS.body,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 13,
                        fontWeight: 650,
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyText>No technology stack detected.</EmptyText>
              )}
            </Section>

            <Section title="Docker Status" icon="DK">
              <div className="grid gap-2 md:grid-cols-2">
                <StatusRow label="Dockerfile" state={dockerfileExists ? "ready" : "missing"} />
                <StatusRow label="Docker Compose" state={dockerComposeExists ? "ready" : "warning"} warningLabel="Not detected" />
              </div>
            </Section>

            <Section title="CI/CD Status" icon="CI">
              <div className="grid gap-2 md:grid-cols-2">
                <StatusRow
                  label="Pipeline"
                  state={ciReady ? "ready" : "missing"}
                  readyLabel={jenkinsfileExists ? "Jenkinsfile" : "GitHub Actions"}
                />
                <StatusRow label="Jenkinsfile" state={jenkinsfileExists ? "ready" : "missing"} />
              </div>
            </Section>

            <Section title="Runtime Information" icon=">_">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Build Command" value={analysis.buildCommand || "Not detected"} />
                <Info label="Start Command" value={analysis.startCommand || "Not detected"} />
                <Info label="Recommended Port" value={analysis.recommendedPort || "Not detected"} />
              </div>
              <div style={{ marginTop: 10 }}>
                <StatusRow
                  label="Environment variables"
                  state={environmentExists ? "ready" : "warning"}
                  readyLabel="Documented"
                  warningLabel="May be required"
                />
              </div>
            </Section>

            <Section title="Recommendations" icon="!">
              {recommendations.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {recommendations.map((recommendation, index) => (
                    <li key={`${recommendation.title || recommendation}-${index}`} className="flex gap-3" style={{ color: COLORS.body, fontSize: 14 }}>
                      <span style={{ color: COLORS.yellow, marginTop: 1 }}>!</span>
                      <span>{typeof recommendation === "string" ? recommendation : recommendation.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: COLORS.green, fontSize: 14 }}>No blocking recommendations detected.</div>
              )}
            </Section>

          </div>

          <footer
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "16px 24px",
              borderTop: `1px solid ${COLORS.border}`,
              background: COLORS.page,
              flexShrink: 0,
            }}
          >
            <Button
              variant="secondary"
              onClick={handleGenerateFiles}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating..." : "Generate Deployment Files"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleClose}
            >
              Close
            </Button>
          </footer>
        </section>
      </div>
    </>
  );
}

function Button({ variant = "secondary", disabled = false, onClick, children }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const variantStyle = variant === "secondary" ? secondaryButtonStyle : {};

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={{
        ...buttonBaseStyle,
        ...variantStyle,
        background: isHovered && !disabled ? COLORS.border : variantStyle.background,
        borderColor: isHovered && !disabled ? COLORS.muted : variantStyle.borderColor,
        boxShadow: isFocused ? `0 0 0 3px ${COLORS.green}55` : "none",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, icon, children, first = false }) {
  return (
    <section
      style={{
        padding: "18px 24px",
        borderTop: first ? "none" : `1px solid ${COLORS.border}`,
        background: COLORS.page,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <SmallIcon>{icon}</SmallIcon>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 15, fontWeight: 700 }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StatusRow({ label, state, readyLabel = "Ready", warningLabel = "Warning" }) {
  const labelText = state === "ready" ? readyLabel : state === "warning" ? warningLabel : "Missing";
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <span style={{ color: COLORS.body, fontSize: 14, fontWeight: 550 }}>{label}</span>
      <Badge state={state} label={labelText} />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: COLORS.body, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function Badge({ state, label }) {
  const icon = state === "ready" ? "✓" : state === "warning" ? "!" : "×";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        padding: "4px 9px",
        background: toneBackground(state),
        color: toneColor(state),
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {icon} {label}
    </span>
  );
}

function SmallIcon({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        height: 24,
        borderRadius: 6,
        background: COLORS.button,
        color: COLORS.muted,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function EmptyText({ children }) {
  return <p style={{ margin: 0, color: COLORS.muted, fontSize: 14 }}>{children}</p>;
}

function toneColor(state) {
  return {
    ready: COLORS.green,
    warning: COLORS.yellow,
    missing: COLORS.red,
  }[state];
}

function toneBackground(state) {
  return {
    ready: "#12351F",
    warning: "#3A2A0F",
    missing: "#3D1515",
  }[state];
}

const disabledButtonStyle = {
  border: 0,
  borderRadius: 8,
  background: COLORS.button,
  color: COLORS.muted,
  padding: "9px 14px",
  fontSize: 14,
  fontWeight: 650,
  opacity: 0.7,
  cursor: "not-allowed",
};

const buttonBaseStyle = {
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 700,
  transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
};

const secondaryButtonStyle = {
  border: `1px solid ${COLORS.border}`,
  borderColor: COLORS.border,
  background: COLORS.button,
  color: COLORS.text,
};
