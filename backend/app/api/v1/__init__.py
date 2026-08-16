from fastapi import APIRouter

from app.api.v1 import auth, agents, llm_config, connectors

router = APIRouter()
router.include_router(auth.router)
router.include_router(agents.router)
router.include_router(llm_config.router)
router.include_router(connectors.router)
