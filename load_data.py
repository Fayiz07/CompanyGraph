import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password"))

# Realistic 50-person company structure
COMPANY_STRUCTURE = {
    "CEO": {"name": "James Smith", "role": "CEO", "dept": "Executive", "reports_to": None},
    
    # Executives
    "VP_Eng": {"name": "Mary Johnson", "role": "VP of Engineering", "dept": "Engineering", "reports_to": "CEO"},
    "VP_Sales": {"name": "John Williams", "role": "VP of Sales", "dept": "Sales", "reports_to": "CEO"},
    "VP_Mktg": {"name": "Patricia Brown", "role": "VP of Marketing", "dept": "Marketing", "reports_to": "CEO"},
    "VP_HR": {"name": "Robert Jones", "role": "VP of HR", "dept": "HR", "reports_to": "CEO"},
    "VP_Fin": {"name": "Jennifer Garcia", "role": "VP of Finance", "dept": "Finance", "reports_to": "CEO"},
    "VP_Prod": {"name": "Michael Miller", "role": "VP of Product", "dept": "Product", "reports_to": "CEO"},
    
    # Engineering Department
    "Dir_Eng": {"name": "Linda Davis", "role": "Director of Engineering", "dept": "Engineering", "reports_to": "VP_Eng"},
    "EM_1": {"name": "William Rodriguez", "role": "Engineering Manager (Frontend)", "dept": "Engineering", "reports_to": "Dir_Eng"},
    "EM_2": {"name": "Elizabeth Martinez", "role": "Engineering Manager (Backend)", "dept": "Engineering", "reports_to": "Dir_Eng"},
    "EM_3": {"name": "David Hernandez", "role": "Engineering Manager (DevOps)", "dept": "Engineering", "reports_to": "Dir_Eng"},
    
    # Engineers
    "Eng_1": {"name": "Barbara Lopez", "role": "Frontend Engineer", "dept": "Engineering", "reports_to": "EM_1"},
    "Eng_2": {"name": "Richard Gonzalez", "role": "Frontend Engineer", "dept": "Engineering", "reports_to": "EM_1"},
    "Eng_3": {"name": "Susan Wilson", "role": "Frontend Engineer", "dept": "Engineering", "reports_to": "EM_1"},
    "Eng_4": {"name": "Joseph Anderson", "role": "Backend Engineer", "dept": "Engineering", "reports_to": "EM_2"},
    "Eng_5": {"name": "Jessica Thomas", "role": "Backend Engineer", "dept": "Engineering", "reports_to": "EM_2"},
    "Eng_6": {"name": "Thomas Taylor", "role": "Backend Engineer", "dept": "Engineering", "reports_to": "EM_2"},
    "Eng_7": {"name": "Sarah Moore", "role": "Backend Engineer", "dept": "Engineering", "reports_to": "EM_2"},
    "Eng_8": {"name": "Charles Jackson", "role": "DevOps Engineer", "dept": "Engineering", "reports_to": "EM_3"},
    "Eng_9": {"name": "Karen Martin", "role": "DevOps Engineer", "dept": "Engineering", "reports_to": "EM_3"},
    
    # Sales Department
    "Dir_Sales": {"name": "Christopher Lee", "role": "Director of Sales", "dept": "Sales", "reports_to": "VP_Sales"},
    "SM_1": {"name": "Nancy Perez", "role": "Sales Manager (Enterprise)", "dept": "Sales", "reports_to": "Dir_Sales"},
    "SM_2": {"name": "Daniel Thompson", "role": "Sales Manager (Mid-Market)", "dept": "Sales", "reports_to": "Dir_Sales"},
    "AE_1": {"name": "Lisa White", "role": "Account Executive", "dept": "Sales", "reports_to": "SM_1"},
    "AE_2": {"name": "Paul Harris", "role": "Account Executive", "dept": "Sales", "reports_to": "SM_1"},
    "AE_3": {"name": "Margaret Sanchez", "role": "Account Executive", "dept": "Sales", "reports_to": "SM_1"},
    "AE_4": {"name": "Mark Clark", "role": "Account Executive", "dept": "Sales", "reports_to": "SM_2"},
    "AE_5": {"name": "Sandra Ramirez", "role": "Account Executive", "dept": "Sales", "reports_to": "SM_2"},
    
    # Marketing Department
    "MM_1": {"name": "Donald Lewis", "role": "Marketing Manager", "dept": "Marketing", "reports_to": "VP_Mktg"},
    "Mktg_1": {"name": "Ashley Robinson", "role": "Content Marketing Specialist", "dept": "Marketing", "reports_to": "MM_1"},
    "Mktg_2": {"name": "Steven Walker", "role": "SEO Specialist", "dept": "Marketing", "reports_to": "MM_1"},
    "Mktg_3": {"name": "Kimberly Young", "role": "Social Media Manager", "dept": "Marketing", "reports_to": "MM_1"},
    "Mktg_4": {"name": "Andrew Allen", "role": "Event Coordinator", "dept": "Marketing", "reports_to": "MM_1"},
    
    # HR Department
    "HRM_1": {"name": "Emily King", "role": "HR Manager", "dept": "HR", "reports_to": "VP_HR"},
    "HR_1": {"name": "Joshua Wright", "role": "Technical Recruiter", "dept": "HR", "reports_to": "HRM_1"},
    "HR_2": {"name": "Donna Scott", "role": "HR Generalist", "dept": "HR", "reports_to": "HRM_1"},
    "HR_3": {"name": "Kenneth Torres", "role": "Payroll Specialist", "dept": "HR", "reports_to": "HRM_1"},
    
    # Finance Department
    "FM_1": {"name": "Carol Nguyen", "role": "Finance Manager", "dept": "Finance", "reports_to": "VP_Fin"},
    "Fin_1": {"name": "Kevin Hill", "role": "Senior Accountant", "dept": "Finance", "reports_to": "FM_1"},
    "Fin_2": {"name": "Amanda Flores", "role": "Financial Analyst", "dept": "Finance", "reports_to": "FM_1"},
    "Fin_3": {"name": "Brian Green", "role": "Accounts Payable", "dept": "Finance", "reports_to": "FM_1"},
    
    # Product Department
    "PM_1": {"name": "Melissa Adams", "role": "Senior Product Manager", "dept": "Product", "reports_to": "VP_Prod"},
    "PM_2": {"name": "George Nelson", "role": "Product Manager (Platform)", "dept": "Product", "reports_to": "VP_Prod"},
    "PM_3": {"name": "Deborah Baker", "role": "Product Manager (Mobile)", "dept": "Product", "reports_to": "VP_Prod"},
    "PM_4": {"name": "Edward Hall", "role": "UI/UX Designer", "dept": "Product", "reports_to": "VP_Prod"}
}

