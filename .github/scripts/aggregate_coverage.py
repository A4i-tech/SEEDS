import json
import os
import glob
from pathlib import Path

def extract_node_coverage(coverage_dir):
    summary_file = os.path.join(coverage_dir, 'coverage-summary.json')
    if os.path.exists(summary_file):
        with open(summary_file, 'r') as f:
            data = json.load(f)
        return {
            'lines': data['total']['lines']['pct'],
            'statements': data['total']['statements']['pct'],
            'functions': data['total']['functions']['pct'],
            'branches': data['total']['branches']['pct']
        }
    return None

def extract_python_coverage(coverage_dir):
    json_file = os.path.join(coverage_dir, 'coverage.json')
    if os.path.exists(json_file):
        with open(json_file, 'r') as f:
            data = json.load(f)
        return {
            'lines': round(data['totals']['percent_covered'], 1),
            'statements': round(data['totals']['percent_covered'], 1),
            'functions': 0,  # Python coverage doesn't track functions the same way
            'branches': round(float(data['totals']['percent_covered_display']), 1) if 'percent_covered_display' in data['totals'] else 0
        }
    return None

# Services and their types
services = {
    'backend-server': 'node',
    'teacher-webapp': 'node',
    'ContentWebApp': 'node',
    'websocket-service': 'node',
    'ConferenceV2': 'python',
    'IVRv2': 'python'
}

coverage_data = {}
total_lines = 0
total_services = 0

for service, service_type in services.items():
    coverage_dir = f'coverage-artifacts/{service}-coverage'
    if os.path.exists(coverage_dir):
        if service_type == 'node':
            coverage = extract_node_coverage(coverage_dir)
        else:
            coverage = extract_python_coverage(coverage_dir)

        if coverage:
            coverage_data[service] = coverage
            total_lines += coverage['lines']
            total_services += 1
            print(f"{service}: {coverage['lines']}%")

# Calculate overall average
if total_services == 0:
    print("⚠️ WARNING: No coverage artifacts found!")
    print("This workflow needs coverage artifacts from service workflows.")
    print("It should run after deploy workflows complete, or artifacts must exist from previous runs.")
    overall_coverage = 0
else:
    overall_coverage = round(total_lines / total_services, 1)
    print(f"✅ Calculated overall coverage from {total_services} service(s)")

# Generate markdown report
report = "## 📊 Test Coverage Report\n\n"
report += f"**Overall Coverage: {overall_coverage}%**\n\n"
report += "| Service | Coverage | Status |\n"
report += "|---------|----------|--------|\n"

for service, coverage in coverage_data.items():
    status = "🟢" if coverage['lines'] >= 80 else "🟡" if coverage['lines'] >= 60 else "🔴"
    service_name = service.replace('-', ' ').title()
    report += f"| {service_name} | {coverage['lines']}% | {status} |\n"

# Add services without coverage
for service in services.keys():
    if service not in coverage_data:
        service_name = service.replace('-', ' ').title()
        report += f"| {service_name} | No tests | ⚫ |\n"

report += "\n### 📈 Coverage Details\n\n"
for service, coverage in coverage_data.items():
    service_name = service.replace('-', ' ').title()
    report += f"**{service_name}:**\n"
    report += f"- Lines: {coverage['lines']}%\n"
    report += f"- Statements: {coverage['statements']}%\n"
    if coverage['functions'] > 0:
        report += f"- Functions: {coverage['functions']}%\n"
    if coverage['branches'] > 0:
        report += f"- Branches: {coverage['branches']}%\n"
    report += "\n"

report += "---\n"
report += "*Coverage data collected from automated tests in CI pipeline*\n"

# Write report to file
with open('coverage_report.md', 'w') as f:
    f.write(report)

# Write outputs to GITHUB_OUTPUT file
output_file = os.environ.get('GITHUB_OUTPUT')
if output_file:
    with open(output_file, 'a') as f:
        f.write(f"overall_coverage={overall_coverage}\n")
        f.write(f"services_tested={total_services}\n")
        f.write(f"total_services={len(services)}\n")
else:
    # Fallback: print to stdout for debugging
    print(f"::notice::overall_coverage={overall_coverage}")
    print(f"::notice::services_tested={total_services}")
    print(f"::notice::total_services={len(services)}")

print(f"Overall Coverage: {overall_coverage}%")
print(f"Services Tested: {total_services}")
print(f"Total Services: {len(services)}")
