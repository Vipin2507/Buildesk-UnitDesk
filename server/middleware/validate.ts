import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http.ts";

export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join(".") || "_root";
        (errors[key] ??= []).push(issue.message);
      }
      return next(new HttpError(422, "Validation failed", errors));
    }
    req.body = result.data;
    next();
  };
}
