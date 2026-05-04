import { PromptRepository } from "./prompt-repository.js";
import { EventService } from "../events/event.service.js";
import type { Prompt } from "./prompt.types.js";

export class PromptCaptureService {
  private repository = new PromptRepository();
  private eventService = new EventService();

  async capture(sessionId: string, content: string): Promise<Prompt> {
    const prompt = this.repository.create(sessionId, content);

    await this.eventService.emit({
      sessionId,
      type: "PROMPT_CAPTURED",
      payload: {
        promptId: prompt.id,
        content: prompt.content,
      },
    });

    return prompt;
  }

  getSessionPrompts(sessionId: string): Prompt[] {
    return this.repository.getBySession(sessionId);
  }

  getPrompt(id: string): Prompt | null {
    return this.repository.getById(id);
  }
}
