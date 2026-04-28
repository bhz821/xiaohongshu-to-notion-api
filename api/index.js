export default {
  async fetch(request) {
    try {
      const data = await request.json();
      const rawText = data.pasted_text || "";
      const url = (rawText.match(/https?:\/\/\S+/) || [rawText])[0];

      const NOTION_TOKEN = data.notion_api;
      const NOTION_DATABASE_ID = data.database_id;
      const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

      // 1. 快速抓取小红书（超快）
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();
      const title = (html.match(/<title>(.*?)<\/title/)?.[1] || "无标题").replace(" - 小红书", "");
      const content = html.match(/"content":"(.*?)"/)?.[1] || "";

      // 2. AI 解析（必须保留！我知道你要这个）
      const aiRes = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ZHIPU_API_KEY}`
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [
            { role: "user", content: `你是菜谱整理助手，提取：食材、调料、步骤、菜品类型。文本：${content}` }
          ]
        })
      });

      const aiData = await aiRes.json();
      const summary = aiData.choices?.[0]?.message?.content || "AI 处理失败";

      // 3. 写入 Notion
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
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
          children: [
            { type: "paragraph", paragraph: { rich_text: [{ text: { content: content } }] } }
          ]
        })
      });

      return new Response('{"code":200}', { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
};
