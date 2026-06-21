import openAIIcon from "@lobehub/icons-static-svg/icons/openai.svg?url"
import claudeIcon from "@lobehub/icons-static-svg/icons/claude-color.svg?url"
import geminiIcon from "@lobehub/icons-static-svg/icons/gemini-color.svg?url"
import googleIcon from "@lobehub/icons-static-svg/icons/google-color.svg?url"
import metaIcon from "@lobehub/icons-static-svg/icons/meta-color.svg?url"
import mistralIcon from "@lobehub/icons-static-svg/icons/mistral-color.svg?url"
import deepSeekIcon from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url"
import qwenIcon from "@lobehub/icons-static-svg/icons/qwen-color.svg?url"
import xAIIcon from "@lobehub/icons-static-svg/icons/xai.svg?url"
import cohereIcon from "@lobehub/icons-static-svg/icons/cohere-color.svg?url"
import awsIcon from "@lobehub/icons-static-svg/icons/aws-color.svg?url"
import microsoftIcon from "@lobehub/icons-static-svg/icons/microsoft-color.svg?url"
import nvidiaIcon from "@lobehub/icons-static-svg/icons/nvidia-color.svg?url"
import perplexityIcon from "@lobehub/icons-static-svg/icons/perplexity-color.svg?url"
import nousIcon from "@lobehub/icons-static-svg/icons/nousresearch.svg?url"
import kimiIcon from "@lobehub/icons-static-svg/icons/kimi-color.svg?url"
import minimaxIcon from "@lobehub/icons-static-svg/icons/minimax-color.svg?url"
import zaiIcon from "@lobehub/icons-static-svg/icons/zai.svg?url"
import liquidIcon from "@lobehub/icons-static-svg/icons/liquid.svg?url"
import ai21Icon from "@lobehub/icons-static-svg/icons/ai21-brand-color.svg?url"
import yiIcon from "@lobehub/icons-static-svg/icons/yi-color.svg?url"
import huggingFaceIcon from "@lobehub/icons-static-svg/icons/huggingface-color.svg?url"
import groqIcon from "@lobehub/icons-static-svg/icons/groq.svg?url"
import togetherIcon from "@lobehub/icons-static-svg/icons/together-color.svg?url"
import fireworksIcon from "@lobehub/icons-static-svg/icons/fireworks-color.svg?url"
import cerebrasIcon from "@lobehub/icons-static-svg/icons/cerebras-color.svg?url"
import ibmIcon from "@lobehub/icons-static-svg/icons/ibm.svg?url"
import bytedanceIcon from "@lobehub/icons-static-svg/icons/bytedance-color.svg?url"
import tencentIcon from "@lobehub/icons-static-svg/icons/tencent-color.svg?url"
import openRouterIcon from "@lobehub/icons-static-svg/icons/openrouter.svg?url"
import kiloCodeIcon from "@lobehub/icons-static-svg/icons/kilocode.svg?url"
import openCodeIcon from "@lobehub/icons-static-svg/icons/opencode.svg?url"
import { Sparkles } from "lucide-react"
import type { ChatModel } from "@/lib/chat-types"
import { cn } from "@/lib/utils"

type BrandIcon = { src: string; invertOnDark?: boolean }

const iconRules: Array<{ pattern: RegExp; icon: BrandIcon }> = [
  { pattern: /anthropic|claude/, icon: { src: claudeIcon } },
  {
    pattern: /openai|chatgpt|\bgpt[- ]|\bo[134][-. ]/,
    icon: { src: openAIIcon, invertOnDark: true },
  },
  { pattern: /gemini|gemma/, icon: { src: geminiIcon } },
  { pattern: /google/, icon: { src: googleIcon } },
  { pattern: /meta|llama/, icon: { src: metaIcon } },
  { pattern: /mistral|mixtral|codestral/, icon: { src: mistralIcon } },
  { pattern: /deepseek/, icon: { src: deepSeekIcon } },
  { pattern: /qwen|alibaba/, icon: { src: qwenIcon } },
  { pattern: /x-ai|\bxai\b|grok/, icon: { src: xAIIcon, invertOnDark: true } },
  { pattern: /cohere|command-r/, icon: { src: cohereIcon } },
  { pattern: /amazon|\baws\b|bedrock|\bnova[- :]/, icon: { src: awsIcon } },
  { pattern: /microsoft|\bphi[- :]/, icon: { src: microsoftIcon } },
  { pattern: /nvidia|nemotron/, icon: { src: nvidiaIcon } },
  { pattern: /perplexity|sonar/, icon: { src: perplexityIcon } },
  {
    pattern: /nousresearch|nous-hermes/,
    icon: { src: nousIcon, invertOnDark: true },
  },
  { pattern: /moonshot|\bkimi\b/, icon: { src: kimiIcon } },
  { pattern: /minimax/, icon: { src: minimaxIcon } },
  {
    pattern: /zhipu|z-ai|\bzai\b|\bglm[- :]/,
    icon: { src: zaiIcon, invertOnDark: true },
  },
  { pattern: /liquid/, icon: { src: liquidIcon, invertOnDark: true } },
  { pattern: /ai21|jamba/, icon: { src: ai21Icon } },
  { pattern: /01-ai|\byi[- :]/, icon: { src: yiIcon } },
  { pattern: /huggingface|hugging-face/, icon: { src: huggingFaceIcon } },
  { pattern: /\bgroq\b/, icon: { src: groqIcon, invertOnDark: true } },
  { pattern: /together/, icon: { src: togetherIcon } },
  { pattern: /fireworks/, icon: { src: fireworksIcon } },
  { pattern: /cerebras/, icon: { src: cerebrasIcon } },
  { pattern: /\bibm\b|granite/, icon: { src: ibmIcon, invertOnDark: true } },
  { pattern: /bytedance|doubao/, icon: { src: bytedanceIcon } },
  { pattern: /tencent|hunyuan/, icon: { src: tencentIcon } },
  { pattern: /openrouter/, icon: { src: openRouterIcon, invertOnDark: true } },
  { pattern: /kilo(?:code)?/, icon: { src: kiloCodeIcon } },
  { pattern: /opencode/, icon: { src: openCodeIcon, invertOnDark: true } },
]

export function modelBrandIcon(model: ChatModel) {
  const identity = `${model.id} ${model.name} ${model.owner}`.toLocaleLowerCase(
    "en"
  )
  return iconRules.find((rule) => rule.pattern.test(identity))?.icon ?? null
}

export function ModelIcon({
  model,
  className,
}: {
  model: ChatModel
  className?: string
}) {
  const icon = modelBrandIcon(model)
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background p-1.5",
        className
      )}
      aria-hidden="true"
    >
      {model.provider === "lumy" ? (
        <Sparkles className="size-full text-primary" />
      ) : icon ? (
        <img
          src={icon.src}
          alt=""
          className={cn(
            "size-full object-contain",
            icon.invertOnDark && "dark:invert"
          )}
          data-testid="model-brand-icon"
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {model.owner.trim().charAt(0).toUpperCase() || "IA"}
        </span>
      )}
    </span>
  )
}
