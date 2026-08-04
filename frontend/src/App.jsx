import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Network as NetworkIcon, User, Building, Briefcase, Users, CheckCircle, BarChart2, Home, List, X, Info } from 'lucide-react';
import { Network as VisNetwork } from 'vis-network';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './index.css';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [graphData, setGraphData] = useState(null);
  
  // New states for multiple matches
  const [matchingNodes, setMatchingNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);
  const [statsData, setStatsData] = useState([]);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [showDirectory, setShowDirectory] = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [activeQuery, setActiveQuery] = useState(null);
  const [queryInputs, setQueryInputs] = useState({ source: '', target: '', employee: '' });
  
  const [overviewData, setOverviewData] = useState(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  
  const graphRef = useRef(null);
  const networkRef = useRef(null);
  const overviewGraphRef = useRef(null);
  const overviewNetworkRef = useRef(null);

  const handleSearch = async (e, overrideTerm) => {
    e?.preventDefault();
    const termToSearch = overrideTerm || searchTerm;
    if (!termToSearch.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setGraphData(null);
    setMatchingNodes([]);
    setSelectedNodeId(null);
    setSelectedNodeDetails(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/graph/?employee=${encodeURIComponent(termToSearch)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch graph data');
      }

      if (data.nodes.length === 0) {
        setError('No employee found with that name.');
      } else {
        setGraphData(data);
        
        // Find ALL root nodes that match the search term
        const matches = data.nodes.filter(n => n.label === 'Employee' && n.properties.name.toLowerCase().includes(termToSearch.toLowerCase()));
        
        setMatchingNodes(matches);
        
        if (matches.length > 0) {
          handleSelectNode(matches[0].id, data);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNode = (nodeId, data = graphData) => {
    setSelectedNodeId(nodeId);
    const rootNode = data.nodes.find(n => n.id === nodeId);
    if (rootNode) {
      setSelectedNodeDetails(extractNodeDetails(rootNode, data));
    }
    
    // Highlight node in vis-network
    if (networkRef.current) {
      try {
        networkRef.current.selectNodes([nodeId]);
        networkRef.current.focus(nodeId, { scale: 1.2, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
      } catch (e) {
        console.warn("Could not select node", nodeId, e);
      }
    }
  };

  const extractNodeDetails = (rootNode, data) => {
    const managerEdge = data.edges.find(e => e.source === rootNode.id && e.type === 'REPORTS_TO');
    const manager = managerEdge ? data.nodes.find(n => n.id === managerEdge.target) : null;
    
    // Manager's manager
    let managersManager = null;
    if (manager) {
      const mmEdge = data.edges.find(e => e.source === manager.id && e.type === 'REPORTS_TO');
      managersManager = mmEdge ? data.nodes.find(n => n.id === mmEdge.target) : null;
    }

    // Coworkers (same manager, excluding self)
    let coworkers = [];
    if (manager) {
      const coworkerEdges = data.edges.filter(e => e.target === manager.id && e.type === 'REPORTS_TO' && e.source !== rootNode.id);
      coworkers = coworkerEdges.map(e => data.nodes.find(n => n.id === e.source)).filter(Boolean);
    }
    
    const reportsEdges = data.edges.filter(e => e.target === rootNode.id && e.type === 'REPORTS_TO');
    const reports = reportsEdges.map(e => data.nodes.find(n => n.id === e.source)).filter(Boolean);

    // Indirect reports
    let indirectReports = [];
    reports.forEach(report => {
      const irEdges = data.edges.filter(e => e.target === report.id && e.type === 'REPORTS_TO');
      indirectReports.push(...irEdges.map(e => data.nodes.find(n => n.id === e.source)).filter(Boolean));
    });

    const deptEdge = data.edges.find(e => e.source === rootNode.id && e.type === 'WORKS_IN');
    const department = deptEdge ? data.nodes.find(n => n.id === deptEdge.target) : null;
    
    const projectEdges = data.edges.filter(e => e.source === rootNode.id && (e.type === 'WORKS_ON' || e.type === 'MANAGES'));
    const projects = projectEdges.map(e => data.nodes.find(n => n.id === e.target)).filter(Boolean);

    // Project collaborators
    let collaborators = [];
    projects.forEach(project => {
      const collEdges = data.edges.filter(e => e.target === project.id && (e.type === 'WORKS_ON' || e.type === 'MANAGES') && e.source !== rootNode.id);
      collaborators.push(...collEdges.map(e => data.nodes.find(n => n.id === e.source)).filter(Boolean));
    });
    // Remove duplicates from collaborators
    collaborators = [...new Map(collaborators.map(item => [item.id, item])).values()];

    return {
      ...rootNode.properties,
      manager: manager ? manager.properties.name : 'None',
      managersManager: managersManager ? managersManager.properties.name : null,
      coworkers: coworkers.map(c => c.properties.name),
      reports: reports.map(r => r.properties.name),
      indirectReports: indirectReports.map(r => r.properties.name),
      department: department ? department.properties.name : 'Unknown',
      projects: projects.map(p => p.properties.name),
      collaborators: collaborators.map(c => c.properties.name)
    };
  };

  useEffect(() => {
    // Fetch stats and overview on mount
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    
    fetch(`${apiUrl}/api/stats/`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStatsData(data);
        } else {
          console.error("Stats API returned an error:", data);
        }
        setIsStatsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch stats", err);
        setIsStatsLoading(false);
      });

    fetch(`${apiUrl}/api/overview/`)
      .then(res => res.json())
      .then(data => {
        if (data.nodes && data.edges) {
          setOverviewData(data);
        }
        setIsOverviewLoading(false);
      })
      .catch(err => {
        setIsOverviewLoading(false);
      });

    fetch(`${apiUrl}/api/employees/`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllEmployees(data);
        }
      })
      .catch(err => console.error("Failed to fetch employees", err));
  }, []);

  const openDirectory = () => {
    setShowDirectory(true);
  };

  const handleDirectoryClick = (name) => {
    setShowDirectory(false);
    setSearchTerm(name);
    handleSearch(null, name);
  };

  const handleHome = () => {
    setSearchTerm('');
    setHasSearched(false);
    setGraphData(null);
    setMatchingNodes([]);
    setSelectedNodeId(null);
    setSelectedNodeDetails(null);
    setActiveQuery(null);
  };

  const executeAdvancedQuery = async (type) => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setGraphData(null);
    setMatchingNodes([]);
    setSelectedNodeId(null);
    setSelectedNodeDetails(null);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      let endpoint = '';
      if (type === 'shortest') endpoint = `/api/shortest-path/?source=${encodeURIComponent(queryInputs.source)}&target=${encodeURIComponent(queryInputs.target)}`;
      else if (type === 'hierarchy') endpoint = `/api/hierarchy/?manager=${encodeURIComponent(queryInputs.employee)}`;
      else if (type === 'projects') endpoint = `/api/projects/?employee=${encodeURIComponent(queryInputs.employee)}`;
      
      const response = await fetch(`${apiUrl}${endpoint}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to fetch graph data');
      
      setGraphData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (graphRef.current && graphData) {
      const nodes = graphData.nodes.map(node => ({
        id: node.id,
        label: node.label === 'Employee' 
          ? `*${node.properties.name}*\n${node.properties.role || 'Employee'}` 
          : `*${node.properties.name}*\n${node.label}`,
        group: node.label,
        title: JSON.stringify(node.properties, null, 2),
      }));

      const edges = graphData.edges.map(edge => {
        const isReportsTo = edge.type === 'REPORTS_TO';
        return {
          from: isReportsTo ? edge.target : edge.source,
          to: isReportsTo ? edge.source : edge.target,
          label: edge.type.replace('_', ' '),
          font: { 
            align: 'middle', 
            color: '#e2e8f0', // Brighter text 
            size: 11,
            strokeWidth: 4, // Dark outline to pop against lines
            strokeColor: '#0f172a',
            vadjust: -15 // Push slightly above the line
          },
          // For REPORTS_TO, reverse the arrow so it still points to the manager visually
          arrows: isReportsTo ? { from: { enabled: true, scaleFactor: 0.5 }, to: { enabled: false } } : undefined
        };
      });

      const data = { nodes, edges };
      
      const options = {
        nodes: {
          shape: 'box',
          margin: 12,
          font: { color: '#ffffff', face: 'Inter, sans-serif', size: 13, multi: true, bold: '14px Inter' },
          borderWidth: 2,
          borderWidthSelected: 4,
          shadow: { enabled: true, color: 'rgba(0,0,0,0.4)', size: 10, x: 0, y: 4 },
          shapeProperties: { borderRadius: 12 }
        },
        edges: {
          color: { color: '#64748b', highlight: '#94a3b8' },
          width: 2,
          smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 },
          arrows: { to: { enabled: true, scaleFactor: 0.6 } }
        },
        groups: {
          Employee: { color: { background: '#2563eb', border: '#60a5fa', highlight: { background: '#1d4ed8', border: '#93c5fd' } } },
          Department: { color: { background: '#059669', border: '#34d399', highlight: { background: '#047857', border: '#6ee7b7' } } },
          Project: { color: { background: '#d97706', border: '#fbbf24', highlight: { background: '#b45309', border: '#fcd34d' } } }
        },
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            nodeSpacing: 350,
            levelSeparation: 180
          }
        },
        physics: {
          enabled: false
        },
        interaction: { hover: true, tooltipDelay: 200, selectConnectedEdges: false }
      };

      if (networkRef.current) {
        networkRef.current.destroy();
      }

      networkRef.current = new VisNetwork(graphRef.current, data, options);
      
      // Auto-select initial node once network is stable
      if (selectedNodeId) {
        networkRef.current.once("afterDrawing", () => {
          try {
            networkRef.current.selectNodes([selectedNodeId]);
          } catch (e) {
            console.warn("Could not select node on init", selectedNodeId, e);
          }
        });
      }
      
      // Handle node click in graph to sync with left panel
      networkRef.current.on('click', function (params) {
        if (params.nodes.length > 0) {
          const clickedNodeId = params.nodes[0];
          const isMatch = matchingNodes.some(n => n.id === clickedNodeId);
          if (isMatch) {
            handleSelectNode(clickedNodeId, graphData);
          } else {
             // If clicking random node, just highlight it natively but don't change profile unless it's an employee
             const node = graphData.nodes.find(n => n.id === clickedNodeId);
             if (node && node.label === 'Employee') {
                setSelectedNodeId(clickedNodeId);
                setSelectedNodeDetails(extractNodeDetails(node, graphData));
             }
          }
        }
      });
      // Handle node double click to expand graph
      networkRef.current.on('doubleClick', async function (params) {
        if (params.nodes.length > 0) {
          const clickedNodeId = params.nodes[0];
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/api/expand/?node_id=${encodeURIComponent(clickedNodeId)}`);
            const newData = await response.json();
            if (newData.nodes && newData.edges) {
               setGraphData(prev => {
                  const existingNodesMap = new Map(prev.nodes.map(n => [n.id, n]));
                  newData.nodes.forEach(n => existingNodesMap.set(n.id, n));
                  
                  const existingEdges = prev.edges;
                  const edgeSet = new Set(existingEdges.map(e => `${e.source}-${e.target}-${e.type}`));
                  const newEdges = [];
                  newData.edges.forEach(e => {
                    const key = `${e.source}-${e.target}-${e.type}`;
                    if (!edgeSet.has(key)) {
                      edgeSet.add(key);
                      newEdges.push(e);
                    }
                  });
                  return { nodes: Array.from(existingNodesMap.values()), edges: [...existingEdges, ...newEdges] };
               });
            }
          } catch(e) {
            console.error("Failed to expand node", e);
          }
        }
      });

    }
  }, [graphData]); // Re-run only when graphData completely changes

  useEffect(() => {
    if (overviewGraphRef.current && overviewData) {
      const nodes = overviewData.nodes.map(node => ({
        id: node.id,
        label: node.label === 'Employee' 
          ? `*${node.properties.name}*\n${node.properties.role || 'Employee'}` 
          : `*${node.properties.name}*\n${node.label}`,
        group: node.label,
        title: JSON.stringify(node.properties, null, 2),
      }));

      const edges = overviewData.edges.map(edge => {
        return {
          from: edge.source,
          to: edge.target,
          label: edge.type,
          font: { 
            align: 'middle', 
            color: '#e2e8f0', 
            size: 9,
            strokeWidth: 2, 
            strokeColor: '#0f172a',
            vadjust: -10 
          },
          arrows: { to: { enabled: false } }
        };
      });

      const options = {
        nodes: {
          shape: 'box',
          margin: 12,
          font: { color: '#ffffff', face: 'Inter, sans-serif', size: 13, multi: true, bold: '14px Inter' },
          borderWidth: 2,
          borderWidthSelected: 4,
          shadow: { enabled: true, color: 'rgba(0,0,0,0.4)', size: 10, x: 0, y: 4 },
          shapeProperties: { borderRadius: 12 }
        },
        edges: {
          color: { color: '#64748b', highlight: '#94a3b8' },
          width: 2,
          smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 },
          arrows: { to: { enabled: true, scaleFactor: 0.6 } }
        },
        groups: {
          Employee: { color: { background: '#5e81ac', border: '#81a1c1', highlight: { background: '#4c566a', border: '#eceff4' } } },
          Department: { color: { background: '#a3be8c', border: '#8fbcbb', highlight: { background: '#81a1c1', border: '#88c0d0' } } },
          Project: { color: { background: '#ebcb8b', border: '#d08770', highlight: { background: '#bf616a', border: '#d8dee9' } } }
        },
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            nodeSpacing: 350,
            levelSeparation: 180
          }
        },
        physics: {
          enabled: false
        },
        interaction: { hover: true, tooltipDelay: 200, selectConnectedEdges: false, zoomView: true, dragView: true }
      };

      if (overviewNetworkRef.current) {
        overviewNetworkRef.current.destroy();
      }

      const network = new VisNetwork(overviewGraphRef.current, { nodes, edges }, options);
      overviewNetworkRef.current = network;

      network.once("afterDrawing", function() {
        network.moveTo({
          scale: 0.4,
          animation: {
            duration: 800,
            easingFunction: 'easeInOutQuad'
          }
        });
      });
    }
  }, [overviewData, hasSearched]);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Company Graph Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            type="button" 
            onClick={() => setShowGuide(true)} 
            className="search-button" 
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Info size={18} /> Guide
          </button>
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={20} />
              <select
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
                style={{ appearance: 'none', paddingLeft: '2.5rem' }}
              >
                <option value="">Select an employee...</option>
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="search-button" disabled={isLoading}>
              {isLoading ? <Loader2 className="spinner" size={20} /> : 'Search'}
            </button>
          </form>
        </div>
      </header>

      <main className="main-content">
        {!hasSearched && !isLoading && (
          <div className="empty-state" style={{ display: 'flex', flexDirection: 'row', gap: '2rem', height: '100%', minHeight: '500px', width: '100%', alignItems: 'stretch' }}>
            
            {/* Overview Graph (Left) */}
            <div className="graph-card" style={{ flex: '65', display: 'flex', flexDirection: 'column', background: 'var(--card-bg-solid)', borderRadius: '16px', overflow: 'hidden' }}>
              <div className="graph-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><NetworkIcon size={18} /> Company Overview</h3>
              </div>
              {isOverviewLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '300px' }}>
                  <Loader2 className="spinner" size={32} color="var(--primary)" />
                </div>
              ) : (
                <div className="graph-container" ref={overviewGraphRef} style={{ flex: 1, minHeight: '400px' }} />
              )}
            </div>

            {/* Right Column */}
            <div style={{ flex: '35', display: 'flex', flexDirection: 'column', background: 'var(--card-bg-solid)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1.5rem', gap: '2rem', overflow: 'hidden' }}>
              {/* Stats Chart */}
              <div className="stats-container" style={{ width: '100%', height: '300px', flexShrink: 0 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                  <BarChart2 size={24} color="var(--primary)" /> 
                  Company Breakdown
                </h2>
                {isStatsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Loader2 className="spinner" size={32} color="var(--primary)" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <XAxis dataKey="department" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} angle={-25} textAnchor="end" />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                      <Tooltip cursor={{ fill: 'rgba(136, 192, 208, 0.15)' }} contentStyle={{ backgroundColor: 'var(--card-bg-solid)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {statsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#88c0d0', '#81a1c1', '#5e81ac', '#a3be8c', '#ebcb8b', '#b48ead'][index % 6]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
                <p style={{ color: '#94a3b8' }}>Use the search bar above to explore the graph structure for a specific employee.</p>
                <button 
                  onClick={openDirectory}
                  style={{ 
                    background: 'rgba(136, 192, 208, 0.1)', 
                    border: '1px solid rgba(136, 192, 208, 0.5)', 
                    color: '#88c0d0', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '10px 20px', 
                    borderRadius: '999px', 
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    transition: 'all 0.2s',
                    fontWeight: '500'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(136, 192, 208, 0.2)'; e.currentTarget.style.color = '#81a1c1'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(136, 192, 208, 0.1)'; e.currentTarget.style.color = '#88c0d0'; }}
                >
                  <List size={18} /> Browse All Employees
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="loading-state">
            <Loader2 className="spinner large" size={48} />
            <p>Querying CognoDB...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
          </div>
        )}

        {graphData && !isLoading && (
          <div className="dashboard">
            <div className="dashboard-left">
              
              {/* Multiple Matches Selection List */}
              {matchingNodes.length > 1 && (
                <div className="matches-list-card">
                  <h4>Found {matchingNodes.length} matches:</h4>
                  <div className="matches-scroll-container">
                    {matchingNodes.map(node => (
                      <div 
                        key={node.id} 
                        className={`match-item ${selectedNodeId === node.id ? 'selected' : ''}`}
                        onClick={() => handleSelectNode(node.id)}
                      >
                        <div className="match-info">
                          <User size={16} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{node.properties.name}</span>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{node.properties.role}</span>
                          </div>
                        </div>
                        {selectedNodeId === node.id && <CheckCircle size={16} className="text-primary" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Profile Details */}
              {selectedNodeDetails ? (
                <div className="profile-card">
                  <div className="profile-header">
                    <User size={48} className="profile-icon" />
                    <div>
                      <h2>{selectedNodeDetails.name}</h2>
                      <span className="profile-role">{selectedNodeDetails.role}</span>
                    </div>
                  </div>
                  
                  <div className="profile-details">
                    <div className="detail-item">
                      <Building size={18} className="detail-icon" />
                      <div>
                        <strong>Department</strong>
                        <p>{selectedNodeDetails.department}</p>
                      </div>
                    </div>
                    
                    <div className="detail-item">
                      <Users size={18} className="detail-icon" />
                      <div>
                        <strong>Manager</strong>
                        <p>
                          {selectedNodeDetails.manager}
                          {selectedNodeDetails.managersManager && <span style={{fontSize:'0.8rem', color:'#94a3b8', display:'block'}}>Reports to: {selectedNodeDetails.managersManager}</span>}
                        </p>
                      </div>
                    </div>
                    
                    {selectedNodeDetails.coworkers.length > 0 && (
                      <div className="detail-item">
                        <Users size={18} className="detail-icon" />
                        <div>
                          <strong>Coworkers ({selectedNodeDetails.coworkers.length})</strong>
                          <div className="reports-list">
                            {selectedNodeDetails.coworkers.map((cw, idx) => (
                              <span key={idx} className="report-badge">{cw}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="detail-item">
                      <Briefcase size={18} className="detail-icon" />
                      <div>
                        <strong>Projects</strong>
                        <p>{selectedNodeDetails.projects.length > 0 ? selectedNodeDetails.projects.join(', ') : 'None'}</p>
                      </div>
                    </div>

                    {selectedNodeDetails.collaborators.length > 0 && (
                      <div className="detail-item">
                        <Users size={18} className="detail-icon" />
                        <div>
                          <strong>Project Collaborators ({selectedNodeDetails.collaborators.length})</strong>
                          <div className="reports-list">
                            {selectedNodeDetails.collaborators.map((c, idx) => (
                              <span key={idx} className="report-badge">{c}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="detail-item">
                      <Users size={18} className="detail-icon" />
                      <div>
                        <strong>Direct Reports ({selectedNodeDetails.reports.length})</strong>
                        <div className="reports-list">
                          {selectedNodeDetails.reports.length > 0 ? selectedNodeDetails.reports.map((report, idx) => (
                            <span key={idx} className="report-badge">{report}</span>
                          )) : <p>None</p>}
                        </div>
                      </div>
                    </div>

                    {selectedNodeDetails.indirectReports.length > 0 && (
                      <div className="detail-item">
                        <Users size={18} className="detail-icon" />
                        <div>
                          <strong>Indirect Reports ({selectedNodeDetails.indirectReports.length})</strong>
                          <div className="reports-list">
                            {selectedNodeDetails.indirectReports.map((report, idx) => (
                              <span key={idx} className="report-badge">{report}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="profile-card empty">
                  <p>Select a node to view details.</p>
                </div>
              )}

              {/* Advanced Analytics Panel (Moved here) */}
              <div style={{ marginTop: '1.5rem', background: 'var(--card-bg-solid)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: '#f8fafc', fontSize: '1.1rem' }}>Advanced Graph Analytics</h3>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setActiveQuery('shortest')} style={{ background: activeQuery === 'shortest' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-light)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}>Shortest Path</button>
                  <button onClick={() => setActiveQuery('hierarchy')} style={{ background: activeQuery === 'hierarchy' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-light)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}>Hierarchy</button>
                  <button onClick={() => setActiveQuery('projects')} style={{ background: activeQuery === 'projects' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-light)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}>Collabs</button>
                </div>
                
                {activeQuery && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {activeQuery === 'shortest' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <select className="search-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }} value={queryInputs.source} onChange={e => setQueryInputs({...queryInputs, source: e.target.value})}>
                          <option value="">Employee 1</option>
                          {allEmployees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                        </select>
                        <span style={{color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center'}}>to</span>
                        <select className="search-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }} value={queryInputs.target} onChange={e => setQueryInputs({...queryInputs, target: e.target.value})}>
                          <option value="">Employee 2</option>
                          {allEmployees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                        </select>
                        <button className="search-button" style={{minWidth: '0', padding: '0.4rem', marginTop: '0.5rem', fontSize: '0.85rem'}} onClick={() => executeAdvancedQuery('shortest')}>Find Path</button>
                      </div>
                    )}
                    {(activeQuery === 'hierarchy' || activeQuery === 'projects') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <select className="search-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }} value={queryInputs.employee} onChange={e => setQueryInputs({...queryInputs, employee: e.target.value})}>
                          <option value="">Select Employee</option>
                          {allEmployees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                        </select>
                        <button className="search-button" style={{minWidth: '0', padding: '0.4rem', fontSize: '0.85rem'}} onClick={() => executeAdvancedQuery(activeQuery)}>Run Query</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="dashboard-right">
              <div className="graph-card">
                <div className="graph-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Network Visualization</h3>
                  <button 
                    onClick={handleHome} 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      border: 'none', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '6px 12px', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <Home size={16} /> Back to Home
                  </button>
                </div>
                <div className="graph-container" ref={graphRef} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Employee Directory Modal */}
      {showDirectory && (
        <div className="modal-overlay" onClick={() => setShowDirectory(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Employee Directory</h3>
              <button className="close-btn" onClick={() => setShowDirectory(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {isDirectoryLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <Loader2 className="spinner" size={32} color="var(--primary)" />
                </div>
              ) : (
                <div className="directory-grid">
                  {allEmployees.map((emp, idx) => (
                    <div 
                      key={idx} 
                      className="directory-item"
                      onClick={() => handleDirectoryClick(emp.name)}
                    >
                      <User size={16} className="text-primary" />
                      <div>
                        <strong>{emp.name}</strong>
                        <span>{emp.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="modal-overlay" onClick={() => setShowGuide(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>How to Use This Website</h2>
              <button className="close-button" onClick={() => setShowGuide(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <h3 style={{ color: 'var(--text-light)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}><NetworkIcon size={18} color="#88c0d0"/> Purpose</h3>
                <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                  This dashboard is a visualization tool built on top of a Graph Database. It allows you to explore our company's structure, employee hierarchy, and project collaborations in a highly interactive way.
                </p>
              </div>
              <div>
                <h3 style={{ color: 'var(--text-light)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Search size={18} color="#a3be8c"/> Search & Explore</h3>
                <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                  Use the <strong>search dropdown</strong> in the top right to select a specific employee. This will reveal their immediate network, showing who they manage, who they report to, and what projects they work on.
                </p>
              </div>
              <div>
                <h3 style={{ color: 'var(--text-light)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={18} color="#ebcb8b"/> Interactions</h3>
                <ul style={{ color: '#94a3b8', lineHeight: '1.6', paddingLeft: '1.2rem', margin: 0 }}>
                  <li><strong>Click</strong> any node to view detailed information in the side panel.</li>
                  <li><strong>Double-click</strong> any node to automatically expand the graph and pull in their direct connections from the database!</li>
                  <li><strong>Drag</strong> the background to pan, and scroll to zoom.</li>
                </ul>
              </div>
              <div>
                <h3 style={{ color: 'var(--text-light)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}><BarChart2 size={18} color="#b48ead"/> Advanced Analytics</h3>
                <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                  When viewing an employee's profile, look at the bottom of the left panel for <strong>Advanced Graph Analytics</strong>. You can run complex graph algorithms directly against the database to find the Shortest Path between two people, extract deep reporting hierarchies, or discover massive project collaboration webs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
