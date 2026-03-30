function unique(values) {
  return [...new Set(values)];
}

export function getNodeRole(node, graph) {
  const matchedArtifactId = graph?.focus?.matched_artifact
    ? `artifact:matched:${graph.focus.matched_artifact}`
    : null;

  if (node.id.startsWith("artifact:input:")) {
    return "artifact-input";
  }

  if (matchedArtifactId && node.id === matchedArtifactId) {
    return "artifact-matched";
  }

  if (node.id.startsWith("artifact:impacted:")) {
    return "artifact-impacted";
  }

  if (node.type === "attack") {
    return "attack";
  }

  if (node.id.startsWith("tactic:direct:")) {
    return "tactic-direct";
  }

  if (node.id.startsWith("tactic:next:")) {
    return "tactic-next";
  }

  if (node.type === "defense") {
    return "defense";
  }

  return "artifact";
}

export function typeLabel(type, role) {
  if (role === "artifact-input") {
    return "Input";
  }
  if (role === "artifact-matched") {
    return "Matched";
  }
  if (role === "artifact-impacted") {
    return "Impacted";
  }
  if (type === "attack") {
    return "Attack";
  }
  if (role === "tactic-direct") {
    return "Direct Tactic";
  }
  if (role === "tactic-next") {
    return "Next Tactic";
  }
  if (type === "defense") {
    return "Defense";
  }
  return "Node";
}

export function buildPreviewSections(graph) {
  const groups = {
    "artifact-input": [],
    "artifact-matched": [],
    "artifact-impacted": [],
    attack: [],
    "tactic-direct": [],
    "tactic-next": [],
    defense: []
  };

  (graph?.nodes || []).forEach((node) => {
    const role = getNodeRole(node, graph);
    if (groups[role]) {
      groups[role].push(node.label);
    }
  });

  return [
    { label: "Girdi artifact", items: groups["artifact-input"], type: "artifact" },
    { label: "Eşleşen artifact", items: groups["artifact-matched"], type: "artifact" },
    { label: "Etkilenen varlık", items: groups["artifact-impacted"], type: "artifact" },
    { label: "Öncelikli saldırı", items: unique(groups.attack), type: "attack" },
    { label: "Direct tactic", items: unique(groups["tactic-direct"]), type: "tactic" },
    { label: "Next tactic", items: unique(groups["tactic-next"]), type: "tactic" },
    { label: "Savunma", items: unique(groups.defense), type: "defense" }
  ].filter((section) => section.items.length);
}
