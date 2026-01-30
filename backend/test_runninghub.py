"""
RunningHub API测试脚本

测试换装API：
1. 上传图片到RunningHub
2. 创建换装任务
3. 轮询任务状态

使用方法：
python test_runninghub.py

查看工作流节点信息：
登录 RunningHub 后台 -> 选择你的工作流 -> 查看节点ID和输入字段名称

重要：需要在脚本中配置正确的 NODE_CONFIG
"""
import asyncio
import sys
import os
import httpx
import json
from pathlib import Path

# =====================================================
# 配置区域 - 请根据你的RunningHub工作流修改这些值
# =====================================================

API_KEY = os.environ.get("RUNNINGHUB_API_KEY", "")  # 从环境变量读取
BASE_URL = "https://www.runninghub.cn"
TRY_ON_APP_ID = "2016740236478386178"

# 测试图片路径
MODEL_IMAGE_PATH = r"F:\LLM\projects\ComfyUI\input\mie\1111.png"
CLOTHING_IMAGE_PATH = r"F:\LLM\projects\ComfyUI\input\mie\ComfyUI_00001_adzxu_1769172104.png"

# =====================================================
# 节点配置 - 需要从RunningHub后台获取正确的值
# 登录后台 -> 我的工作流 -> 点击工作流 -> 查看API文档/节点信息
#
# nodeId: 节点的唯一标识（通常是数字字符串）
# fieldName: 节点的输入字段名（如 "image", "input_image" 等）
# =====================================================

# =====================================================
# 节点配置 - 需要从RunningHub后台获取正确的值
#
# 如何获取nodeId:
# 1. 登录 RunningHub 后台
# 2. 打开你的工作流
# 3. 点击需要传入图片的节点
# 4. 查看节点的ID（通常在节点左上角或属性面板中显示）
# 5. 找到图片输入字段的名称（通常是 "image"）
# =====================================================

# 方案1: 使用nodeId + fieldName格式
# TODO: 请替换为你工作流中实际的节点ID！
NODE_CONFIG_V1 = [
    {
        "nodeId": "107",       # 模特图节点ID - 请替换！
        "fieldName": "image",
    },
    {
        "nodeId": "285",       # 服装图节点ID - 请替换！
        "fieldName": "image",
    },
]

# 方案2: 备选格式
NODE_CONFIG_V2 = [
    {
        "nodeId": "441",
        "fieldName": "image",
    },
    {
        "nodeId": "446",
        "fieldName": "image",
    },
]

# HTTP客户端配置
TIMEOUT = httpx.Timeout(30.0, read=120.0)


async def upload_image(image_path: str) -> str | None:
    """上传图片到RunningHub"""
    print(f"\n上传图片: {image_path}")

    path = Path(image_path)
    if not path.exists():
        print(f"错误: 文件不存在 - {image_path}")
        return None

    image_data = path.read_bytes()
    filename = path.name

    # 根据文件扩展名确定MIME类型
    suffix = path.suffix.lower()
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    mime_type = mime_types.get(suffix, "image/png")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # 使用 /task/openapi/upload 端点
        files = {"file": (filename, image_data, mime_type)}
        data = {"apiKey": API_KEY}

        print(f"POST {BASE_URL}/task/openapi/upload")
        response = await client.post(
            f"{BASE_URL}/task/openapi/upload",
            data=data,
            files=files,
        )

        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")

        if result.get("code") == 0:
            filename = result.get("data", {}).get("fileName")
            print(f"上传成功! Filename: {filename}")
            return filename
        else:
            print(f"上传失败: {result.get('msg')}")
            return None


