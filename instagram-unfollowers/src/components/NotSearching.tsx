import React from 'react';

interface NotSearchingProps {
  onScan?: () => void;
}

export const NotSearching = ({onScan}: NotSearchingProps) => (
  <section className="launch-screen">
    <div className="launch-copy">
      <span className="eyebrow">Local account audit</span>
      <h1>Find the follows that do not follow back.</h1>
      <p>
        Scan your Instagram follows, review risk signals, protect whitelisted accounts,
        and act only on the users you select.
      </p>
      <div className="launch-actions">
        <button className="run-scan" onClick={onScan}>
          Run Scan
        </button>
        <span className="launch-note">Runs in this browser session only</span>
      </div>
    </div>
    <div className="launch-panel" aria-hidden="true">
      <div className="scan-orbit">
        <span />
        <span />
        <span />
      </div>
      <div className="signal-card primary">
        <span>Ready</span>
        <strong>0%</strong>
      </div>
      <div className="signal-card">
        <span>Protected</span>
        <strong>Whitelist</strong>
      </div>
      <div className="signal-card accent">
        <span>Review</span>
        <strong>Select first</strong>
      </div>
    </div>
  </section>
);
