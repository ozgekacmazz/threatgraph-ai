from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.neo4j_client import Neo4jClient


REQUIRED_TACTICS = [
    "Initial Access",
    "Persistence",
    "Exfiltration",
]


TACTIC_SUCCESSORS: dict[str, list[str]] = {
    "Reconnaissance": ["Resource Development", "Initial Access"],
    "Resource Development": ["Initial Access"],
    "Initial Access": ["Execution", "Persistence"],
    "Execution": ["Credential Access", "Privilege Escalation"],
    "Persistence": ["Privilege Escalation", "Lateral Movement"],
    "Privilege Escalation": ["Lateral Movement"],
    "Defense Evasion": ["Credential Access", "Discovery"],
    "Credential Access": ["Privilege Escalation", "Lateral Movement"],
    "Discovery": ["Lateral Movement", "Collection"],
    "Lateral Movement": ["Exfiltration"],
    "Collection": ["Exfiltration"],
    "Command and Control": ["Exfiltration"],
    "Exfiltration": ["Impact"],
    "Impact": ["Persistence"],
}


ATTACK_TACTIC_ENRICHMENTS: dict[str, list[str]] = {
    "Application Access Token": ["Credential Access", "Collection"],
    "Create Process with Token": ["Credential Access", "Privilege Escalation", "Defense Evasion"],
    "DNS": ["Command and Control", "Exfiltration"],
    "Dynamic Resolution": ["Command and Control", "Defense Evasion", "Exfiltration"],
    "Exploitation of Remote Services": ["Initial Access", "Execution", "Lateral Movement"],
    "External Remote Services": ["Initial Access", "Lateral Movement", "Command and Control"],
    "Golden Ticket": ["Credential Access", "Privilege Escalation", "Persistence"],
    "Make and Impersonate Token": ["Credential Access", "Privilege Escalation", "Defense Evasion"],
    "Remote Desktop Protocol": ["Lateral Movement", "Command and Control"],
    "Remote Services": ["Lateral Movement", "Execution"],
    "SSH": ["Lateral Movement", "Command and Control"],
    "Steal Application Access Token": ["Credential Access", "Collection"],
    "Steal Web Session Cookie": ["Credential Access", "Collection"],
    "Steal or Forge Kerberos Tickets": ["Credential Access", "Privilege Escalation", "Persistence"],
    "Token Impersonation/Theft": ["Credential Access", "Privilege Escalation", "Defense Evasion"],
    "Web Session Cookie": ["Credential Access", "Collection"],
}


DNS_ARTIFACT_ATTACKS = {
    "DNS Lookup": ["DNS", "Dynamic Resolution"],
}


def run_enrichment() -> None:
    client = Neo4jClient()
    if not client.is_available():
        raise RuntimeError(f"Neo4j unavailable: {client.connection_error}")

    try:
        for tactic_name in REQUIRED_TACTICS:
            client.run_query(
                """
                MERGE (:Tactic {name: $tactic_name})
                """,
                {"tactic_name": tactic_name},
            )

        for source_tactic, next_tactics in TACTIC_SUCCESSORS.items():
            for next_tactic in next_tactics:
                client.run_query(
                    """
                    MERGE (source:Tactic {name: $source_tactic})
                    MERGE (target:Tactic {name: $next_tactic})
                    MERGE (source)-[:NEXT_TACTIC]->(target)
                    """,
                    {
                        "source_tactic": source_tactic,
                        "next_tactic": next_tactic,
                    },
                )

        for attack_name, tactic_names in ATTACK_TACTIC_ENRICHMENTS.items():
            for tactic_name in tactic_names:
                client.run_query(
                    """
                    MATCH (o:OffenseTech {name: $attack_name})
                    MERGE (t:Tactic {name: $tactic_name})
                    MERGE (t)-[:HAS_TECHNIQUE]->(o)
                    """,
                    {
                        "attack_name": attack_name,
                        "tactic_name": tactic_name,
                    },
                )

        for artifact_name, attack_names in DNS_ARTIFACT_ATTACKS.items():
            for attack_name in attack_names:
                client.run_query(
                    """
                    MATCH (a:Artifact {name: $artifact_name})
                    MATCH (o:OffenseTech {name: $attack_name})
                    MERGE (o)-[:OFF_REL]->(a)
                    """,
                    {
                        "artifact_name": artifact_name,
                        "attack_name": attack_name,
                    },
                )

        coverage = client.run_query(
            """
            MATCH (o:OffenseTech)
            OPTIONAL MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
            WITH o, count(DISTINCT t) AS tactic_count
            OPTIONAL MATCH (t2:Tactic)-[:HAS_TECHNIQUE]->(o)
            OPTIONAL MATCH (t2)-[:NEXT_TACTIC]->(nt:Tactic)
            WITH o, tactic_count, count(DISTINCT nt) AS next_tactic_count
            OPTIONAL MATCH (o)-[:OFF_REL]->(:Artifact)<-[:DEF_REL]-(d:DefenseTech)
            RETURN
                count(o) AS total_attacks,
                sum(CASE WHEN tactic_count > 0 THEN 1 ELSE 0 END) AS attacks_with_tactic,
                sum(CASE WHEN next_tactic_count > 0 THEN 1 ELSE 0 END) AS attacks_with_next_tactic,
                sum(CASE WHEN EXISTS { MATCH (o)-[:OFF_REL]->(:Artifact)<-[:DEF_REL]-(:DefenseTech) } THEN 1 ELSE 0 END) AS attacks_with_defense
            """
        )

        dns_rows = client.run_query(
            """
            MATCH (a:Artifact {name: 'DNS Lookup'})<-[:OFF_REL]-(o:OffenseTech)
            OPTIONAL MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
            OPTIONAL MATCH (t)-[:NEXT_TACTIC]->(nt:Tactic)
            RETURN
                o.name AS attack,
                collect(DISTINCT t.name) AS tactics,
                collect(DISTINCT nt.name) AS next_tactics
            ORDER BY attack
            """
        )

        print("Coverage:", coverage[0] if coverage else {})
        print("DNS Lookup relations:")
        for row in dns_rows:
            print(row)
    finally:
        client.close()


if __name__ == "__main__":
    run_enrichment()
