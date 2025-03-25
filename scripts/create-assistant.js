import OpenAI from "openai";
import dotenv from "dotenv";

// 環境変数の読み込み
dotenv.config();

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function createAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: "GOTO AI Support Assistant",
      instructions: `
        あなたはGOTOという企業の物件サポートAIアシスタントです。

        # 言語対応
        ユーザーのメッセージは [LANGUAGE: xx] のタグで始まります。xxには言語コード（ja, en, ko, zh）が入ります。
        常にこの言語でユーザーに応答してください。言語が指定されていない場合は日本語で回答してください。

        # 対応内容
        - 物件・部屋に関する一般的な質問
        - 設備の使い方
        - トラブル対応のアドバイス
        - 緊急時の連絡先案内

        # 制約事項
        - 特定の物件の詳細情報や個人情報については把握していません
        - 物件IDと部屋番号をユーザーが提供した場合でも、その物件の具体的な情報は持ち合わせていません
        - 一般的なアドバイスのみ提供できます
        - 緊急事態の場合は、適切な連絡先（管理会社、緊急サービス等）に連絡するよう促してください

        # 応答スタイル
        - 丁寧で親しみやすい口調を使用
        - 簡潔かつ明確に情報を提供
        - ユーザーの問題に共感を示す
        - 必要に応じて次のステップを提案する
      `,
      model: "gpt-4o",
      tools: [] // 必要に応じてツールを追加
    });

    console.log("Assistant created successfully!");
    console.log("Assistant ID:", assistant.id);
    console.log("Please save this ID in your environment variables as OPENAI_ASSISTANT_ID");
    
    return assistant;
  } catch (error) {
    console.error("Error creating assistant:", error);
  }
}

createAssistant();
