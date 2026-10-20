# Remotely Save 开发入口

完整开发规范和项目知识统一维护在个人知识库。本文件是加载入口，开始任务前必须实际读取下面文件，不能只看到链接就视为已加载。

## 读取顺序

1. [知识库根规则](../my_obsidan/AGENTS.md) 与 [知识索引](../my_obsidan/知识索引.md)。
2. [个人项目维护规则](../my_obsidan/个人项目/AGENTS.md)。
3. [本项目开发规范](../my_obsidan/个人项目/Remotely%20Save/AGENTS.md)。
4. [项目概览](../my_obsidan/个人项目/Remotely%20Save/概览.md) 与 [项目地图](../my_obsidan/个人项目/Remotely%20Save/Remotely%20Save项目地图.md)。
5. 根据任务读取相关源码、上游文档及目标目录更近的规则。

使用方法与跨工具提示词见 [开发规范使用说明](../my_obsidan/个人项目/Remotely%20Save/开发规范使用说明.md)。

相对路径基于两个仓库同在 github 目录；当前完整规则的绝对路径为：

`/Users/walter/projects/github/my_obsidan/个人项目/Remotely Save/AGENTS.md`

换机器后按实际知识库路径定位。规则无法读取时，报告缺失并在加载完整规则前停止代码修改，不自行推断或生成替代规范。知识库的编辑规则用于笔记维护，代码实现使用本项目开发规范。

## 关键兜底

不覆盖已有未提交改动，不以创建备份分支推断未跟踪文件已备份。提交、推送、安装插件、启用真实同步和发布分别按用户授权执行。凭据与 data.json 不提交或复制到知识库；测试先用可丢弃知识库，不默认接触私密区或远端数据。保留 LICENSE 与各目录授权边界；完整规则在知识库维护，本段仅用于入口不可用时保留必要限制。

<!-- codebase-memory-mcp:start -->
For structural codebase exploration, use the installed `codebase-memory` skill.
<!-- codebase-memory-mcp:end -->
