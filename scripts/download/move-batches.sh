#!/bin/bash

# 复制指定区块范围内的所有batch文件到一个文件夹
# 使用方法: ./move-batches.sh <start_block> <end_block> [source_path] [target_path]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认参数
START_BLOCK=${1:-29288526}
END_BLOCK=${2:-29331726}
SOURCE_PATH=${3:-"./data/arbitrage_analysis_full/batches"}
TARGET_PATH=${4:-"./selected_batches"}

# 显示帮助信息
show_help() {
    echo -e "${BLUE}使用方法:${NC}"
    echo "  $0 <start_block> <end_block> [source_path] [target_path]"
    echo ""
    echo -e "${BLUE}参数说明:${NC}"
    echo "  start_block   开始区块号 (默认: 29288526)"
    echo "  end_block     结束区块号 (默认: 29331726)"
    echo "  source_path   源文件夹路径 (默认: ./data/arbitrage_analysis_full/batches)"
    echo "  target_path   目标文件夹路径 (默认: ./selected_batches)"
    echo ""
    echo -e "${BLUE}示例:${NC}"
    echo "  $0 29288526 29331726"
    echo "  $0 29632000 29632100 ./my_batches ./filtered_batches"
    echo ""
}

# 检查参数
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# 验证区块号
if ! [[ "$START_BLOCK" =~ ^[0-9]+$ ]] || ! [[ "$END_BLOCK" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}错误: 区块号必须是数字${NC}"
    exit 1
fi

if [ "$START_BLOCK" -gt "$END_BLOCK" ]; then
    echo -e "${RED}错误: 开始区块号不能大于结束区块号${NC}"
    exit 1
fi

# 检查源路径是否存在
if [ ! -d "$SOURCE_PATH" ]; then
    echo -e "${RED}错误: 源路径不存在: $SOURCE_PATH${NC}"
    exit 1
fi

# 创建目标目录
mkdir -p "$TARGET_PATH"
echo -e "${GREEN}创建目标目录: $TARGET_PATH${NC}"

echo -e "${BLUE}=== 区块文件复制工具 ===${NC}"
echo -e "开始区块: ${YELLOW}$START_BLOCK${NC}"
echo -e "结束区块: ${YELLOW}$END_BLOCK${NC}"
echo -e "源路径: ${YELLOW}$SOURCE_PATH${NC}"
echo -e "目标路径: ${YELLOW}$TARGET_PATH${NC}"
echo ""

# 计算需要处理的文件数量
echo -e "${BLUE}正在计算需要处理的文件数量...${NC}"

TOTAL_FILES=0
for ((i=START_BLOCK; i<=END_BLOCK; i+=100)); do
    TOTAL_FILES=$((TOTAL_FILES + 1))
done

echo -e "需要处理的文件数量: ${YELLOW}$TOTAL_FILES${NC}"
echo ""

# 查找匹配的文件
echo -e "${BLUE}正在查找匹配的文件...${NC}"

MATCHING_FILES=()
MISSING_FILES=()
TOTAL_SIZE=0

for ((i=START_BLOCK; i<=END_BLOCK; i+=100)); do
    end_block=$((i + 99))
    if [ $end_block -gt $END_BLOCK ]; then
        end_block=$END_BLOCK
    fi
    
    filename="batch_${i}_${end_block}.json"
    filepath="$SOURCE_PATH/$filename"
    
    if [ -f "$filepath" ]; then
        file_size=$(stat -c%s "$filepath" 2>/dev/null || echo "0")
        file_size_mb=$(echo "scale=2; $file_size / 1024 / 1024" | bc 2>/dev/null || echo "0")
        
        MATCHING_FILES+=("$filename")
        TOTAL_SIZE=$((TOTAL_SIZE + file_size))
        
        echo -e "  ${GREEN}✓${NC} $filename ($file_size_mb MB)"
    else
        MISSING_FILES+=("$filename")
        echo -e "  ${RED}✗${NC} $filename (文件不存在)"
    fi
done

echo ""
echo -e "找到的文件: ${GREEN}${#MATCHING_FILES[@]}${NC}"
echo -e "缺失的文件: ${RED}${#MISSING_FILES[@]}${NC}"

# 计算总大小（MB）
TOTAL_SIZE_MB=$(echo "scale=2; $TOTAL_SIZE / 1024 / 1024" | bc 2>/dev/null || echo "0")
echo -e "总大小: ${YELLOW}${TOTAL_SIZE_MB} MB${NC}"

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}缺失的文件列表:${NC}"
    for file in "${MISSING_FILES[@]}"; do
        echo -e "  - $file"
    done
fi

if [ ${#MATCHING_FILES[@]} -eq 0 ]; then
    echo -e "${RED}没有找到匹配的文件${NC}"
    exit 1
fi

# 显示文件列表
echo ""
echo -e "${BLUE}匹配的文件列表:${NC}"
for file in "${MATCHING_FILES[@]}"; do
    filepath="$SOURCE_PATH/$file"
    file_size=$(stat -c%s "$filepath" 2>/dev/null || echo "0")
    file_size_mb=$(echo "scale=2; $file_size / 1024 / 1024" | bc 2>/dev/null || echo "0")
    echo -e "  $file (${file_size_mb} MB)"
done

# 询问是否继续
echo ""
echo -e "${YELLOW}是否继续复制这些文件到 $TARGET_PATH ? (y/N)${NC}"
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}操作已取消${NC}"
    exit 0
fi

# 开始复制文件
echo ""
echo -e "${BLUE}开始复制文件...${NC}"

COPIED_COUNT=0
FAILED_COUNT=0

for file in "${MATCHING_FILES[@]}"; do
    source_file="$SOURCE_PATH/$file"
    target_file="$TARGET_PATH/$file"
    
    if [ -f "$target_file" ]; then
        echo -e "${YELLOW}文件已存在，跳过: $file${NC}"
        continue
    fi
    
    if cp "$source_file" "$target_file" 2>/dev/null; then
        echo -e "${GREEN}✓ 复制成功: $file${NC}"
        COPIED_COUNT=$((COPIED_COUNT + 1))
    else
        echo -e "${RED}✗ 复制失败: $file${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done

# 显示复制结果
echo ""
echo -e "${BLUE}=== 复制完成 ===${NC}"
echo -e "成功复制: ${GREEN}$COPIED_COUNT${NC}"
echo -e "复制失败: ${RED}$FAILED_COUNT${NC}"

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}所有文件复制成功！${NC}"
else
    echo -e "${RED}有文件复制失败，请检查错误信息${NC}"
fi

# 显示目标文件夹信息
echo ""
echo -e "${BLUE}目标文件夹信息:${NC}"
target_files_count=$(ls -1 "$TARGET_PATH"/*.json 2>/dev/null | wc -l)
target_size=$(du -sh "$TARGET_PATH" 2>/dev/null | cut -f1)

echo -e "文件数量: ${YELLOW}$target_files_count${NC}"
echo -e "总大小: ${YELLOW}$target_size${NC}"
echo -e "目标路径: ${YELLOW}$(realpath "$TARGET_PATH")${NC}"
echo -e "源文件保留: ${GREEN}是${NC}"

echo ""
echo -e "${GREEN}操作完成！${NC}"
