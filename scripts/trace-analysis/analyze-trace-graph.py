import networkx as nx
import plotly.graph_objects as go
import re
from typing import Dict, List, Tuple
import json
import os
from collections import defaultdict
from neo4j import GraphDatabase
from datetime import datetime

class Neo4jGraph:
    def __init__(self, uri="bolt://localhost:7688", user="neo4j", password="password123"):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def create_constraints(self):
        with self.driver.session() as session:
            # 创建唯一性约束
            session.run("CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE")
            session.run("CREATE CONSTRAINT pool_address IF NOT EXISTS FOR (p:Pool) REQUIRE p.address IS UNIQUE")

    def clear_database(self):
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    def create_token(self, address: str):
        with self.driver.session() as session:
            session.run("MERGE (t:Token {address: $address})", address=address)

    def create_pool(self, address: str, pool_type: str):
        with self.driver.session() as session:
            session.run("MERGE (p:Pool {address: $address, type: $type})", 
                       address=address, type=pool_type)

    def create_relationship(self, token_address: str, pool_address: str, 
                          function_name: str, function_result: str):
        with self.driver.session() as session:
            session.run("""
                MATCH (t:Token {address: $token_address})
                MATCH (p:Pool {address: $pool_address})
                MERGE (t)-[r:CONNECTS_TO {
                    function: $function_name,
                    result: $function_result,
                    timestamp: datetime()
                }]->(p)
            """, token_address=token_address, pool_address=pool_address,
                function_name=function_name, function_result=function_result)

    def get_statistics(self):
        with self.driver.session() as session:
            stats = {}
            
            # 获取节点统计
            result = session.run("""
                MATCH (n)
                RETURN labels(n) as type, count(*) as count
            """)
            stats['nodes'] = {record['type'][0]: record['count'] for record in result}
            
            # 获取关系统计
            result = session.run("""
                MATCH ()-[r]->()
                RETURN type(r) as type, count(*) as count
            """)
            stats['relationships'] = {record['type']: record['count'] for record in result}
            
            # 获取协议统计
            result = session.run("""
                MATCH (p:Pool)
                RETURN p.type as type, count(*) as count
            """)
            stats['protocols'] = {record['type']: record['count'] for record in result}
            
            return stats

def parse_trace_line(line: str) -> Tuple[str, str, str, str, str, str]:
    """
    解析单行轨迹数据
    返回: (token0, token1, pool_address, pool_type, function_name, function_result)
    """
    # 匹配 [token0]-[token1] 格式
    token_match = re.match(r'\[(\d+)\] \[(.*?)\]-\[(.*?)\]', line)
    if not token_match:
        return None
    
    # 匹配池子地址、类型和函数
    pool_match = re.search(r'(0x[a-fA-F0-9]{40})\s+(\w+)\s+(\w+)\(', line)
    if not pool_match:
        return None
        
    # 匹配函数结果
    result_match = re.search(r'=>\s*\((.*?)\)', line)
    if not result_match:
        return None
        
    _, token0, token1 = token_match.groups()
    pool_address, pool_type, function_name = pool_match.groups()
    function_result = result_match.group(1)
    
    # 只关注价格相关的函数
    if function_name not in ['slot0', 'getReserves']:
        return None
        
    return token0, token1, pool_address, pool_type, function_name, function_result

def create_graph_from_trace(trace_file: str, allowed_tokens: List[str] = None) -> Tuple[nx.Graph, Dict]:
    """
    从轨迹文件创建图和统计信息，并存储到Neo4j中
    """
    G = nx.Graph()
    stats = {
        'protocols': defaultdict(int),
        'functions': defaultdict(int),
        'token_pairs': defaultdict(int)
    }
    
    # 初始化Neo4j连接
    neo4j_graph = Neo4jGraph()
    
    # 清理数据库
    print("正在清理Neo4j数据库...")
    with neo4j_graph.driver.session() as session:
        # 删除所有约束
        session.run("DROP CONSTRAINT token_address IF EXISTS")
        session.run("DROP CONSTRAINT pool_address IF EXISTS")
        # 删除所有节点和关系
        session.run("MATCH (n) DETACH DELETE n")
    print("数据库清理完成")
    
    # 创建约束
    neo4j_graph.create_constraints()
    
    with open(trace_file, 'r') as f:
        for line in f:
            result = parse_trace_line(line.strip())
            if not result:
                continue
                
            token0, token1, pool_address, pool_type, function_name, function_result = result
            
            if allowed_tokens and (token0 not in allowed_tokens or token1 not in allowed_tokens):
                continue
            
            # 更新统计信息
            stats['protocols'][pool_type] += 1
            stats['functions'][function_name] += 1
            stats['token_pairs'][f"{token0}-{token1}"] += 1
            
            # 添加到NetworkX图
            G.add_node(token0, type='token')
            G.add_node(token1, type='token')
            G.add_node(pool_address, type='pool', pool_type=pool_type)
            
            G.add_edge(token0, pool_address, 
                      function=function_name,
                      result=function_result)
            G.add_edge(token1, pool_address, 
                      function=function_name,
                      result=function_result)
            
            # 添加到Neo4j
            neo4j_graph.create_token(token0)
            neo4j_graph.create_token(token1)
            neo4j_graph.create_pool(pool_address, pool_type)
            neo4j_graph.create_relationship(token0, pool_address, function_name, function_result)
            neo4j_graph.create_relationship(token1, pool_address, function_name, function_result)
    
    neo4j_graph.close()
    return G, stats

