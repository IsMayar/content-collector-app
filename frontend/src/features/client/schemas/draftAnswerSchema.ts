import { z } from 'zod'
import { answer } from './answerSchema'
export const draftValue = z.union([
  z.object({ text: z.string() }).strict(),
  z.object({ url: z.string() }).strict(),
  z.object({ optionKey: z.string() }).strict(),
  z.object({ optionKeys: z.array(z.string()) }).strict(),
  z.object({ assetIds: z.array(z.string()) }).strict(),
  z
    .object({
      rows: z.array(
        z.object({
          rowId: z.string(),
          values: z.record(
            z.string(),
            z.union([z.string(), z.number(), z.array(z.string())]),
          ),
        }),
      ),
    })
    .strict(),
  z.object({}).strict(),
])
export const savedDraftAnswer = answer.extend({ value: draftValue })
