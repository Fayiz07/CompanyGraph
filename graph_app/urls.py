from django.urls import path
from .views import get_employee_graph, get_department_stats, get_all_employees, expand_node, shortest_path, deep_hierarchy, project_connections, get_overview_graph

urlpatterns = [
    path('graph/', get_employee_graph, name='get_employee_graph'),
    path('stats/', get_department_stats, name='get_department_stats'),
    path('employees/', get_all_employees, name='get_all_employees'),
    path('expand/', expand_node, name='expand_node'),
    path('shortest-path/', shortest_path, name='shortest_path'),
    path('hierarchy/', deep_hierarchy, name='deep_hierarchy'),
    path('projects/', project_connections, name='project_connections'),
    path('overview/', get_overview_graph, name='get_overview_graph'),
]
