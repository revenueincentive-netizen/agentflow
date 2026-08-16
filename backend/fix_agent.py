import asyncio, json
import asyncpg

DSN = "postgresql://neondb_owner:npg_3Vbp1UiOKMaH@ep-still-hat-axp5yw6e.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require"
AGENT_ID = "c1c8cbfb-853b-45d0-ba29-528c4f843faf"
CONNECTOR_ID = "2aed2c2b-146b-41f7-82c9-b7d189f092ec"
LLM_ID = "e7c1f853-26f2-4b07-9cda-54ec9e26343a"

async def main():
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute("UPDATE llm_configs SET is_default = TRUE WHERE id = $1", LLM_ID)
        cids = json.dumps([CONNECTOR_ID])
        await conn.execute("UPDATE agents SET llm_config_id = $1, connector_ids = $2 WHERE id = $3",
            LLM_ID, cids, AGENT_ID)
        row = await conn.fetchrow("SELECT name, connector_ids, llm_config_id FROM agents WHERE id = $1", AGENT_ID)
        print(f"Agent: {row['name']} | connectors={row['connector_ids']} | llm_config={row['llm_config_id']}")
        llm = await conn.fetchrow("SELECT provider, model, is_default FROM llm_configs WHERE id = $1", LLM_ID)
        print(f"LLM: {llm['provider']}/{llm['model']} | default={llm['is_default']}")
    finally:
        await conn.close()

asyncio.run(main())