PROJECTS = {
    "Proj_Apollo": "Project Apollo (Backend Overhaul)",
    "Proj_Zeus": "Project Zeus (Enterprise Sales Expansion)",
    "Proj_Athena": "Project Athena (Q3 Marketing Campaign)",
    "Proj_Hermes": "Project Hermes (Mobile App Redesign)",
    "Proj_Hera": "Project Hera (Employee Wellness Program)"
}

PROJECT_ASSIGNMENTS = {
    "Proj_Apollo": {"manager": "EM_2", "workers": ["Eng_4", "Eng_5", "Eng_6", "Eng_7", "PM_2"]},
    "Proj_Zeus": {"manager": "Dir_Sales", "workers": ["SM_1", "AE_1", "AE_2", "Fin_2"]},
    "Proj_Athena": {"manager": "MM_1", "workers": ["Mktg_1", "Mktg_2", "Mktg_3", "Eng_1"]},
    "Proj_Hermes": {"manager": "PM_3", "workers": ["PM_4", "Eng_2", "Eng_3"]},
    "Proj_Hera": {"manager": "HRM_1", "workers": ["HR_2", "Fin_3"]}
}

def load_data():
    with GraphDatabase.driver(URI, auth=AUTH) as driver:
        driver.verify_connectivity()
        print("Connected to Neo4j. Loading realistic dataset...")
        
        with driver.session() as session:
            # Clear existing data
            print("Clearing existing data...")
            session.run("MATCH (n) DETACH DELETE n")

            print("Generating Departments...")
            departments = set(emp["dept"] for emp in COMPANY_STRUCTURE.values())
            for dept in departments:
                session.run("CREATE (d:Department {name: $name})", name=dept)

            print("Generating Projects...")
            for proj_id, proj_name in PROJECTS.items():
                session.run("CREATE (p:Project {id: $id, name: $name})", id=proj_id, name=proj_name)

            print("Generating Employees and their Departments...")
            for emp_id, emp_data in COMPANY_STRUCTURE.items():
                # Create Employee
                session.run("""
                CREATE (e:Employee {id: $id, name: $name, role: $role})
                """, id=emp_id, name=emp_data["name"], role=emp_data["role"])
                
                # Assign to Department
                session.run("""
                MATCH (e:Employee {id: $emp_id})
                MATCH (d:Department {name: $dept})
                CREATE (e)-[:WORKS_IN]->(d)
                """, emp_id=emp_id, dept=emp_data["dept"])

            print("Generating Reporting Structure...")
            for emp_id, emp_data in COMPANY_STRUCTURE.items():
                if emp_data["reports_to"]:
                    session.run("""
                    MATCH (e:Employee {id: $emp_id})
                    MATCH (m:Employee {id: $mgr_id})
                    CREATE (e)-[:REPORTS_TO]->(m)
                    """, emp_id=emp_id, mgr_id=emp_data["reports_to"])

            print("Generating Project Assignments...")
            for proj_id, assignment in PROJECT_ASSIGNMENTS.items():
                mgr_id = assignment["manager"]
                session.run("""
                MATCH (e:Employee {id: $mgr_id})
                MATCH (p:Project {id: $proj_id})
                CREATE (e)-[:MANAGES]->(p)
                """, mgr_id=mgr_id, proj_id=proj_id)
                
                for worker_id in assignment["workers"]:
                    session.run("""
                    MATCH (e:Employee {id: $worker_id})
                    MATCH (p:Project {id: $proj_id})
                    CREATE (e)-[:WORKS_ON]->(p)
                    """, worker_id=worker_id, proj_id=proj_id)

            print(f"Data loaded successfully! Created {len(COMPANY_STRUCTURE)} real employees with proper hierarchical relationships.")

if __name__ == "__main__":
    try:
        load_data()
    except Exception as e:
        print(f"Error loading data: {e}")
