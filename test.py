import requests
import json

# Replace this with your backend URL
BASE_URL = "http://127.0.0.1:9120"

# API endpoint
url = f"{BASE_URL}/conference/create"

# Request body (update with real phone numbers for testing)
payload = {
    "teacher_phone": "8989946541",
    "student_phones": ["9826029030", "6264945723"]
}

headers = {
    "Content-Type": "application/json"
}

try:
    print("Sending request to:", url)
    response = requests.post(url, headers=headers, data=json.dumps(payload))

    print("\nStatus Code:", response.status_code)
    print("Response Body:")
    print(response.text)

except requests.exceptions.RequestException as e:
    print("Error:", e)
