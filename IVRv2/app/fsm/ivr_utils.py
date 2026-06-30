import json
import os
from typing import Optional, List

import aiohttp

from app.fsm.ivr_constants import quiz_new

async def get_content(content_ids: Optional[List[str]] = None):
    """
    Fetches content from the server. If content_ids is provided,
    fetch only those contents by ID. Otherwise, fetch all IVR content.
    """
    api_url = os.environ.get("SEEDS_SERVER_BASE_URL", "") + "content"
    headers = {
        'authToken': 'postman'
    }

    try:
        async with aiohttp.ClientSession() as session:
            if content_ids:
                # Fetch by IDs
                params = [('ids[]', content_id) for content_id in content_ids]
                async with session.get(api_url, headers=headers, params=params) as response:
                    response.raise_for_status()
                    response_data = await response.text()
                    contents = json.loads(response_data)
            else:
                # Fetch ALL
                async with session.get(api_url, headers=headers) as response:
                    response.raise_for_status()
                    response_data = await response.text()
                    contents = json.loads(response_data)

                # Filter only pull-model, processed, and not-deleted content
                contents = [
                    x for x in contents
                    if all(key in x for key in ["isPullModel", "isDeleted", "isProcessed"])
                    and x["isPullModel"]
                    and x["isProcessed"]
                    and not x["isDeleted"]
                ]
                # Append quiz_new to the filtered list
                contents.append(quiz_new)

        return contents

    except aiohttp.ClientError as e:
        print(f"Client error: {e}")
        return {"error": "Client error occurred while fetching content."}
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return {"error": "Failed to decode JSON response."}
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {"error": "An unexpected error occurred."}