function AnalysisForm({
  artifactName,
  description,
  loading,
  onArtifactChange,
  onDescriptionChange,
  onSubmit
}) {
  return (
    <form className="analysis-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Artifact Adı</span>
        <input
          type="text"
          value={artifactName}
          onChange={(event) => onArtifactChange(event.target.value)}
          placeholder="Örnek: powershell.exe"
          required
        />
      </label>

      <label className="field">
        <span>Açıklama</span>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Artifact'in gözlem bağlamını yazın..."
          rows="5"
          required
        />
      </label>

      <button className="submit-button" type="submit" disabled={loading}>
        {loading ? "Analiz Ediliyor..." : "Analiz Et"}
      </button>
    </form>
  );
}

export default AnalysisForm;
