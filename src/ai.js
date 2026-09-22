import OpenAI from 'openai';

const initialPrompt = 'You are a read-only file assistant. Explain and review the selected text file. Do not claim to change files, execute commands, or access files beyond the content provided. Be concise and point to relevant lines when possible.';

export function createAi({ baseURL, apiKey, model, database }) {
  if (!baseURL) return null;
  if (!model) throw new Error('AI_MODEL is required when AI_BASE_URL is configured');
  const client = new OpenAI({ apiKey: apiKey || 'ollama', baseURL });
  const prompt = () => database.getSetting('ai.systemPrompt') || initialPrompt;
  if (!database.getSetting('ai.systemPrompt')) database.setSetting('ai.systemPrompt', initialPrompt);
  async function complete({ question, file }) {
    return client.chat.completions.create({ model, stream: true, temperature: 0.2, messages: [{ role: 'system', content: prompt() }, { role: 'user', content: `Selected file: ${file.path}\nLanguage: ${file.language}\n\n${file.content}\n\nQuestion: ${question}` }] });
  }
  return { prompt, setPrompt: (value) => database.setSetting('ai.systemPrompt', String(value).slice(0, 20_000)), complete, model };
}

export async function streamWords(stream, send) {
  let buffer = '';
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content || '';
    buffer += text;
    const match = buffer.match(/^(.*?(?:\s+|[.!?,;:])|.+)$/s);
    if (match && (match[1].length < buffer.length || /\s|[.!?,;:]$/.test(buffer))) { send(match[1]); buffer = buffer.slice(match[1].length); }
  }
  if (buffer) send(buffer);
}
