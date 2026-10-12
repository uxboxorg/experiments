# Thinking orb

A three.js status orb for an AI chat bot. It is modelled on the four clips in `../Thinking orb ref`. Open `index.html` and use the buttons, or append `?state=thinking` to the URL.

The orb is a raymarched soap bubble drawn in one fragment shader. The shader shades the front and back walls of the film, so it keeps the hollow, rim-lit look of the refs. Each state is a set of targets: size, wobble, folds, dents, bulge, droplet, jitter and colour. The orb eases toward the active state's targets, so any state can follow any other.

## States

The states come from how shipping assistants signal status. Amazon's Echo light ring separates **listening**, **thinking** and **speaking**, and the speaking pulse tracks the loudness of the voice. Agent chat UIs add separate states for reasoning, tool calls, streamed text and errors. They also add a state where the bot is waiting on the user, so a single "loading" spinner never hides what is going on.

| State | When to use it | Motion (ref clip) |
|---|---|---|
| `idle` | Ready, nothing in flight | Slow breathing, almost still |
| `listening` | User is typing or speaking | Grows slightly; small dents drift over the film (`0e18…`). `orb.setLevel()` drives it from mic or keystroke rate |
| `thinking` | Reasoning before the first token | Folds run pole to pole and travel around (`008d…`) |
| `researching` | Web search, reading sources | A droplet buds off, slides around the rim and is reabsorbed (`f4c6…`) |
| `working` | Tool calls, editing files, running code | The folds twist into fast spirals |
| `typing` | Streaming the answer | One side swells in a speech-like rhythm (`1074…`). `setLevel()` can drive it from TTS volume |
| `waiting` | Needs approval or input from the user | Smaller, cooler and dimmer, with a slow pulse |
| `error` | A request or tool failed | Shrinks, shivers and turns red |
| `success` (one-shot) | A task just finished | Springy pop and flash, then it returns to the current state |

Skip states the product cannot detect. Without voice input, `listening` can mean "user is typing". Without tools, `working` and `researching` can merge into `thinking`.

## Embedding

```js
orb.setState('thinking');   // any key in STATES, or 'success'
orb.setLevel(0.7);          // 0..1 audio/typing level; null = built-in simulation
```

The canvas has a transparent, premultiplied background, so the orb works on any dark surface. Set `prefers-reduced-motion` to slow every state down.

Sources: [Alexa light ring guidelines](https://developer.amazon.com/alexa/branding/echo-guidelines/identity-guidelines/light-ring), [AI chat UX patterns](https://www.metacto.com/blogs/ai-chat-ux-patterns-production), [Building agent interfaces](https://cdn.jsdelivr.net/npm/@mindstudio-ai/remy@0.1.202/dist/prompt/compiled/agent-interfaces.md).
