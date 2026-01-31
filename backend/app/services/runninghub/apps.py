"""RunningHub application configurations."""
from dataclasses import dataclass
from typing import Any

from app.config import get_settings

settings = get_settings()


@dataclass
class NodeInput:
    """Input node configuration."""
    node_id: str
    field_name: str
    field_type: str = "image"  # image, text, number, video
    # Optional params key used to lookup value in params.
    # When omitted, field_name is used.
    param_key: str | None = None


@dataclass
class AppConfig:
    """RunningHub application configuration."""
    app_id: str
    name: str
    description: str
    inputs: list[NodeInput]
    timeout: int = 300  # seconds


# Application configurations with actual node IDs from RunningHub
# 换装工作流节点:
#   - 人物图节点ID: 107
#   - 服装图节点ID: 285
TRY_ON_CONFIG = AppConfig(
    app_id=settings.runninghub_try_on_app_id,
    name="Virtual Try-On",
    description="AI-powered virtual clothing try-on",
    inputs=[
        NodeInput(node_id="107", field_name="model_image", field_type="image"),  # 人物图
        NodeInput(node_id="285", field_name="clothing_image", field_type="image"),  # 服装图
    ],
    timeout=180,
)

# 换背景工作流节点:
#   - 人物图节点ID: 441
#   - 背景图节点ID: 446
BACKGROUND_CONFIG = AppConfig(
    app_id=settings.runninghub_background_app_id,
    name="Background Change",
    description="AI-powered background replacement",
    inputs=[
        NodeInput(node_id="441", field_name="source_image", field_type="image"),  # 人物图
        NodeInput(node_id="446", field_name="background_image", field_type="image"),  # 背景图
    ],
    timeout=120,
)

VIDEO_CONFIG = AppConfig(
    app_id=settings.runninghub_video_app_id,
    name="Video Motion Transfer",
    description="Transfer motion from reference video to a person image",
    inputs=[
        NodeInput(node_id="167", field_name="image", field_type="image", param_key="person_image"),
        NodeInput(node_id="52", field_name="video", field_type="video", param_key="reference_video"),
        NodeInput(node_id="254", field_name="value", field_type="number", param_key="skip_seconds"),
        NodeInput(node_id="255", field_name="value", field_type="number", param_key="duration"),
        NodeInput(node_id="257", field_name="value", field_type="number", param_key="fps"),
        NodeInput(node_id="264", field_name="value", field_type="number", param_key="width"),
        NodeInput(node_id="265", field_name="value", field_type="number", param_key="height"),
    ],
    timeout=600,
)


def get_app_config(task_type: str) -> AppConfig:
    """Get application config by task type."""
    configs = {
        "try_on": TRY_ON_CONFIG,
        "background": BACKGROUND_CONFIG,
        "video": VIDEO_CONFIG,
    }
    config = configs.get(task_type)
    if config is None:
        raise ValueError(f"Unknown task type: {task_type}")
    return config


def build_node_inputs(
    config: AppConfig,
    params: dict[str, Any]
) -> list[dict[str, Any]]:
    """Build node inputs for RunningHub API.

    Note: For image type inputs, fieldName should be "image" according to RunningHub API.
    The field_name in NodeInput is used as the key to lookup the value in params.
    """
    node_inputs = []
    for node_input in config.inputs:
        key = node_input.param_key or node_input.field_name
        value = params.get(key)
        if value is not None:
            # For image type, use "image" as fieldName (RunningHub requirement)
            api_field_name = "image" if node_input.field_type == "image" else node_input.field_name
            node_inputs.append({
                "nodeId": node_input.node_id,
                "fieldName": api_field_name,
                "fieldValue": value,
            })
    return node_inputs
