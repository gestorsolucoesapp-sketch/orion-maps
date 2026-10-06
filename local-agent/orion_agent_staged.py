"""Compatibility entry point: the installed agent owns all processing fixes."""

import orion_agent as agent


# Keep existing import names working without replacing the core functions again.
staged_nodeodm_new_task = agent.nodeodm_new_task
resilient_update_job = agent.update_job


if __name__ == "__main__":
    agent.main()
