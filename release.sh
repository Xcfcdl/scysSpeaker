#!/bin/bash

# 进入项目根目录
cd "$(dirname "$0")"

echo "开始全量同步开发版文件到 release 目录..."

# 1. 同步主目录下的核心文件
cp -v *.js release/
cp -v *.html release/
cp -v *.css release/
cp -v manifest.json release/

# 2. 同步 images 资源（如有）
#if [ -d images ]; then
#  mkdir -p release/images
#  cp -vr images/* release/images/
#fi

# 3. 同步其它静态资源（如有其它资源目录，可仿照添加）
# if [ -d assets ]; then
#   mkdir -p release/assets
#   cp -vr assets/* release/assets/
# fi

echo "release 目录已是最新开发版。"

# 4. 打包 release 目录内容为 zip（放在 release 目录外面）
ZIPNAME="scysSpeaker-release-$(date +%Y%m%d_%H%M%S).zip"
echo "正在打包为 $ZIPNAME ..."
cd release && zip -r "../$ZIPNAME" . && cd ..

echo "打包完成，文件在 $ZIPNAME"
