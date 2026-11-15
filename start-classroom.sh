#!/bin/bash
# 学情课堂服务 - Linux/Mac 启动脚本

if ! command -v node &>/dev/null; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js LTS 版本"
  echo "Mac:   brew install node"
  echo "Linux: curl -fsSL https://deb.nodesource.com/setup_lts | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

echo "正在启动学情课堂服务..."
cd "$(dirname "$0")"
node xiaoshu-server.js
