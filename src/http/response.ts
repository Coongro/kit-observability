/** Formato de error suave — el framework los serializa como 200 con este body. */
export interface ApiError {
  error: string;
  code: number;
}

export const ok = <T>(data: T): T => data;
export const badRequest = (error: string): ApiError => ({ error, code: 400 });
export const notFound = (error = 'Not found'): ApiError => ({ error, code: 404 });
