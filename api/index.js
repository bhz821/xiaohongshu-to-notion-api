export default {
  async fetch(request, env) {
    const { url } = await request.json();
    const ZHIPU_API_KEY = env.ZHIPU_API_KEY;
    const NOTION_TOKEN = env.NOTION_TOKEN;
    const NOTION_DATABASE_ID = env.NOTION_DATABASE_ID;

    // 1. 抓取小红书页面内容
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });
    const html = await response.text();

    // 2. 提取标题、封面和正文
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const coverMatch = html.match(/"cover":"(.*?)"/);
    const contentMatch = html.match(/"content":"(.*?)"/);
    const title = titleMatch ? titleMatch[1].replace(/ - 小红书$/, "") : "无标题";
    const cover = coverMatch ? coverMatch[1].replace(/\\/g, "") : "";
    const content = contentMatch ? decodeURIComponent(contentMatch[1].replace(/\\u002F/g, "/")) : "无正文";

    // 3. 调用智谱AI总结内容
    const aiResponse = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZHIPU_API_KEY}`
      },
      body: JSON.stringify({
        model: "glm-4",
        messages: [{ role: "user", content: `请总结这篇小红书笔记的核心要点，分三点列出：${content}` }]
      })
    });
    const aiData = await aiResponse.json();
    const summary = aiData.choices[0].message.content;

    // 4. 写入Notion数据库
    await fetch(`https://api.notion.com/v1/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          标题: { title: [{ text: { content: title } }] },
          链接: { url: url },
          摘要: { rich_text: [{ text: { content: summary } }] }
        },
        children: [
          {
            object: "block",
            type: "image",
            image: {
              type: "external",
              external: { url: cover }
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: content } }]
            }
          }
        ]
      })
    });

    return new Response(JSON.stringify({ title, cover, summary }), {
      headers: { "Content-Type
