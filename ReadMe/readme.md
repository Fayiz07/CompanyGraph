# Company Graph Application

This is a full-stack application that visualizes organizational hierarchy and relationships using a Graph Database. It allows a non-technical user to easily explore complex, multi-hop employee connections that would typically be awkward and slow to query in a traditional relational database.

## Tech Stack
- **Database:** CognoDB (Neo4j)
- **Backend:** Django and Django REST Framework (Python)
- **Frontend:** React, Vite, CSS
- **Visualization:** Vis.js (Force-directed network graphs) & Recharts

## Graph Data Model

The data model uses labeled nodes, typed relationships, and properties to map out the company structure. 

### Nodes
- **Employee:** Contains id, name, and role.
- **Department:** Contains name.
- **Project:** Contains name.

### Relationships
- **REPORTS_TO:** Connects an Employee to their Manager (Employee).
- **WORKS_IN:** Connects an Employee to a Department.
- **WORKS_ON:** Connects an Individual Contributor to a Project.
- **MANAGES:** Connects a Manager to a Project.

## Core Features & Recent Updates

- **Advanced Graph Analytics:** Run sophisticated queries directly against the database from the UI. Find the **Shortest Path** between any two people, extract deep **Reporting Hierarchies**, or discover extensive **Project Collaborations**.
- **Interactive Network Visualization:** Click any node to view detailed profile cards. **Double-click** any node to dynamically query the database and instantly expand their connections directly within the existing graph!
- **Company Breakdown Chart:** A beautiful Recharts bar chart showing department distributions.
- **Global Employee Directory:** A searchable modal overlay allowing you to browse every single employee in the organization.
- **Automatic Contextualization:** Running advanced analytics intelligently auto-selects the queried employee, immediately displaying their full profile.

## UI and UX Design

The frontend was meticulously designed with a modern, intentional Dashboard Interface:

- **Nord-Inspired Dark Theme:** The application features a highly polished, professional dark mode UI. It uses a deep, clean background (`#0d1117`) paired with a vibrant, modern accent palette (Teal, Blue, Violet, Fuchsia, Rose, Amber) that makes data visualizations pop.
- **Mobile Responsive Design:** The layout flawlessly scales down to mobile and tablet screens using CSS media queries. Panels smartly transition from split-screen to vertical stacks without losing interactivity or readability.
- **Refined Micro-interactions:** Smooth CSS transitions on search bars, hover effects, zoom/pan controls, and polished loading states.
- **Error Handling:** Graceful empty states and error messages with intuitive "Back to Home" recovery options.

### Application Demo
![Dashboard Demo 1](DemoIMG-1.jpg)
![Dashboard Demo 2](DemoIMG-2.jpg)
![Dashboard Demo 3](DemoIMG-3.jpg)

## Cypher Queries

### The Awkward SQL Query (Multi-hop Traversal)
The backend uses a parameterised Cypher query to find an employee and traverse their 2-hop neighborhood. In a traditional SQL database, traversing a recursive reporting hierarchy (manager -> employee -> direct reports) and pulling their respective departments requires complex, nested JOINs or recursive CTEs. 

In Cypher, this 2-hop hierarchy traversal is extremely simple and fast:

```cypher
MATCH (start:Employee)
WHERE toLower(start.name) CONTAINS toLower($name)
WITH start LIMIT 5

// 1. Traverse up to 2 levels of management (up or down)
OPTIONAL MATCH p1 = (start)-[:REPORTS_TO*1..2]-(colleague)
WITH start, collect(p1) as paths1

// 2. Direct projects and departments (1 hop)
OPTIONAL MATCH p2 = (start)-[:WORKS_IN|WORKS_ON|MANAGES]-(entity)
WITH start, paths1, collect(p2) as paths2

RETURN start, paths1 + paths2 as paths
```
*(Note: We strictly use parameterised queries via the official Neo4j Python driver to prevent injection attacks and ensure optimal query caching.)*

## Setup and Installation

### 1. Environment Variables
Create a `.env` file in the root directory (never commit this file) with your CognoDB credentials:
```env
NEO4J_URI=bolt+s://<your-db-url>
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your-password>
```

### 2. Load Seed Data
A realistic dataset of 45 employees is generated algorithmically to properly test the graph's capabilities.
```bash
python load_data.py
```

### 3. Run Backend (Django)
```bash
cd backend
python manage.py runserver
```
API will run at `http://localhost:8000/api/graph/?employee=name`

### 4. Run Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
UI will run at `http://localhost:5173`
