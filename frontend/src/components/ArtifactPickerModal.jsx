import { useMemo } from "react";

function ArtifactPickerModal({ open, artifacts, onClose, onSelect }) {
  const groupedArtifacts = useMemo(() => {
    return artifacts.reduce((groups, artifact) => {
      const category = artifact.category || "Unknown";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(artifact);
      return groups;
    }, {});
  }, [artifacts]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-shell artifact-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Artifact seç"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <strong>Artifact seç</strong>
            <p>Bilinen canonical artifact listesinden seçim yapın.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Kapat
          </button>
        </div>

        <div className="artifact-modal-groups">
          {Object.entries(groupedArtifacts).map(([category, items]) => (
            <section key={category} className="artifact-modal-group">
              <h4>{category}</h4>
              <div className="artifact-modal-list">
                {items.map((artifact) => (
                  <button
                    key={`${category}-${artifact.name}`}
                    type="button"
                    className="artifact-modal-item"
                    onClick={() => onSelect(artifact)}
                  >
                    <strong>{artifact.name}</strong>
                    <span>{artifact.category}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ArtifactPickerModal;
