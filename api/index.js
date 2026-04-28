export default {
  async fetch(request) {
    try {
      // 接收快捷指令传来的所有数据
      const data = await request.json();
      
      // 从请求里拿参数（完全沿用你快捷指令的格式）
      const url = data.url;
      const NOTION_TOKEN = data.notionToken;
      const NOTION_DATABASE_ID = data.databaseId;
      const ZHIPU_API_KEY = data.zhipuApiKey;

      // 抓取小红书页面
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      });
      const html = await res.text();

      // 提取标题、正文、所有图片
      const title = html.match(/<title>(.*?)<\/title>/)?.[1].replace(" - 小红书", "") || "无标题";
      const content = html.match(/"content":"(.*?)"/)?.[1] || "";
      const imgs = [...html.matchAll(/"url":"(https?:\/\/[^\s]+?\.jpg)"/g)].map(i => i[1].replace(/\\/g, ""));

      // AI 提取：原料 / 调料 / 步骤 / 类型（严格按你需求）
      const aiRes = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZHIPU_API_KEY}`
        },
        body: JSON.stringify({
          model: "glm-4",
          messages: [{
            role: "user",
            content: `分析这篇菜谱，提取4项内容：1.原料 2.调料 3.步骤 4.菜品类型。文本：${content}`
          }]
        })
      });
      const aiData = await aiRes.json();
      const summary = aiData.choices[0].message.content;

      // 推送到 Notion（格式和你原来案例完全一样，不改动）
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28"
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_DATABASE_ID },
          properties: {
            "标题": { title: [{ text: { content: title } }] },
            "链接": { url: url },
            "AI总结": { rich_text: [{ text: { content: summary } }] }
          },
          children: imgs.map(img => ({
            object: "block",
            type: "image",
            image: { external: { url: img } }
          })).concat([{
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ text: { content: content } }] }
          }])
        })
      });

      return new Response(JSON.stringify({ code: 200, msg: "保存成功" }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
  }
};
