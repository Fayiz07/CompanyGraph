from django.urls import path
from .views import get_employee_graph, get_department_stats, get_all_employees

urlpatterns = [
    path('graph/', get_employee_graph, name='get_employee_graph'),
    path('stats/', get_department_stats, name='get_department_stats'),
    path('employees/', get_all_employees, name='get_all_employees'),
]