def create_plotly_graph(G: nx.Graph, stats: Dict, output_file: str = "trace_analysis_graph.html"):
    """
    使用 plotly 创建交互式网络图
    """
    # 使用 spring_layout 计算节点位置
    pos = nx.spring_layout(G, k=1, iterations=50)
    
    # 准备节点数据
    node_x = []
    node_y = []
    node_text = []
    node_color = []
    node_size = []
    
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
        
        node_data = G.nodes[node]
        if node_data['type'] == 'token':
            node_text.append(f"Token: {node}")
            node_color.append('lightblue')
            node_size.append(20)
        else:
            node_text.append(f"Pool: {node[:10]}...\nType: {node_data['pool_type']}")
            node_color.append('lightgreen')
            node_size.append(15)
    
    # 准备边数据
    edge_x = []
    edge_y = []
    edge_text = []
    
    for edge in G.edges(data=True):
        x0, y0 = pos[edge[0]]
        x1, y1 = pos[edge[1]]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])
        edge_text.append(f"Function: {edge[2]['function']}\nResult: {edge[2]['result']}")
    
    # 创建图形
    fig = go.Figure()
    
    # 添加边
    fig.add_trace(go.Scatter(
        x=edge_x, y=edge_y,
        line=dict(width=0.5, color='#888'),
        hoverinfo='none',
        mode='lines'))
    
    # 添加节点
    fig.add_trace(go.Scatter(
        x=node_x, y=node_y,
        mode='markers+text',
        hoverinfo='text',
        text=node_text,
        marker=dict(
            showscale=False,
            color=node_color,
            size=node_size,
            line_width=2)))
    
    # 更新布局
    fig.update_layout(
        title=dict(
            text='Token Pool Network',
            font=dict(size=16)
        ),
        showlegend=False,
        hovermode='closest',
        margin=dict(b=20,l=5,r=5,t=40),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False))
    
    # 保存为HTML文件
    fig.write_html(output_file)
    return output_file

def main():
    # 示例使用
    trace_file = "data/trace/0x6f0f0298782190d84304a9aacc9504f9ecec8b60481973e623c1ecb5882c9820-analyzed.txt"
    
    # 允许所有token
    allowed_tokens = None
    
    G, stats = create_graph_from_trace(trace_file, allowed_tokens)
    
    # 打印基本统计信息
    print("\n=== 基本统计信息 ===")
    print(f"图中节点数量: {G.number_of_nodes()}")
    print(f"图中边数量: {G.number_of_edges()}")
    print(f"Token节点数量: {len([n for n, d in G.nodes(data=True) if d.get('type') == 'token'])}")
    print(f"池子节点数量: {len([n for n, d in G.nodes(data=True) if d.get('type') == 'pool'])}")
    
    print("\n=== 协议统计 ===")
    for protocol, count in stats['protocols'].items():
        print(f"{protocol}: {count}")
    
    print("\n=== 函数统计 ===")
    for function, count in stats['functions'].items():
        print(f"{function}: {count}")
    
    # 创建交互式图
    # output_file = create_plotly_graph(G, stats)
    # print(f"\n交互式图已生成: {os.path.abspath(output_file)}")
    # print("请在浏览器中打开该文件以查看交互式网络图")
    
    # 获取并打印Neo4j统计信息
    # neo4j_graph = Neo4jGraph()
    # neo4j_stats = neo4j_graph.get_statistics()
    # neo4j_graph.close()
    
    # print("\n=== Neo4j统计信息 ===")
    # print(json.dumps(neo4j_stats, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()  