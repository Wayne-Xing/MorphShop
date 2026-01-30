#!/usr/bin/env python3
"""
敏感信息检测 Hook for Claude Code
检查写入和编辑操作中的 API 密钥、令牌、密码等敏感信息
"""
import json
import sys
import re
import os

# 敏感信息正则模式
SENSITIVE_PATTERNS = [
    (r"(?i)api[_-]?key\s*[:=]\s*['\"]?([a-zA-Z0-9_\-]{20,})['\"]?", "API Key"),
    (r"(?i)secret[_-]?key\s*[:=]\s*['\"]?([a-zA-Z0-9_\-]{16,})['\"]?", "Secret Key"),
    (r"(?i)password\s*[:=]\s*['\"]([^'\"]{8,})['\"]", "Password"),
    (r"(?i)token\s*[:=]\s*['\"]?([a-zA-Z0-9_\-]{20,})['\"]?", "Token"),
    (r"(?i)bearer\s+([a-zA-Z0-9_\-]{20,})", "Bearer Token"),
    (r"['\"]([a-f0-9]{32})['\"]", "32-char Hex (possible API key)"),
]

# 排除的文件
EXCLUDED_PATTERNS = [
    '.env.example',
    'check-secrets.py',
    'pre-commit',
    '.md',
]

def check_content(content: str, file_path: str = "") -> list:
    """检查内容中的敏感信息"""
    # 跳过排除的文件
    for excluded in EXCLUDED_PATTERNS:
        if excluded in file_path:
            return []

    issues = []
    for pattern, name in SENSITIVE_PATTERNS:
        for match in re.finditer(pattern, content):
            # 跳过环境变量引用
            context = content[max(0, match.start()-30):match.end()+10]
            if 'environ' in context or 'getenv' in context or 'os.environ' in context:
                continue
            if '${' in context or '$(' in context:
                continue

            line_num = content[:match.start()].count('\n') + 1
            issues.append({
                "type": name,
                "line": line_num,
                "match": match.group(0)[:50] + "..." if len(match.group(0)) > 50 else match.group(0)
            })

    return issues

def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    content = ""
    file_path = ""

    if tool_name == "Write":
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("content", "")
    elif tool_name == "Edit":
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("new_string", "")
    elif tool_name == "Bash":
        content = tool_input.get("command", "")
        file_path = "bash_command"
    else:
        sys.exit(0)

    issues = check_content(content, file_path)

    if issues:
        print(f"[BLOCKED] 检测到敏感信息!", file=sys.stderr)
        for issue in issues:
            print(f"  - {issue['type']} (line {issue['line']}): {issue['match']}", file=sys.stderr)
        print(f"\n请使用环境变量代替硬编码的敏感信息。", file=sys.stderr)
        sys.exit(2)  # Exit code 2 blocks the operation

    sys.exit(0)

if __name__ == "__main__":
    main()
