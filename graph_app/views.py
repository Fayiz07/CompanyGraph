from rest_framework.decorators import api_view
from rest_framework.response import Response
from neo4j import GraphDatabase
import os

URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))

@api_view(['GET'])
def get_employee_graph(request):
    employee_name = request.GET.get('employee', None)
    if not employee_name:
        return Response({"error": "Please provide an employee name."}, status=400)

    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                # Query: Find employee by name (case-insensitive approximation) and get nodes within 2 hops
                # We use regex for case-insensitive matching if needed, but let's stick to simple first
                # Or we can just use `toLower(e.name) CONTAINS toLower($name)`
                
                query = """
                MATCH (start:Employee)
                WHERE toLower(start.name) CONTAINS toLower($name)
                MATCH path = (start)-[*1..2]-(connected)
                RETURN path
                """
                
                # If the employee has no connections within 2 hops, they might still exist
                # But our query only returns if there are paths. Let's also return the start node itself.
                query_start = """
                MATCH (start:Employee)
                WHERE toLower(start.name) CONTAINS toLower($name)
                RETURN start
                """

                # Let's combine this logic effectively
                # A better approach for vis.js: just return all nodes and edges in the paths
                
                cypher_query = """
                MATCH (start:Employee)
                WHERE toLower(start.name) = toLower($name)
                OPTIONAL MATCH path = (start)-[*1..2]-(connected)
                RETURN start, paths(path) AS p
                """
                
                # A simpler cypher that returns nodes and relationships directly
                cypher_query_2 = """
                MATCH (start:Employee)
                WHERE toLower(start.name) CONTAINS toLower($name)
                CALL {
                    WITH start
                    MATCH path = (start)-[*0..2]-(connected)
                    UNWIND nodes(path) AS n
                    UNWIND relationships(path) AS r
                    RETURN collect(distinct n) AS nodes, collect(distinct r) AS rels
                }
                RETURN nodes, rels
                """
                
                # Wait, Neo4j 4.0+ CALL {} subqueries require attention.
                # Let's use a standard robust query:
                robust_query = """
                MATCH (start:Employee)
                WHERE toLower(start.name) CONTAINS toLower($name)
                OPTIONAL MATCH path = (start)-[*1..2]-(connected)
                WITH start, collect(path) as paths
                
                // Extract nodes and relationships
                WITH start, paths, 
                     [p IN paths | nodes(p)] AS path_nodes,
                     [p IN paths | relationships(p)] AS path_rels
                     
                // Flatten
                WITH start, 
                     reduce(s = [start], n IN path_nodes | s + n) AS all_nodes,
                     reduce(s = [], r IN path_rels | s + r) AS all_rels
                     
                UNWIND all_nodes AS n
                WITH DISTINCT n, all_rels
                
                // Return nodes
                WITH collect({id: elementId(n), labels: labels(n), properties: properties(n)}) AS nodes, all_rels
                
                UNWIND (CASE WHEN size(all_rels) > 0 THEN all_rels ELSE [null] END) AS r
                WITH nodes, DISTINCT r
                WHERE r IS NOT NULL
                
                WITH nodes, collect({id: elementId(r), source: elementId(startNode(r)), target: elementId(endNode(r)), type: type(r), properties: properties(r)}) AS edges
                
                RETURN nodes, edges
                """
                
                # To support older Neo4j versions, let's use id() instead of elementId() just in case.
                fallback_query = """
                MATCH (start:Employee)
                WHERE toLower(start.name) CONTAINS toLower($name)
                WITH start LIMIT 5
                
                OPTIONAL MATCH p1 = (start)-[:REPORTS_TO*1..2]-(colleague)
                WITH start, collect(p1) as paths1
                
                OPTIONAL MATCH p2 = (start)-[:WORKS_IN|WORKS_ON|MANAGES]-(entity)
                WITH start, paths1, collect(p2) as paths2
                
                RETURN start, paths1 + paths2 as paths
                """
                
                result = session.run(fallback_query, name=employee_name)
                
                nodes_dict = {}
                edges_dict = {}
                
                for record in result:
                    start_node = record["start"]
                    if start_node.element_id not in nodes_dict:
                        nodes_dict[start_node.element_id] = {
                            "id": start_node.element_id,
                            "label": list(start_node.labels)[0] if start_node.labels else "Unknown",
                            "properties": dict(start_node)
                        }
                    
                    paths = record["paths"]
                    for path in paths:
                        if path is None: continue
                        for node in path.nodes:
                            if node.element_id not in nodes_dict:
                                nodes_dict[node.element_id] = {
                                    "id": node.element_id,
                                    "label": list(node.labels)[0] if node.labels else "Unknown",
                                    "properties": dict(node)
                                }
                        for rel in path.relationships:
                            if rel.element_id not in edges_dict:
                                edges_dict[rel.element_id] = {
                                    "id": rel.element_id,
                                    "source": rel.start_node.element_id,
                                    "target": rel.end_node.element_id,
                                    "type": rel.type,
                                    "properties": dict(rel)
                                }
                
                return Response({
                    "nodes": list(nodes_dict.values()),
                    "edges": list(edges_dict.values())
                })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": f"Neo4j Connection Error: {str(e)}"}, status=500)

@api_view(['GET'])
def get_department_stats(request):
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH (e:Employee)-[:WORKS_IN]->(d:Department)
                RETURN d.name as department, count(e) as employee_count
                ORDER BY employee_count DESC
                """
                result = session.run(query)
                stats = []
                for record in result:
                    stats.append({
                        "department": record["department"],
                        "count": record["employee_count"]
                    })
                return Response(stats)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
