const EDGE_LABELS = [
  "MATCHED_TO",
  "DIRECT_ATTACK",
  "HAS_TACTIC",
  "NEXT_TACTIC",
  "DEFENDED_BY",
  "MAY_IMPACT",
  "PROPAGATED_ATTACK"
];

function unique(values) {
  return [...new Set(values)];
}

function sortNodeIds(nodeIds, nodesById) {
  return [...nodeIds].sort((leftId, rightId) => {
    const leftLabel = nodesById.get(leftId)?.label || leftId;
    const rightLabel = nodesById.get(rightId)?.label || rightId;
    return leftLabel.localeCompare(rightLabel);
  });
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

function createGraphMaps(graph) {
  const nodes = graph?.nodes || [];
  const edges = (graph?.edges || []).filter((edge) => edge?.label && EDGE_LABELS.includes(edge.label));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();

  edges.forEach((edge) => {
    const list = outgoing.get(edge.source) || [];
    list.push(edge);
    outgoing.set(edge.source, list);
  });

  return { nodesById, edges, outgoing };
}

function findAnchorIds(graph) {
  const inputId = graph?.focus?.artifact ? `artifact:input:${graph.focus.artifact}` : null;
  const matchedId = graph?.focus?.matched_artifact ? `artifact:matched:${graph.focus.matched_artifact}` : null;
  return { inputId, matchedId, anchorId: matchedId || inputId };
}

function getNarrativeContext(graph) {
  const { inputId, matchedId } = findAnchorIds(graph);
  const hasDistinctInput = Boolean(inputId && matchedId && inputId !== matchedId);
  const analysisMode = graph?.focus?.analysis_mode;
  const isNewArtifactMode = analysisMode === "new" || hasDistinctInput;
  const centerArtifactId = matchedId || inputId;

  return {
    inputId,
    matchedId,
    centerArtifactId,
    isNewArtifactMode,
    isExistingArtifactMode: !isNewArtifactMode
  };
}

function getTargets(outgoing, sourceId, label) {
  return unique((outgoing.get(sourceId) || []).filter((edge) => edge.label === label).map((edge) => edge.target));
}

function countOutgoingEdges(outgoing, nodeIds) {
  return nodeIds.reduce((total, nodeId) => total + ((outgoing.get(nodeId) || []).length || 0), 0);
}

function pickBestChild(nodeIds, scoreByNode, nodesById) {
  return sortChildIds(nodeIds, scoreByNode, nodesById)[0] || null;
}

function sortChildIds(nodeIds, scoreByNode, nodesById) {
  const sorted = [...nodeIds].sort((leftId, rightId) => {
    const scoreDelta = (scoreByNode.get(rightId) || 0) - (scoreByNode.get(leftId) || 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return (nodesById.get(leftId)?.label || leftId).localeCompare(nodesById.get(rightId)?.label || rightId);
  });

  return sorted;
}

function pickBestDefense(nodeIds, outgoing, nodesById) {
  const scoreByNode = new Map(nodeIds.map((nodeId) => [nodeId, (outgoing.get(nodeId) || []).length]));
  return pickBestChild(nodeIds, scoreByNode, nodesById);
}

function scoreDirectTacticPath(directId, index) {
  const nextTactics = index.nextTacticsByDirect.get(directId) || [];
  const directDefenses = index.defensesBySource.get(directId) || [];
  const nextDefenseCount = nextTactics.reduce(
    (total, nextId) => total + (index.defensesBySource.get(nextId) || []).length,
    0
  );

  return (
    nextTactics.length * 3 +
    directDefenses.length * 2 +
    nextDefenseCount * 2 +
    ((index.outgoing.get(directId) || []).length || 0)
  );
}

function scoreNextTacticNode(nextId, index) {
  const nextDefenses = index.defensesBySource.get(nextId) || [];
  return nextDefenses.length * 2 + ((index.outgoing.get(nextId) || []).length || 0);
}

export function buildBranchIndex(graph) {
  const { nodesById, edges, outgoing } = createGraphMaps(graph);
  const { inputId, matchedId, anchorId } = findAnchorIds(graph);
  const attackIds = sortNodeIds(getTargets(outgoing, anchorId, "DIRECT_ATTACK"), nodesById);
  const impactedArtifactIds = sortNodeIds(getTargets(outgoing, anchorId, "MAY_IMPACT"), nodesById);
  const directTacticsByAttack = new Map();
  const nextTacticsByDirect = new Map();
  const defensesBySource = new Map();
  const propagatedAttacksByArtifact = new Map();
  const branchStatsByAttack = new Map();

  attackIds.forEach((attackId) => {
    directTacticsByAttack.set(attackId, sortNodeIds(getTargets(outgoing, attackId, "HAS_TACTIC"), nodesById));
  });

  impactedArtifactIds.forEach((artifactId) => {
    propagatedAttacksByArtifact.set(
      artifactId,
      sortNodeIds(getTargets(outgoing, artifactId, "PROPAGATED_ATTACK"), nodesById)
    );
  });

  nodesById.forEach((node, nodeId) => {
    if (getNodeRole(node, graph) === "tactic-direct") {
      nextTacticsByDirect.set(nodeId, sortNodeIds(getTargets(outgoing, nodeId, "NEXT_TACTIC"), nodesById));
      defensesBySource.set(nodeId, sortNodeIds(getTargets(outgoing, nodeId, "DEFENDED_BY"), nodesById));
    }

    if (getNodeRole(node, graph) === "tactic-next" || node.type === "attack") {
      defensesBySource.set(nodeId, sortNodeIds(getTargets(outgoing, nodeId, "DEFENDED_BY"), nodesById));
    }
  });

  attackIds.forEach((attackId) => {
    const directTactics = directTacticsByAttack.get(attackId) || [];
    const nextTactics = unique(directTactics.flatMap((directId) => nextTacticsByDirect.get(directId) || []));
    const defenses = unique([
      ...directTactics.flatMap((directId) => defensesBySource.get(directId) || []),
      ...nextTactics.flatMap((nextId) => defensesBySource.get(nextId) || []),
      ...(defensesBySource.get(attackId) || [])
    ]);
    const branchNodes = unique([attackId, ...directTactics, ...nextTactics, ...defenses]);

    branchStatsByAttack.set(attackId, {
      attackId,
      directTacticCount: directTactics.length,
      nextTacticCount: nextTactics.length,
      defenseCount: defenses.length,
      totalOutgoingEdges: countOutgoingEdges(outgoing, branchNodes)
    });
  });

  return {
    inputId,
    matchedId,
    anchorId,
    nodesById,
    edges,
    outgoing,
    attackIds,
    impactedArtifactIds,
    directTacticsByAttack,
    nextTacticsByDirect,
    defensesBySource,
    propagatedAttacksByArtifact,
    branchStatsByAttack
  };
}

export function scoreAttackBranches(graph) {
  const index = buildBranchIndex(graph);

  return index.attackIds
    .map((attackId) => {
      const stats = index.branchStatsByAttack.get(attackId) || {
        directTacticCount: 0,
        nextTacticCount: 0,
        defenseCount: 0,
        totalOutgoingEdges: 0
      };

      return {
        attackId,
        label: index.nodesById.get(attackId)?.label || attackId,
        score:
          stats.directTacticCount * 3 +
          stats.nextTacticCount * 2 +
          stats.defenseCount * 2 +
          stats.totalOutgoingEdges,
        ...stats
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.label.localeCompare(right.label);
    });
}

export function buildSummaryGraph(graph) {
  if (!graph?.nodes?.length) {
    return graph;
  }

  const index = buildBranchIndex(graph);
  const narrative = getNarrativeContext(graph);
  const topAttacks = scoreAttackBranches(graph).slice(0, 3);
  const keptNodes = [];
  const keptNodeIds = new Set();
  const keptEdges = [];
  const edgeKeys = new Set();

  const addNode = (nodeId) => {
    if (!nodeId || keptNodeIds.has(nodeId)) {
      return;
    }

    const node = index.nodesById.get(nodeId);
    if (!node) {
      return;
    }

    keptNodeIds.add(nodeId);
    keptNodes.push(node);
  };

  const addEdge = (source, target, label) => {
    if (!label || !source || !target) {
      return;
    }

    const key = `${source}|${target}|${label}`;
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);
    keptEdges.push({ source, target, label });
  };

  if (narrative.isNewArtifactMode) {
    if (narrative.inputId && narrative.inputId !== narrative.centerArtifactId) {
      addNode(narrative.inputId);
    }
    if (narrative.matchedId) {
      addNode(narrative.matchedId);
    }
  } else {
    addNode(narrative.centerArtifactId);
    if (
      narrative.inputId &&
      narrative.inputId !== narrative.centerArtifactId &&
      index.edges.some(
        (edge) =>
          edge.label === "MATCHED_TO" &&
          edge.source === narrative.inputId &&
          edge.target === narrative.centerArtifactId
      )
    ) {
      addNode(narrative.inputId);
    }
  }

  if (narrative.inputId && narrative.matchedId) {
    const matchedEdge = index.edges.find(
      (edge) =>
        edge.label === "MATCHED_TO" &&
        edge.source === narrative.inputId &&
        edge.target === narrative.matchedId
    );
    if (matchedEdge) {
      addEdge(matchedEdge.source, matchedEdge.target, matchedEdge.label);
    }
  }

  index.impactedArtifactIds.slice(0, 3).forEach((impactedArtifactId) => {
    addNode(impactedArtifactId);
    addEdge(narrative.centerArtifactId, impactedArtifactId, "MAY_IMPACT");
  });

  topAttacks.forEach(({ attackId }) => {
    addNode(attackId);
    addEdge(narrative.centerArtifactId, attackId, "DIRECT_ATTACK");

    const directTactics = index.directTacticsByAttack.get(attackId) || [];
    const pathScoreByDirect = new Map(
      directTactics.map((directId) => [directId, scoreDirectTacticPath(directId, index)])
    );
    const selectedDirectIds = sortChildIds(directTactics, pathScoreByDirect, index.nodesById).slice(0, 1);

    if (selectedDirectIds.length === 0) {
      const attackDefenses = index.defensesBySource.get(attackId) || [];
      const bestDefenseId = pickBestDefense(attackDefenses, index.outgoing, index.nodesById);
      if (bestDefenseId) {
        addNode(bestDefenseId);
        addEdge(attackId, bestDefenseId, "DEFENDED_BY");
      }
      return;
    }

    selectedDirectIds.forEach((directId) => {
      addNode(directId);
      addEdge(attackId, directId, "HAS_TACTIC");

      const nextTactics = index.nextTacticsByDirect.get(directId) || [];
      const scoreByNext = new Map(
        nextTactics.map((nextId) => [nextId, scoreNextTacticNode(nextId, index)])
      );
      const bestNextId = pickBestChild(nextTactics, scoreByNext, index.nodesById);

      if (bestNextId) {
        addNode(bestNextId);
        addEdge(directId, bestNextId, "NEXT_TACTIC");

        const nextDefenses = index.defensesBySource.get(bestNextId) || [];
        const bestDefenseId = pickBestDefense(nextDefenses, index.outgoing, index.nodesById);
        if (bestDefenseId) {
          addNode(bestDefenseId);
          addEdge(bestNextId, bestDefenseId, "DEFENDED_BY");
          return;
        }
      }

      const directDefenses = index.defensesBySource.get(directId) || [];
      const bestDefenseId = pickBestDefense(directDefenses, index.outgoing, index.nodesById);
      if (bestDefenseId) {
        addNode(bestDefenseId);
        addEdge(directId, bestDefenseId, "DEFENDED_BY");
      }
    });
  });

  return {
    ...graph,
    nodes: keptNodes,
    edges: keptEdges
  };
}

function buildVisNode(node, graph, isSummary) {
  const role = getNodeRole(node, graph);
  const isMatched = role === "artifact-matched";
  const isInput = role === "artifact-input";

  const roleStyles = {
    "artifact-matched": {
      color: { background: "#15324a", border: "#8bd0ff", highlight: { background: "#1d3d58", border: "#b2e3ff" } },
      size: isSummary ? 38 : 44,
      mass: 4.4,
      font: { size: isSummary ? 18 : 20, color: "#eef9ff", face: "Segoe UI", bold: true }
    },
    "artifact-input": {
      color: { background: "#102233", border: "#75a7c8", highlight: { background: "#14304a", border: "#9dc6e3" } },
      size: isSummary ? 28 : 30,
      mass: 2.8,
      font: { size: 15, color: "#e4f2ff", face: "Segoe UI" }
    },
    "artifact-impacted": {
      color: { background: "#18324b", border: "#9dd3ff", highlight: { background: "#214260", border: "#c2e6ff" } },
      size: isSummary ? 26 : 29,
      mass: 2.6,
      font: { size: 14, color: "#edf8ff", face: "Segoe UI" }
    },
    attack: {
      color: { background: "#3a2331", border: "#ff8fc2", highlight: { background: "#522e42", border: "#ffb5d7" } },
      size: isSummary ? 26 : 30,
      mass: 2.4,
      font: { size: 14, color: "#fff0f7", face: "Segoe UI" }
    },
    "tactic-direct": {
      color: { background: "#1d3140", border: "#89d1ff", highlight: { background: "#284457", border: "#b6e3ff" } },
      size: isSummary ? 24 : 27,
      mass: 2,
      font: { size: 13, color: "#eef8ff", face: "Segoe UI" }
    },
    "tactic-next": {
      color: { background: "#233a2f", border: "#89efbc", highlight: { background: "#315140", border: "#b6f5d4" } },
      size: isSummary ? 23 : 26,
      mass: 1.9,
      font: { size: 13, color: "#effff5", face: "Segoe UI" }
    },
    defense: {
      color: { background: "#3a341d", border: "#f7d47b", highlight: { background: "#524927", border: "#ffe4a7" } },
      size: isSummary ? 23 : 26,
      mass: 1.9,
      font: { size: 13, color: "#fff9e8", face: "Segoe UI" }
    },
    artifact: {
      color: { background: "#15324a", border: "#8bd0ff", highlight: { background: "#1d3d58", border: "#b2e3ff" } },
      size: 28,
      mass: 3,
      font: { size: 15, color: "#eef9ff", face: "Segoe UI" }
    }
  };

  const style = roleStyles[role] || roleStyles.artifact;

  return {
    id: node.id,
    label: node.label,
    title: `${role.replace(/-/g, " ")}\n${node.label}`,
    shape: "dot",
    borderWidth: isMatched ? 3 : isInput ? 2.2 : 2,
    borderWidthSelected: isMatched ? 4 : 3,
    ...style,
    shadow: {
      enabled: true,
      color: isMatched ? "rgba(102, 200, 255, 0.38)" : "rgba(10, 22, 38, 0.28)",
      size: isMatched ? 26 : 16,
      x: 0,
      y: 0
    },
    physics: true
  };
}

function getDisplayEdgeLabel(label) {
  const labels = {
    MAY_IMPACT: "ETKİ YAYILIMI",
    PROPAGATED_ATTACK: "YAYILIM SALDIRISI"
  };

  return labels[label] || label;
}

function buildVisEdge(edge, graph, isSummary) {
  const edgeStyles = {
    MATCHED_TO: {
      color: { color: "rgba(132, 178, 211, 0.74)", highlight: "#a6d2f0" },
      dashes: true,
      width: 2
    },
    DIRECT_ATTACK: {
      color: { color: "rgba(255, 157, 202, 0.74)", highlight: "#ffb9da" },
      width: 2.8
    },
    HAS_TACTIC: {
      color: { color: "rgba(157, 214, 255, 0.68)", highlight: "#bfe7ff" },
      width: 2.2
    },
    NEXT_TACTIC: {
      color: { color: "rgba(141, 239, 188, 0.68)", highlight: "#bdf7d8" },
      width: 2.1
    },
    DEFENDED_BY: {
      color: { color: "rgba(247, 212, 123, 0.72)", highlight: "#ffe7ac" },
      width: 2.2
    },
    MAY_IMPACT: {
      color: { color: "rgba(138, 208, 255, 0.8)", highlight: "#d1eeff" },
      dashes: [8, 6],
      width: 2.4
    },
    PROPAGATED_ATTACK: {
      color: { color: "rgba(255, 196, 122, 0.82)", highlight: "#ffe0ad" },
      dashes: [5, 5],
      width: 2.3
    }
  };

  const style = edgeStyles[edge.label] || edgeStyles.HAS_TACTIC;
  const showLabel = Boolean(edge.label);

  return {
    id: `${edge.source}->${edge.target}:${edge.label}`,
    from: edge.source,
    to: edge.target,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: edge.label === "DIRECT_ATTACK" || edge.label === "PROPAGATED_ATTACK" ? 0.8 : 0.7
      }
    },
    label: showLabel ? getDisplayEdgeLabel(edge.label) : "",
    font: {
      color: "#d7e9f8",
      size: isSummary ? 10 : 12,
      face: "Segoe UI",
      background: "rgba(7, 15, 27, 0.85)",
      strokeWidth: 0
    },
    smooth: {
      enabled: true,
      type: "dynamic",
      roundness: 0.34
    },
    selectionWidth: 1.2,
    hoverWidth: 0.2,
    ...style
  };
}

export function buildVisNetworkData(graph, mode = "full") {
  const sourceGraph = mode === "summary" ? buildSummaryGraph(graph) : graph;

  if (!sourceGraph?.nodes?.length) {
    return { nodes: [], edges: [], focusNodeId: null };
  }

  const isSummary = mode === "summary";
  const nodes = sourceGraph.nodes.map((node) => buildVisNode(node, sourceGraph, isSummary));
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = (sourceGraph.edges || [])
    .filter((edge) => EDGE_LABELS.includes(edge.label) && nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
    .map((edge) => buildVisEdge(edge, sourceGraph, isSummary));

  return {
    nodes,
    edges,
    focusNodeId:
      (sourceGraph.focus?.matched_artifact && `artifact:matched:${sourceGraph.focus.matched_artifact}`) ||
      (sourceGraph.focus?.artifact && `artifact:input:${sourceGraph.focus.artifact}`) ||
      null
  };
}
