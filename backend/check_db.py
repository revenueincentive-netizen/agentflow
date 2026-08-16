import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
import os

DB_URL = "postgresql+asyncpg://neondb_owner:npg_3Vbp1UiOKMaH@ep-still-hat-axp5yw6e.c-4.us-east-2.aws.neon.tech/neondb?ssl=require"

async def main():
    engine = create_async_engine(DB_URL)
    async with AsyncSession(engine) as db:
        # List agents and connectors
        agents = await db.execute(text("SELECT id, name, connector_ids, llm_config_id FROM agents"))
        print("=== AGENTS ===")
        for row in agents:
            print(f"  {row.id} | {row.name} | connectors={row.connector_ids} | llm_config={row.llm_config_id}")
        
        connectors = await db.execute(text("SELECT id, name, connector_type, rag_status FROM connectors"))
        print("\n=== CONNECTORS ===")
        for row in connectors:
            print(f"  {row.id} | {row.name} | type={row.connector_type} | status={row.rag_status}")
        
        llms = await db.execute(text("SELECT id, provider, model, is_default FROM llm_configs"))
        print("\n=== LLM CONFIGS ===")
        for row in llms:
            print(f"  {row.id} | {row.provider} | {row.model} | default={row.is_default}")
    
    await engine.dispose()

asyncio.run(main())
