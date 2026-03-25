import VisNetworkGraph from "./VisNetworkGraph";

function SummaryGraphRenderer({ graph }) {
  return <VisNetworkGraph graph={graph} mode="summary" />;
}

export default SummaryGraphRenderer;