async def create_task_with_config(
    model_image: str,
    clothing_image: str,
    node_config: list,
    config_name: str
) -> str | None:
    """使用指定的节点配置创建任务 - 按照官方文档格式"""
    print(f"\n{'='*50}")
    print(f"创建任务 - {config_name}")
    print('='*50)

    # 按照官方文档格式构建nodeInfoList
    node_inputs = [
        {
            "nodeId": node_config[1]["nodeId"],  # 服装图
            "fieldName": node_config[1]["fieldName"],
            "fieldValue": clothing_image,
            "description": "上传服饰图"
        },
        {
            "nodeId": node_config[0]["nodeId"],  # 人物图
            "fieldName": node_config[0]["fieldName"],
            "fieldValue": model_image,
            "description": "上传人物图"
        },
    ]

    # 官方文档格式的请求体
    payload = {
        "nodeInfoList": node_inputs,
        "instanceType": "default",
        "usePersonalQueue": "false"
    }

    # 使用Bearer Token认证
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    endpoint = f"{BASE_URL}/openapi/v2/run/ai-app/{TRY_ON_APP_ID}"

    print(f"\nPOST {endpoint}")
    print(f"Headers: Authorization: Bearer {API_KEY[:10]}...{API_KEY[-4:]}")
    print(f"请求体: {json.dumps(payload, indent=2, ensure_ascii=False)}")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.post(
                endpoint,
                headers=headers,
                json=payload,
            )

            print(f"\n状态码: {response.status_code}")
            result = response.json()
            print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")

            # 检查成功 - 多种可能的响应格式
            task_id = None
            if isinstance(result.get("data"), dict):
                task_id = result["data"].get("taskId")
            elif result.get("taskId"):
                task_id = result["taskId"]

            if task_id:
                print(f"\n任务创建成功! TaskID: {task_id}")
                return task_id

            # 检查错误
            error_msg = result.get("errorMessage") or result.get("msg")
            error_code = result.get("errorCode") or result.get("code")
            print(f"\n任务创建失败: [{error_code}] {error_msg}")

        except Exception as e:
            print(f"请求错误: {e}")

    return None


