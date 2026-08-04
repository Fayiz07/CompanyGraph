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

@api_view(['GET'])
def get_all_employees(request):
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH (e:Employee)
                RETURN e.name as name, e.role as role
                ORDER BY e.name
                """
                result = session.run(query)
                employees = []
                for record in result:
                    employees.append({
                        "name": record["name"],
                        "role": record["role"]
                    })
                return Response(employees)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def expand_node(request):
    node_id = request.query_params.get('node_id')
    if not node_id:
        return Response({"error": "node_id is required"}, status=400)
    
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH (start)
                WHERE elementId(start) = $node_id OR start.id = $node_id
                MATCH p = (start)-[]-(neighbor)
                RETURN p LIMIT 50
                """
                result = session.run(query, node_id=node_id)
                nodes = {}
                edges = []

                for record in result:
                    path = record["p"]
                    for node in path.nodes:
                        node_id_str = str(node.id)
                        if node_id_str not in nodes:
                            nodes[node_id_str] = {
                                "id": node_id_str,
                                "label": list(node.labels)[0] if node.labels else "Unknown",
                                "properties": dict(node)
                            }
                    for rel in path.relationships:
                        edges.append({
                            "source": str(rel.start_node.id),
                            "target": str(rel.end_node.id),
                            "type": rel.type,
                            "properties": dict(rel)
                        })

                # Deduplicate edges
                unique_edges = []
                seen_edges = set()
                for edge in edges:
                    edge_key = (edge["source"], edge["target"], edge["type"])
                    if edge_key not in seen_edges:
                        seen_edges.add(edge_key)
                        unique_edges.append(edge)

                return Response({
                    "nodes": list(nodes.values()),
                    "edges": unique_edges
                })
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def shortest_path(request):
    source = request.query_params.get('source')
    target = request.query_params.get('target')
    if not source or not target:
        return Response({"error": "source and target are required"}, status=400)
    
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH (a:Employee), (b:Employee)
                WHERE toLower(a.name) CONTAINS toLower($source) AND toLower(b.name) CONTAINS toLower($target)
                MATCH p=shortestPath((a)-[*]-(b))
                RETURN p LIMIT 1
                """
                result = session.run(query, source=source, target=target)
                record = result.single()
                if not record:
                    return Response({"error": "No path found between these employees."}, status=404)
                
                path = record["p"]
                nodes = {}
                edges = []
                for node in path.nodes:
                    node_id_str = str(node.id)
                    if node_id_str not in nodes:
                        nodes[node_id_str] = {
                            "id": node_id_str,
                            "label": list(node.labels)[0] if node.labels else "Unknown",
                            "properties": dict(node)
                        }
                for rel in path.relationships:
                    edges.append({
                        "source": str(rel.start_node.id),
                        "target": str(rel.end_node.id),
                        "type": rel.type,
                        "properties": dict(rel)
                    })
                return Response({"nodes": list(nodes.values()), "edges": edges})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def deep_hierarchy(request):
    manager = request.query_params.get('manager')
    if not manager:
        return Response({"error": "manager is required"}, status=400)
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH p=(employee:Employee)-[:REPORTS_TO*]->(boss:Employee)
                WHERE toLower(boss.name) CONTAINS toLower($manager)
                RETURN p LIMIT 100
                """
                result = session.run(query, manager=manager)
                nodes = {}
                edges = []
                for record in result:
                    path = record["p"]
                    for node in path.nodes:
                        node_id_str = str(node.id)
                        if node_id_str not in nodes:
                            nodes[node_id_str] = {
                                "id": node_id_str,
                                "label": list(node.labels)[0] if node.labels else "Unknown",
                                "properties": dict(node)
                            }
                    for rel in path.relationships:
                        edge_key = (str(rel.start_node.id), str(rel.end_node.id), rel.type)
                        edges.append({
                            "source": str(rel.start_node.id),
                            "target": str(rel.end_node.id),
                            "type": rel.type,
                            "properties": dict(rel)
                        })
                unique_edges = { (e["source"], e["target"], e["type"]): e for e in edges }.values()
                
                if not nodes:
                    return Response({"error": "No hierarchy found for this manager."}, status=404)
                return Response({"nodes": list(nodes.values()), "edges": list(unique_edges)})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def project_connections(request):
    employee = request.query_params.get('employee')
    if not employee:
        return Response({"error": "employee is required"}, status=400)
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH p=(start:Employee)-[:WORKS_ON|MANAGES]->(proj:Project)<-[:WORKS_ON|MANAGES]-(other:Employee)
                WHERE toLower(start.name) CONTAINS toLower($employee)
                RETURN p LIMIT 50
                """
                result = session.run(query, employee=employee)
                nodes = {}
                edges = []
                for record in result:
                    path = record["p"]
                    for node in path.nodes:
                        node_id_str = str(node.id)
                        if node_id_str not in nodes:
                            nodes[node_id_str] = {
                                "id": node_id_str,
                                "label": list(node.labels)[0] if node.labels else "Unknown",
                                "properties": dict(node)
                            }
                    for rel in path.relationships:
                        edges.append({
                            "source": str(rel.start_node.id),
                            "target": str(rel.end_node.id),
                            "type": rel.type,
                            "properties": dict(rel)
                        })
                unique_edges = { (e["source"], e["target"], e["type"]): e for e in edges }.values()
                if not nodes:
                    return Response({"error": "No project connections found."}, status=404)
                return Response({"nodes": list(nodes.values()), "edges": list(unique_edges)})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def get_overview_graph(request):
    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            with driver.session() as session:
                query = """
                MATCH (n)-[r]->(m)
                RETURN n, r, m
                """
                result = session.run(query)
                nodes = {}
                edges = []
                for record in result:
                    n = record["n"]
                    m = record["m"]
                    r = record["r"]
                    
                    if str(n.id) not in nodes:
                        nodes[str(n.id)] = {
                            "id": str(n.id),
                            "label": list(n.labels)[0] if n.labels else "Unknown",
                            "properties": dict(n)
                        }
                    if str(m.id) not in nodes:
                        nodes[str(m.id)] = {
                            "id": str(m.id),
                            "label": list(m.labels)[0] if m.labels else "Unknown",
                            "properties": dict(m)
                        }
                    edges.append({
                        "source": str(r.start_node.id),
                        "target": str(r.end_node.id),
                        "type": r.type,
                        "properties": dict(r)
                    })
                
                unique_edges = { (e["source"], e["target"], e["type"]): e for e in edges }.values()
                return Response({"nodes": list(nodes.values()), "edges": list(unique_edges)})
    except Exception as e:
        return Response({"error": str(e)}, status=500)
