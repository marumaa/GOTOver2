import OpenAI from "openai";

// OpenAI クライアントの初期化（環境変数 OPENAI_API_KEY を使用）
const openai = new OpenAI();

// 環境変数からアシスタントIDを取得
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

export const handler = async function (event, context) {
  // POSTリクエスト以外は405 (Method Not Allowed) を返す
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // リクエストボディのパース
  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (error) {
    console.error("Invalid JSON:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { message, sessionId, language } = parsedBody;
  if (!message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Message is required' })
    };
  }

  // sessionId をスレッドIDとして利用（存在しない場合は新規作成）
  let threadId = sessionId;
  let thread;

  if (!threadId) {
    try {
      thread = await openai.beta.threads.create();
      threadId = thread.id;
      console.log(`New thread created: ${threadId}`);
    } catch (error) {
      console.error('Error creating thread:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to create conversation thread' })
      };
    }
  } else {
    try {
      thread = await openai.beta.threads.retrieve(threadId);
      console.log(`Using existing thread: ${threadId}`);
    } catch (error) {
      console.error(`Error retrieving thread ${threadId}:`, error);
      // スレッドが見つからない場合は新規作成
      try {
        thread = await openai.beta.threads.create();
        threadId = thread.id;
        console.log(`Thread ${sessionId} not found, created new one: ${threadId}`);
      } catch (createError) {
        console.error('Error creating replacement thread:', createError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to create conversation thread' })
        };
      }
    }
  }

  // ユーザーメッセージの作成（言語情報を付加）
  const userMessageContent = `[LANGUAGE: ${language || 'ja'}] ${message}`;

  // ユーザーのメッセージをスレッドに追加
  try {
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: userMessageContent
    });
  } catch (error) {
    console.error('Error adding message to thread:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to add message to conversation' })
    };
  }

  // Runの作成
  let run;
  try {
    run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID
    });
  } catch (error) {
    console.error('Error creating run:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process your request' })
    };
  }

  // Run完了まで待機（最大60秒）
  let runStatus;
  let attempts = 0;
  const maxAttempts = 60;
  try {
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    while (
      !['completed', 'failed', 'cancelled', 'expired'].includes(runStatus.status) &&
      attempts < maxAttempts
    ) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
    }
    if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
      throw new Error(`Run ended with status: ${runStatus.status}`);
    }
    if (attempts >= maxAttempts) {
      throw new Error('Response timed out');
    }
  } catch (error) {
    console.error('Error during run execution:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Error processing message: ${error.message}` })
    };
  }

  // アシスタントの最終応答を取得（最新の1件）
  let finalResponse;
  try {
    finalResponse = await openai.beta.threads.messages.list(threadId, {
      order: 'desc',
      limit: 1
    });
  } catch (error) {
    console.error('Error retrieving messages:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve assistant response' })
    };
  }

  // 応答テキストの抽出と整形
  let responseText = '';
  try {
    if (finalResponse.data && finalResponse.data.length > 0) {
      const latestMessage = finalResponse.data[0];
      if (
        latestMessage.role === 'assistant' &&
        latestMessage.content &&
        latestMessage.content.length > 0
      ) {
        // テキストコンテンツを抽出（typeが'text'のもの）
        const textContent = latestMessage.content.find(item => item.type === 'text');
        if (textContent && textContent.text && textContent.text.value) {
          responseText = textContent.text.value;
          // 「【」で始まる参照部分を削除
          const index = responseText.indexOf('【');
          if (index !== -1) {
            responseText = responseText.substring(0, index) + '.';
          }
          // 〖...〗 で囲まれた部分を削除
          responseText = responseText.replace(/〖.*?〗/g, '');
        } else {
          throw new Error('No text content found in assistant response');
        }
      } else {
        throw new Error('Latest message is not from assistant or is in unexpected format');
      }
    } else {
      throw new Error('No messages found in response');
    }
  } catch (error) {
    console.error('Error processing response text:', error);
    const errorMessages = {
      'en': 'Sorry, I could not generate a proper response. Please try again.',
      'ja': '申し訳ありません。適切な応答を生成できませんでした。もう一度お試しください。',
      'ko': '죄송합니다. 적절한 응답을 생성할 수 없었습니다. 다시 시도해 주세요.',
      'zh': '抱歉，我无法生成适当的回应。请再试一次。'
    };
    responseText = errorMessages[language] || errorMessages['ja'];
  }

  // 最終的なアシスタントの返信とスレッドIDを返す
  return {
    statusCode: 200,
    body: JSON.stringify({
      response: responseText,
      sessionId: threadId
    })
  };
};
