import asyncio
import websockets


async def handler(websocket):
    try:
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass


async def main():
    async with websockets.serve(handler, "0.0.0.0", 9999):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
