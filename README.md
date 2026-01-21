# stina-ext-openai

OpenAI AI Provider extension for [Stina](https://stina.app).

Connect Stina to OpenAI's AI models including GPT-4o, GPT-4 Turbo, and reasoning models (o1, o3, o4-mini).

## Features

- **All GPT Models** - GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- **Reasoning Models** - o1, o3, o4-mini with thinking/reasoning support
- **Streaming** - Real-time response streaming via SSE
- **Tool/Function Calling** - Full support for function calling
- **Configurable** - Custom base URL, organization ID, reasoning effort

## Installation

1. Download the latest release or build from source
2. Copy the extension to your Stina extensions folder
3. Configure your OpenAI API key in settings

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your OpenAI API key (required) | - |
| Base URL | API endpoint URL | `https://api.openai.com/v1` |
| Organization ID | Optional OpenAI org ID | - |
| Reasoning Effort | Thinking depth for o-series models | `medium` |

## Supported Models

### GPT Models
- `gpt-4o` - Latest and most capable model
- `gpt-4o-mini` - Smaller, faster version
- `gpt-4-turbo` - High capability with vision support
- `gpt-3.5-turbo` - Fast and cost-effective

### Reasoning Models (o-series)
- `o1` - Deep reasoning capabilities
- `o1-mini` - Faster reasoning model
- `o3` - Next-generation reasoning
- `o3-mini` - Efficient reasoning
- `o4-mini` - Latest mini reasoning model

Reasoning models support configurable "reasoning effort" (low/medium/high) that controls the depth of the model's thinking process.

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Build

```bash
pnpm install
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Check

```bash
pnpm typecheck
```

## API

This extension uses the OpenAI [Responses API](https://platform.openai.com/docs/api-reference/responses) with SSE streaming.

## License

MIT