async def get_task_status(task_id: str) -> dict:
    """获取任务状态 - 使用apiKey in body"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    payload = {
        "taskId": task_id,
        "apiKey": API_KEY
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"{BASE_URL}/task/openapi/outputs",
            headers=headers,
            json=payload,
        )
        return response.json()


async def wait_for_completion(task_id: str, max_wait: int = 180) -> dict:
    """轮询等待任务完成"""
    print(f"\n{'='*50}")
    print(f"等待任务完成 (最长等待 {max_wait}秒)")
    print('='*50)

    elapsed = 0
    poll_interval = 5

    while elapsed < max_wait:
        print(f"\n查询任务状态 [{elapsed}s]...")
        result = await get_task_status(task_id)

        # 解析响应
        code = result.get("code")
        msg = result.get("msg", "")
        data = result.get("data", {}) if isinstance(result.get("data"), dict) else {}

        print(f"code: {code}, msg: {msg}")

        # 成功获取到结果
        if code == 0:
            print(f"\n任务成功完成!")
            print(f"完整响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
            return result

        # 任务失败
        if msg == "APIKEY_TASK_STATUS_ERROR" or code == 805:
            failed_reason = data.get("failedReason", {})
            exception_type = failed_reason.get("exception_type", "Unknown")
            node_name = failed_reason.get("node_name", "Unknown")
            print(f"\n任务执行失败!")
            print(f"错误类型: {exception_type}")
            print(f"错误节点: {node_name}")
            print(f"详情: {json.dumps(failed_reason, indent=2, ensure_ascii=False)[:500]}")
            return result

        # 任务还在运行中
        if code == 804 or msg == "TASK_RUNNING":
            print(f"任务运行中... 等待 {poll_interval}秒后重试")
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            continue

        # 其他状态
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)[:300]}")
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

    print(f"\n超时! 任务在 {max_wait}秒内未完成")
    return {}


async def test_api_endpoints():
    """测试各种API端点，寻找正确的接口"""
    print(f"\n{'='*60}")
    print("测试API端点 - 寻找正确的接口格式")
    print('='*60)

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # 测试1: 获取账户信息
        print("\n--- 测试: 账户/余额信息 ---")
        endpoints_account = [
            ("/task/openapi/account", "POST", {"apiKey": API_KEY}),
            ("/openapi/v2/account", "POST", {"apiKey": API_KEY}),
            ("/openapi/v2/balance", "POST", {"apiKey": API_KEY}),
        ]

        for path, method, payload in endpoints_account:
            try:
                print(f"\n{method} {path}")
                if method == "POST":
                    resp = await client.post(f"{BASE_URL}{path}", json=payload)
                else:
                    resp = await client.get(f"{BASE_URL}{path}", params=payload)
                print(f"状态: {resp.status_code}")
                print(f"响应: {resp.text[:300]}")
            except Exception as e:
                print(f"错误: {e}")

        # 测试2: 获取工作流/应用信息
        print("\n--- 测试: 工作流信息 ---")
        endpoints_workflow = [
            (f"/task/openapi/workflow/{TRY_ON_APP_ID}", "GET", {"apiKey": API_KEY}),
            (f"/task/openapi/app/detail", "POST", {"apiKey": API_KEY, "appId": TRY_ON_APP_ID}),
            (f"/openapi/v2/workflow/{TRY_ON_APP_ID}/inputs", "POST", {"apiKey": API_KEY}),
        ]

        for path, method, payload in endpoints_workflow:
            try:
                print(f"\n{method} {path}")
                if method == "POST":
                    resp = await client.post(f"{BASE_URL}{path}", json=payload)
                else:
                    resp = await client.get(f"{BASE_URL}{path}", params=payload)
                print(f"状态: {resp.status_code}")
                print(f"响应: {resp.text[:300]}")
            except Exception as e:
                print(f"错误: {e}")


async def main():
    """主测试流程"""
    print("="*60)
    print("RunningHub API 测试脚本")
    print("="*60)
    print(f"\nAPI Key: {API_KEY[:10]}...{API_KEY[-4:]}")
    print(f"Base URL: {BASE_URL}")
    print(f"换装 App ID: {TRY_ON_APP_ID}")
    print(f"模特图片: {MODEL_IMAGE_PATH}")
    print(f"服装图片: {CLOTHING_IMAGE_PATH}")

    # 检查参数
    if "--test" in sys.argv:
        await test_api_endpoints()
        return

    # Step 1: 上传图片
    print("\n" + "="*60)
    print("Step 1: 上传图片")
    print("="*60)

    model_url = await upload_image(MODEL_IMAGE_PATH)
    if not model_url:
        print("模特图片上传失败")
        return

    clothing_url = await upload_image(CLOTHING_IMAGE_PATH)
    if not clothing_url:
        print("服装图片上传失败")
        return

    # Step 2: 创建任务 - 尝试多种方式
    print("\n" + "="*60)
    print("Step 2: 创建任务")
    print("="*60)

    task_id = None

    # 尝试配置V1
    task_id = await create_task_with_config(model_url, clothing_url, NODE_CONFIG_V1, "Config V1")

    # 尝试配置V2
    if not task_id:
        task_id = await create_task_with_config(model_url, clothing_url, NODE_CONFIG_V2, "Config V2 (数字ID)")

    if not task_id:
        print("\n" + "="*60)
        print("所有任务创建方式都失败了!")
        print("="*60)
        print("""
请按以下步骤排查:

1. 登录 RunningHub 后台: https://www.runninghub.cn
2. 进入 "我的工作流" 或 "API管理"
3. 找到你的换装工作流
4. 查看工作流的节点配置:
   - 找到输入节点的 nodeId (通常是数字，如 "1", "28", "35" 等)
   - 找到输入字段的名称 (如 "image", "input_image" 等)
5. 修改此脚本中的 NODE_CONFIG_V1 配置

示例:
如果后台显示模特图节点ID是 "28"，服装图节点ID是 "35"，字段名是 "image"
则修改为:
NODE_CONFIG_V1 = [
    {"nodeId": "28", "fieldName": "image"},
    {"nodeId": "35", "fieldName": "image"},
]

也可以查看 RunningHub 的 API 文档获取正确的调用格式。
        """)
        return

    # Step 3: 等待完成
    print("\n" + "="*60)
    print("Step 3: 等待任务完成")
    print("="*60)

    result = await wait_for_completion(task_id)

    print("\n" + "="*60)
    print("测试完成!")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
