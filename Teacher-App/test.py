import requests

# Your ngrok / backend URL
url = "https://amorphously-stolid-michelle.ngrok-free.dev/content"

# UUID(s) to fetch
ids = ["0e02e8ed-9515-4c4b-80b1-d76fe5f3db41"]

# Authorization token
auth_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZWY0NjA3MWFmYTgzOTE1YzhhNmM5YSIsImVtYWlsIjoidWlAZ21haWwuY29tIiwibmFtZSI6InV1IiwiaWF0IjoxNzYwNTExNDk4LCJleHAiOjE3NjA1OTc4OTh9.nXId58wQmoLOw_q682Cwsocf6OL79EdorujDvcOdWXo"

# Prepare query parameters
# params = {
#     "ids": ",".join(ids)
# }

# Headers with Bearer token
headers = {
    "Authorization": f"Bearer {auth_token}"
}
params = {
    "ids": "0e02e8ed-9515-4c4b-80b1-d76fe5f3db41"
}

response = requests.get(url, headers=headers, params=params)

print("Status code:", response.status_code)
print("Response JSON:", response.text)