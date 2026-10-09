import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Valida dados de entrada e lança 400 com a primeira mensagem de erro legível. */
export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    // Mensagens escritas por nós (custom) já são legíveis; só as genéricas ganham o nome do campo.
    const where = issue && issue.path.length && issue.code !== 'custom' ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, `${where}${issue?.message ?? 'Dados inválidos'}`);
  }
  return result.data;
}
